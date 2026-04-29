package service

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
)

type SlackChannel struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type SlackService struct {
	token      string
	httpClient *http.Client
}

func NewSlackService(token string) *SlackService {
	return &SlackService{
		token:      token,
		httpClient: &http.Client{},
	}
}

func (s *SlackService) IsConfigured() bool {
	return s.token != ""
}

// ListChannels returns public channels the bot can see.
func (s *SlackService) ListChannels() ([]SlackChannel, error) {
	var allChannels []SlackChannel
	cursor := ""

	for {
		params := url.Values{}
		params.Set("types", "public_channel,private_channel")
		params.Set("exclude_archived", "true")
		params.Set("limit", "200")
		if cursor != "" {
			params.Set("cursor", cursor)
		}

		req, err := http.NewRequest("GET", "https://slack.com/api/conversations.list?"+params.Encode(), nil)
		if err != nil {
			return nil, fmt.Errorf("slack: build request: %w", err)
		}
		req.Header.Set("Authorization", "Bearer "+s.token)

		resp, err := s.httpClient.Do(req)
		if err != nil {
			return nil, fmt.Errorf("slack: request failed: %w", err)
		}

		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()

		var result struct {
			OK       bool `json:"ok"`
			Channels []struct {
				ID   string `json:"id"`
				Name string `json:"name"`
			} `json:"channels"`
			ResponseMetadata struct {
				NextCursor string `json:"next_cursor"`
			} `json:"response_metadata"`
			Error string `json:"error"`
		}
		if err := json.Unmarshal(body, &result); err != nil {
			return nil, fmt.Errorf("slack: decode response: %w", err)
		}
		if !result.OK {
			return nil, fmt.Errorf("slack: API error: %s", result.Error)
		}

		for _, ch := range result.Channels {
			allChannels = append(allChannels, SlackChannel{ID: ch.ID, Name: ch.Name})
		}

		if result.ResponseMetadata.NextCursor == "" {
			break
		}
		cursor = result.ResponseMetadata.NextCursor
	}

	return allChannels, nil
}

// SlackBlock represents a Slack Block Kit block.
type SlackBlock map[string]any

// PostMessage sends a Block Kit message to a Slack channel.
func (s *SlackService) PostMessage(channelID string, blocks []SlackBlock) error {
	payload := map[string]any{
		"channel": channelID,
		"blocks":  blocks,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("slack: marshal payload: %w", err)
	}

	req, err := http.NewRequest("POST", "https://slack.com/api/chat.postMessage", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("slack: build request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+s.token)
	req.Header.Set("Content-Type", "application/json; charset=utf-8")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("slack: request failed: %w", err)
	}

	respBody, _ := io.ReadAll(resp.Body)
	resp.Body.Close()

	var result struct {
		OK    bool   `json:"ok"`
		Error string `json:"error"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return fmt.Errorf("slack: decode response: %w", err)
	}
	if !result.OK {
		return fmt.Errorf("slack: post failed: %s", result.Error)
	}

	slog.Info("slack: message posted", "channel", channelID)
	return nil
}
