#!/usr/bin/env bash
set -euo pipefail

# Seed script for populating Multica with test data.
# Requires: server running at localhost:8080, jq installed.
# Usage: bash scripts/seed-test-data.sh

API="http://localhost:8080"
COOKIE_JAR="/tmp/multica-seed-cookies.txt"
SERVER_LOG="/tmp/multica-seed-server.log"

# Dates: last Sunday = 2026-04-26, sprint is 2 weeks
SPRINT_START="2026-04-26T00:00:00Z"
SPRINT_END="2026-05-10T23:59:59Z"
CYCLE2_START="2026-05-11T00:00:00Z"
CYCLE2_END="2026-05-24T23:59:59Z"

get_csrf() {
  local jar="$1"
  grep multica_csrf "$jar" 2>/dev/null | awk '{print $NF}' | tail -1
}

api() {
  local method=$1 path=$2
  shift 2
  local csrf
  csrf=$(get_csrf "$COOKIE_JAR")
  curl -s -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
    -H "Content-Type: application/json" \
    -H "X-Workspace-ID: $WS_ID" \
    -H "X-CSRF-Token: ${csrf}" \
    -X "$method" "${API}${path}" "$@"
}

echo "==> Step 1: Create user accounts"

# We need 5 users: Masud (owner), Sarah (admin), Jake, Priya, Alex
declare -a EMAILS=("masud@multica.ai" "sarah@multica.ai" "jake@multica.ai" "priya@multica.ai" "alex@multica.ai")
declare -a NAMES=("Masud Vali" "Sarah Chen" "Jake Morrison" "Priya Sharma" "Alex Rivera")
declare -a AVATARS=(
  "https://i.pravatar.cc/150?u=masud"
  "https://i.pravatar.cc/150?u=sarah"
  "https://i.pravatar.cc/150?u=jake"
  "https://i.pravatar.cc/150?u=priya"
  "https://i.pravatar.cc/150?u=alex"
)
declare -a COOKIES=()
declare -a USER_IDS=()

# Capture server logs to extract verification codes
BACKEND_PID=$(lsof -ti:8080 2>/dev/null | head -1 || true)

for i in "${!EMAILS[@]}"; do
  email="${EMAILS[$i]}"
  name="${NAMES[$i]}"
  avatar="${AVATARS[$i]}"
  cookie="/tmp/multica-seed-cookie-${i}.txt"
  COOKIES+=("$cookie")

  echo "  Creating user: $name ($email)"

  # Send verification code
  curl -s -c "$cookie" -H "Content-Type: application/json" \
    -X POST "${API}/auth/send-code" \
    -d "{\"email\":\"${email}\"}" > /dev/null

  # Read code from server logs (dev mode prints to stdout)
  sleep 0.5
  CODE=$(grep -o "Verification code for ${email}: [0-9]*" /tmp/multica-server.log 2>/dev/null | tail -1 | grep -o '[0-9]*$' || true)

  if [ -z "$CODE" ]; then
    # Try reading from the database directly
    CODE=$(docker exec multica-postgres-1 psql -U multica -d multica -t -A \
      -c "SELECT code FROM verification_code WHERE email='${email}' ORDER BY created_at DESC LIMIT 1;" 2>/dev/null || true)
    CODE=$(echo "$CODE" | tr -d '[:space:]')
  fi

  if [ -z "$CODE" ]; then
    echo "    ERROR: Could not get verification code for $email"
    echo "    Trying direct DB query..."
    CODE=$(docker exec multica-postgres-1 psql -U multica -d multica -t -A \
      -c "SELECT code FROM verification_code WHERE email='${email}' ORDER BY created_at DESC LIMIT 1;")
    CODE=$(echo "$CODE" | tr -d '[:space:]')
  fi

  echo "    Code: $CODE"

  # Verify code (creates user + session)
  VERIFY_RESULT=$(curl -s -b "$cookie" -c "$cookie" -H "Content-Type: application/json" \
    -X POST "${API}/auth/verify-code" \
    -d "{\"email\":\"${email}\",\"code\":\"${CODE}\"}")

  USER_ID=$(echo "$VERIFY_RESULT" | jq -r '.user.id // empty')
  if [ -z "$USER_ID" ]; then
    echo "    ERROR: Verify failed: $VERIFY_RESULT"
    exit 1
  fi
  USER_IDS+=("$USER_ID")
  echo "    User ID: $USER_ID"

  # Update name and avatar
  user_csrf_token=$(get_csrf "$cookie")
  curl -s -b "$cookie" -c "$cookie" -H "Content-Type: application/json" \
    -H "X-CSRF-Token: ${user_csrf_token}" \
    -X PATCH "${API}/api/me" \
    -d "{\"name\":\"${name}\",\"avatar_url\":\"${avatar}\"}" > /dev/null

  # Complete onboarding
  curl -s -b "$cookie" -c "$cookie" -H "Content-Type: application/json" \
    -H "X-CSRF-Token: ${user_csrf_token}" \
    -X POST "${API}/api/me/onboarding/complete" > /dev/null 2>&1 || true

  echo "    Done: $name"
done

echo ""
echo "==> Step 2: Create workspace (as Masud)"
COOKIE_JAR="${COOKIES[0]}"
WS_CSRF=$(get_csrf "$COOKIE_JAR")
WS_RESULT=$(curl -s -b "$COOKIE_JAR" -c "$COOKIE_JAR" -H "Content-Type: application/json" \
  -H "X-CSRF-Token: ${WS_CSRF}" \
  -X POST "${API}/api/workspaces" \
  -d '{"name":"Acme Corp","slug":"acme"}')
WS_ID=$(echo "$WS_RESULT" | jq -r '.id')
echo "  Workspace ID: $WS_ID"

echo ""
echo "==> Step 3: Invite other members"
for i in 1 2 3 4; do
  email="${EMAILS[$i]}"
  role="member"
  if [ "$i" -eq 1 ]; then role="admin"; fi

  echo "  Inviting $email as $role"
  INV_RESULT=$(api POST "/api/workspaces/${WS_ID}/members" \
    -d "{\"email\":\"${email}\",\"role\":\"${role}\"}")
  INV_ID=$(echo "$INV_RESULT" | jq -r '.id // empty')

  if [ -n "$INV_ID" ]; then
    # Accept invitation as the invited user
    user_csrf=$(get_csrf "${COOKIES[$i]}")
    curl -s -b "${COOKIES[$i]}" -c "${COOKIES[$i]}" -H "Content-Type: application/json" \
      -H "X-CSRF-Token: ${user_csrf}" \
      -X POST "${API}/api/invitations/${INV_ID}/accept" > /dev/null
    echo "    Accepted invitation"
  else
    echo "    ERROR: $INV_RESULT"
  fi
done

# Get member IDs (user_id -> member mapping)
echo ""
echo "==> Step 4: Get member list"
MEMBERS=$(api GET "/api/workspaces/${WS_ID}/members")
echo "$MEMBERS" | jq -r '.[] | "\(.name) -> \(.user_id) (role: \(.role))"'

# Extract user IDs for assignment
MASUD_UID="${USER_IDS[0]}"
SARAH_UID="${USER_IDS[1]}"
JAKE_UID="${USER_IDS[2]}"
PRIYA_UID="${USER_IDS[3]}"
ALEX_UID="${USER_IDS[4]}"

echo ""
echo "==> Step 5: Create teams"
CLI_TEAM=$(api POST "/api/teams" -d '{"name":"Client Engineering","identifier":"CLI","color":"blue","icon":"rocket"}')
CLI_TEAM_ID=$(echo "$CLI_TEAM" | jq -r '.id')
echo "  CLI team: $CLI_TEAM_ID"

OPS_TEAM=$(api POST "/api/teams" -d '{"name":"Operations","identifier":"OPS","color":"amber","icon":"gear"}')
OPS_TEAM_ID=$(echo "$OPS_TEAM" | jq -r '.id')
echo "  OPS team: $OPS_TEAM_ID"

echo ""
echo "==> Step 6: Create labels"
for lbl in "bug:red" "feature:blue" "improvement:purple" "documentation:gray" "urgent:orange" "design:pink" "backend:green" "frontend:amber" "infrastructure:indigo" "security:teal"; do
  name="${lbl%%:*}"
  color="${lbl#*:}"
  RESULT=$(api POST "/api/labels" -d "{\"name\":\"${name}\",\"color\":\"${color}\"}")
  LBL_ID=$(echo "$RESULT" | jq -r '.id')
  echo "  Label: $name ($color) -> $LBL_ID"
done

# Get label IDs
LABELS_JSON=$(api GET "/api/labels")
get_label_id() {
  echo "$LABELS_JSON" | jq -r ".labels[] | select(.name==\"$1\") | .id"
}
LABEL_BUG=$(get_label_id "bug")
LABEL_FEATURE=$(get_label_id "feature")
LABEL_IMPROVEMENT=$(get_label_id "improvement")
LABEL_DOCUMENTATION=$(get_label_id "documentation")
LABEL_URGENT=$(get_label_id "urgent")
LABEL_DESIGN=$(get_label_id "design")
LABEL_BACKEND=$(get_label_id "backend")
LABEL_FRONTEND=$(get_label_id "frontend")
LABEL_INFRA=$(get_label_id "infrastructure")
LABEL_SECURITY=$(get_label_id "security")

echo ""
echo "==> Step 7: Create cycles"
# CLI team cycles
CLI_CYCLE1=$(api POST "/api/teams/${CLI_TEAM_ID}/cycles" \
  -d "{\"name\":\"CLI Sprint 1\",\"description\":\"First client engineering sprint - foundation work\",\"starts_at\":\"${SPRINT_START}\",\"ends_at\":\"${SPRINT_END}\"}")
CLI_CYCLE1_ID=$(echo "$CLI_CYCLE1" | jq -r '.id')
echo "  CLI Cycle 1: $CLI_CYCLE1_ID"

CLI_CYCLE2=$(api POST "/api/teams/${CLI_TEAM_ID}/cycles" \
  -d "{\"name\":\"CLI Sprint 2\",\"description\":\"Second sprint - feature delivery\",\"starts_at\":\"${CYCLE2_START}\",\"ends_at\":\"${CYCLE2_END}\"}")
CLI_CYCLE2_ID=$(echo "$CLI_CYCLE2" | jq -r '.id')
echo "  CLI Cycle 2: $CLI_CYCLE2_ID"

# OPS team cycles
OPS_CYCLE1=$(api POST "/api/teams/${OPS_TEAM_ID}/cycles" \
  -d "{\"name\":\"OPS Sprint 1\",\"description\":\"Operations sprint - infrastructure and monitoring\",\"starts_at\":\"${SPRINT_START}\",\"ends_at\":\"${SPRINT_END}\"}")
OPS_CYCLE1_ID=$(echo "$OPS_CYCLE1" | jq -r '.id')
echo "  OPS Cycle 1: $OPS_CYCLE1_ID"

OPS_CYCLE2=$(api POST "/api/teams/${OPS_TEAM_ID}/cycles" \
  -d "{\"name\":\"OPS Sprint 2\",\"description\":\"Operations sprint - automation and scaling\",\"starts_at\":\"${CYCLE2_START}\",\"ends_at\":\"${CYCLE2_END}\"}")
OPS_CYCLE2_ID=$(echo "$OPS_CYCLE2" | jq -r '.id')
echo "  OPS Cycle 2: $OPS_CYCLE2_ID"

echo ""
echo "==> Step 8: Create projects"
PROJ_CLIENTS=$(api POST "/api/projects" -d "{
  \"title\":\"Client Portal v2\",
  \"description\":\"Complete redesign of the client-facing portal with real-time dashboards, improved onboarding flow, and self-service analytics. Target: 50% reduction in support tickets.\",
  \"icon\":\"🚀\",
  \"status\":\"in_progress\",
  \"priority\":\"urgent\",
  \"lead_type\":\"member\",
  \"lead_id\":\"${MASUD_UID}\",
  \"team_id\":\"${CLI_TEAM_ID}\",
  \"start_date\":\"2026-04-26\",
  \"target_date\":\"2026-05-26\"
}")
PROJ_CLIENTS_ID=$(echo "$PROJ_CLIENTS" | jq -r '.id')
echo "  Client Portal v2: $PROJ_CLIENTS_ID"

PROJ_OPS=$(api POST "/api/projects" -d "{
  \"title\":\"Infrastructure Modernization\",
  \"description\":\"Migrate from monolithic deployment to containerized microservices. Implement observability stack (Prometheus, Grafana, Loki). Zero-downtime deployment pipeline. Target: 99.95% uptime SLA.\",
  \"icon\":\"⚙️\",
  \"status\":\"in_progress\",
  \"priority\":\"high\",
  \"lead_type\":\"member\",
  \"lead_id\":\"${SARAH_UID}\",
  \"team_id\":\"${OPS_TEAM_ID}\",
  \"start_date\":\"2026-04-26\",
  \"target_date\":\"2026-05-26\"
}")
PROJ_OPS_ID=$(echo "$PROJ_OPS" | jq -r '.id')
echo "  Infrastructure Modernization: $PROJ_OPS_ID"

echo ""
echo "==> Step 9: Create issues for Client Portal (CLI team)"

create_issue() {
  local title="$1" desc="$2" status="$3" priority="$4" assignee_type="$5" assignee_id="$6" \
        team_id="$7" project_id="$8" cycle_id="$9" estimate="${10}" due_date="${11}" start_date="${12}"

  local body="{\"title\":\"${title}\",\"description\":\"${desc}\",\"status\":\"${status}\",\"priority\":\"${priority}\""
  body+=",\"team_id\":\"${team_id}\""
  if [ -n "$assignee_type" ] && [ "$assignee_type" != "null" ]; then
    body+=",\"assignee_type\":\"${assignee_type}\",\"assignee_id\":\"${assignee_id}\""
  fi
  if [ -n "$project_id" ] && [ "$project_id" != "null" ]; then
    body+=",\"project_id\":\"${project_id}\""
  fi
  if [ -n "$cycle_id" ] && [ "$cycle_id" != "null" ]; then
    body+=",\"cycle_id\":\"${cycle_id}\""
  fi
  if [ -n "$estimate" ] && [ "$estimate" != "0" ] && [ "$estimate" != "null" ]; then
    body+=",\"estimate\":${estimate}"
  fi
  if [ -n "$due_date" ] && [ "$due_date" != "null" ]; then
    body+=",\"due_date\":\"${due_date}\""
  fi
  if [ -n "$start_date" ] && [ "$start_date" != "null" ]; then
    body+=",\"start_date\":\"${start_date}\""
  fi
  body+="}"

  local result
  result=$(api POST "/api/issues" -d "$body")
  local id
  id=$(echo "$result" | jq -r '.id // empty')
  if [ -z "$id" ]; then
    echo "    ERROR creating issue '$title': $result" >&2
    return
  fi
  echo "$id"
}

set_labels() {
  local issue_id="$1"
  shift
  local ids="["
  local first=true
  for lid in "$@"; do
    if [ "$first" = true ]; then first=false; else ids+=","; fi
    ids+="\"${lid}\""
  done
  ids+="]"
  api PUT "/api/issues/${issue_id}/labels" -d "{\"label_ids\":${ids}}" > /dev/null
}

echo "  Creating CLI Sprint 1 issues..."

# CLI Sprint 1 - 12 issues across team members, various states
I1=$(create_issue "Design new dashboard layout" \
  "Create wireframes and high-fidelity mockups for the new client dashboard. Include responsive breakpoints for mobile/tablet/desktop. Must support dark mode." \
  "done" "high" "member" "$PRIYA_UID" "$CLI_TEAM_ID" "$PROJ_CLIENTS_ID" "$CLI_CYCLE1_ID" "5" "2026-04-30T00:00:00Z" "2026-04-26")
set_labels "$I1" "$LABEL_DESIGN" "$LABEL_FRONTEND"
echo "    $I1 - Design new dashboard layout (done, 5pt)"

I2=$(create_issue "Implement authentication flow" \
  "Build OAuth2 + magic link authentication. Support Google, GitHub SSO. Include rate limiting, session management, and CSRF protection." \
  "done" "urgent" "member" "$MASUD_UID" "$CLI_TEAM_ID" "$PROJ_CLIENTS_ID" "$CLI_CYCLE1_ID" "8" "2026-04-29T00:00:00Z" "2026-04-26")
set_labels "$I2" "$LABEL_FEATURE" "$LABEL_BACKEND" "$LABEL_SECURITY"
echo "    $I2 - Implement authentication flow (done, 8pt)"

I3=$(create_issue "Build real-time notification system" \
  "WebSocket-based notification system for issue updates, mentions, and assignment changes. Must support offline queuing and reconnection." \
  "done" "high" "member" "$JAKE_UID" "$CLI_TEAM_ID" "$PROJ_CLIENTS_ID" "$CLI_CYCLE1_ID" "8" "2026-05-02T00:00:00Z" "2026-04-27")
set_labels "$I3" "$LABEL_FEATURE" "$LABEL_BACKEND"
echo "    $I3 - Build real-time notification system (done, 8pt)"

I4=$(create_issue "Create API rate limiting middleware" \
  "Implement token bucket rate limiting per API key. Support burst allowance. Add rate limit headers to responses (X-RateLimit-Remaining, X-RateLimit-Reset)." \
  "in_review" "medium" "member" "$ALEX_UID" "$CLI_TEAM_ID" "$PROJ_CLIENTS_ID" "$CLI_CYCLE1_ID" "5" "2026-05-04T00:00:00Z" "2026-04-28")
set_labels "$I4" "$LABEL_BACKEND" "$LABEL_SECURITY"
echo "    $I4 - Create API rate limiting middleware (in_review, 5pt)"

I5=$(create_issue "Fix pagination bug in issue list" \
  "Cursor-based pagination returns duplicate items when issues are updated between page fetches. Need to use stable sort key (created_at + id)." \
  "done" "urgent" "member" "$MASUD_UID" "$CLI_TEAM_ID" "$PROJ_CLIENTS_ID" "$CLI_CYCLE1_ID" "3" "2026-04-28T00:00:00Z" "2026-04-26")
set_labels "$I5" "$LABEL_BUG" "$LABEL_URGENT" "$LABEL_BACKEND"
echo "    $I5 - Fix pagination bug (done, 3pt)"

I6=$(create_issue "Implement drag-and-drop board view" \
  "Kanban board with drag-and-drop for status changes. Support multi-select drag, keyboard accessibility, and optimistic updates." \
  "in_progress" "high" "member" "$PRIYA_UID" "$CLI_TEAM_ID" "$PROJ_CLIENTS_ID" "$CLI_CYCLE1_ID" "8" "2026-05-06T00:00:00Z" "2026-04-29")
set_labels "$I6" "$LABEL_FEATURE" "$LABEL_FRONTEND"
echo "    $I6 - Implement drag-and-drop board view (in_progress, 8pt)"

I7=$(create_issue "Add search indexing for issues" \
  "Full-text search using PostgreSQL tsvector. Index title, description, and comments. Support fuzzy matching and search highlighting." \
  "in_progress" "medium" "member" "$JAKE_UID" "$CLI_TEAM_ID" "$PROJ_CLIENTS_ID" "$CLI_CYCLE1_ID" "5" "2026-05-07T00:00:00Z" "2026-04-30")
set_labels "$I7" "$LABEL_IMPROVEMENT" "$LABEL_BACKEND"
echo "    $I7 - Add search indexing (in_progress, 5pt)"

I8=$(create_issue "Write API documentation" \
  "OpenAPI 3.0 spec for all public endpoints. Include request/response examples, error codes, and authentication guide. Auto-generate from handler annotations." \
  "todo" "low" "member" "$ALEX_UID" "$CLI_TEAM_ID" "$PROJ_CLIENTS_ID" "$CLI_CYCLE1_ID" "3" "2026-05-08T00:00:00Z" "2026-05-01")
set_labels "$I8" "$LABEL_DOCUMENTATION"
echo "    $I8 - Write API documentation (todo, 3pt)"

I9=$(create_issue "Implement file upload with S3" \
  "Support drag-and-drop file uploads to S3-compatible storage. Generate presigned URLs. Support image thumbnails and PDF preview. Max 25MB per file." \
  "todo" "medium" "member" "$MASUD_UID" "$CLI_TEAM_ID" "$PROJ_CLIENTS_ID" "$CLI_CYCLE1_ID" "5" "2026-05-09T00:00:00Z" "2026-05-02")
set_labels "$I9" "$LABEL_FEATURE" "$LABEL_BACKEND" "$LABEL_INFRA"
echo "    $I9 - Implement file upload with S3 (todo, 5pt)"

I10=$(create_issue "Build onboarding wizard" \
  "Multi-step onboarding flow: workspace setup, team creation, invite members, first issue creation. Include skip option and progress indicator." \
  "backlog" "medium" "member" "$PRIYA_UID" "$CLI_TEAM_ID" "$PROJ_CLIENTS_ID" "$CLI_CYCLE1_ID" "5" "2026-05-10T00:00:00Z" "2026-05-04")
set_labels "$I10" "$LABEL_FEATURE" "$LABEL_FRONTEND" "$LABEL_DESIGN"
echo "    $I10 - Build onboarding wizard (backlog, 5pt)"

I11=$(create_issue "Fix memory leak in WebSocket handler" \
  "WebSocket connections are not properly cleaned up on client disconnect. goroutine count grows linearly over time. Need to add context cancellation and connection timeout." \
  "in_progress" "urgent" "member" "$JAKE_UID" "$CLI_TEAM_ID" "$PROJ_CLIENTS_ID" "$CLI_CYCLE1_ID" "3" "2026-04-29T00:00:00Z" "2026-04-27")
set_labels "$I11" "$LABEL_BUG" "$LABEL_URGENT" "$LABEL_BACKEND"
echo "    $I11 - Fix memory leak in WebSocket handler (in_progress, 3pt)"

I12=$(create_issue "Add keyboard shortcuts system" \
  "Global keyboard shortcuts: C for create, / for search, G then I for issues, G then P for projects. Support customization and help modal (?)." \
  "todo" "low" "member" "$ALEX_UID" "$CLI_TEAM_ID" "$PROJ_CLIENTS_ID" "$CLI_CYCLE1_ID" "2" "2026-05-10T00:00:00Z" "2026-05-05")
set_labels "$I12" "$LABEL_IMPROVEMENT" "$LABEL_FRONTEND"
echo "    $I12 - Add keyboard shortcuts (todo, 2pt)"

echo ""
echo "  Creating OPS Sprint 1 issues..."

# OPS Sprint 1 - 12 issues
O1=$(create_issue "Set up Kubernetes cluster" \
  "Provision k8s cluster on AWS EKS. Configure node groups (spot + on-demand), RBAC, network policies, and cluster autoscaler. Document runbook for common operations." \
  "done" "urgent" "member" "$SARAH_UID" "$OPS_TEAM_ID" "$PROJ_OPS_ID" "$OPS_CYCLE1_ID" "13" "2026-04-30T00:00:00Z" "2026-04-26")
set_labels "$O1" "$LABEL_INFRA" "$LABEL_URGENT"
echo "    $O1 - Set up Kubernetes cluster (done, 13pt)"

O2=$(create_issue "Implement CI/CD pipeline" \
  "GitHub Actions pipeline: lint, test, build, deploy to staging, promote to production. Include rollback mechanism and deployment notifications to Slack." \
  "done" "high" "member" "$ALEX_UID" "$OPS_TEAM_ID" "$PROJ_OPS_ID" "$OPS_CYCLE1_ID" "8" "2026-05-01T00:00:00Z" "2026-04-26")
set_labels "$O2" "$LABEL_INFRA" "$LABEL_FEATURE"
echo "    $O2 - Implement CI/CD pipeline (done, 8pt)"

O3=$(create_issue "Configure Prometheus monitoring" \
  "Deploy Prometheus with service discovery. Create alerting rules for CPU, memory, disk, latency P99, error rate. Set up PagerDuty integration for critical alerts." \
  "done" "high" "member" "$SARAH_UID" "$OPS_TEAM_ID" "$PROJ_OPS_ID" "$OPS_CYCLE1_ID" "8" "2026-05-02T00:00:00Z" "2026-04-27")
set_labels "$O3" "$LABEL_INFRA" "$LABEL_FEATURE"
echo "    $O3 - Configure Prometheus monitoring (done, 8pt)"

O4=$(create_issue "Set up Grafana dashboards" \
  "Create dashboards: API latency, error rates, database performance, k8s cluster health, business metrics. Use variables for environment/service filtering." \
  "in_review" "medium" "member" "$PRIYA_UID" "$OPS_TEAM_ID" "$PROJ_OPS_ID" "$OPS_CYCLE1_ID" "5" "2026-05-04T00:00:00Z" "2026-04-28")
set_labels "$O4" "$LABEL_INFRA" "$LABEL_DESIGN"
echo "    $O4 - Set up Grafana dashboards (in_review, 5pt)"

O5=$(create_issue "Implement database backup strategy" \
  "Automated daily backups to S3 with 30-day retention. Point-in-time recovery via WAL archiving. Monthly backup restoration tests. Document recovery procedures." \
  "in_progress" "urgent" "member" "$JAKE_UID" "$OPS_TEAM_ID" "$PROJ_OPS_ID" "$OPS_CYCLE1_ID" "5" "2026-05-03T00:00:00Z" "2026-04-28")
set_labels "$O5" "$LABEL_INFRA" "$LABEL_SECURITY"
echo "    $O5 - Implement database backup strategy (in_progress, 5pt)"

O6=$(create_issue "Fix SSL certificate auto-renewal" \
  "cert-manager is failing to renew Let's Encrypt certs due to DNS challenge timeout. Investigate and fix the ClusterIssuer configuration. Set up monitoring for cert expiry." \
  "done" "urgent" "member" "$SARAH_UID" "$OPS_TEAM_ID" "$PROJ_OPS_ID" "$OPS_CYCLE1_ID" "3" "2026-04-28T00:00:00Z" "2026-04-26")
set_labels "$O6" "$LABEL_BUG" "$LABEL_URGENT" "$LABEL_SECURITY"
echo "    $O6 - Fix SSL certificate auto-renewal (done, 3pt)"

O7=$(create_issue "Implement log aggregation with Loki" \
  "Deploy Grafana Loki for centralized logging. Configure promtail on all nodes. Set up log retention policies (7 days hot, 30 days cold). Create log-based alerts." \
  "in_progress" "high" "member" "$ALEX_UID" "$OPS_TEAM_ID" "$PROJ_OPS_ID" "$OPS_CYCLE1_ID" "5" "2026-05-06T00:00:00Z" "2026-04-30")
set_labels "$O7" "$LABEL_INFRA" "$LABEL_FEATURE"
echo "    $O7 - Implement log aggregation (in_progress, 5pt)"

O8=$(create_issue "Create disaster recovery plan" \
  "Document DR procedures for all critical services. Define RPO/RTO targets. Set up cross-region replication for database. Quarterly DR drill schedule." \
  "todo" "high" "member" "$SARAH_UID" "$OPS_TEAM_ID" "$PROJ_OPS_ID" "$OPS_CYCLE1_ID" "5" "2026-05-08T00:00:00Z" "2026-05-01")
set_labels "$O8" "$LABEL_DOCUMENTATION" "$LABEL_SECURITY"
echo "    $O8 - Create disaster recovery plan (todo, 5pt)"

O9=$(create_issue "Optimize database queries" \
  "Profile slow queries (>100ms). Add missing indexes on issue, comment, and activity tables. Implement query result caching for frequently accessed data." \
  "todo" "medium" "member" "$JAKE_UID" "$OPS_TEAM_ID" "$PROJ_OPS_ID" "$OPS_CYCLE1_ID" "5" "2026-05-09T00:00:00Z" "2026-05-02")
set_labels "$O9" "$LABEL_IMPROVEMENT" "$LABEL_BACKEND"
echo "    $O9 - Optimize database queries (todo, 5pt)"

O10=$(create_issue "Set up staging environment" \
  "Mirror production infrastructure in staging. Configure data anonymization pipeline for production data snapshots. Automated nightly sync." \
  "backlog" "medium" "member" "$PRIYA_UID" "$OPS_TEAM_ID" "$PROJ_OPS_ID" "$OPS_CYCLE1_ID" "8" "2026-05-10T00:00:00Z" "2026-05-04")
set_labels "$O10" "$LABEL_INFRA"
echo "    $O10 - Set up staging environment (backlog, 8pt)"

O11=$(create_issue "Implement network security policies" \
  "Define Kubernetes NetworkPolicies for pod-to-pod communication. Restrict egress to known endpoints. Set up Falco for runtime security monitoring." \
  "in_progress" "high" "member" "$SARAH_UID" "$OPS_TEAM_ID" "$PROJ_OPS_ID" "$OPS_CYCLE1_ID" "5" "2026-05-05T00:00:00Z" "2026-04-29")
set_labels "$O11" "$LABEL_SECURITY" "$LABEL_INFRA"
echo "    $O11 - Implement network security policies (in_progress, 5pt)"

O12=$(create_issue "Automate infrastructure with Terraform" \
  "Convert all manual AWS infrastructure to Terraform modules. Set up remote state in S3 with DynamoDB locking. Create reusable modules for VPC, EKS, RDS, S3." \
  "todo" "medium" "member" "$ALEX_UID" "$OPS_TEAM_ID" "$PROJ_OPS_ID" "$OPS_CYCLE1_ID" "8" "2026-05-10T00:00:00Z" "2026-05-03")
set_labels "$O12" "$LABEL_INFRA" "$LABEL_IMPROVEMENT"
echo "    $O12 - Automate infrastructure with Terraform (todo, 8pt)"

echo ""
echo "========================================="
echo "Seed complete!"
echo "========================================="
echo ""
echo "Workspace: $WS_ID (slug: acme)"
echo "Teams:"
echo "  CLI (Client Engineering): $CLI_TEAM_ID"
echo "  OPS (Operations): $OPS_TEAM_ID"
echo "Projects:"
echo "  Client Portal v2: $PROJ_CLIENTS_ID"
echo "  Infrastructure Modernization: $PROJ_OPS_ID"
echo "Cycles:"
echo "  CLI Sprint 1: $CLI_CYCLE1_ID (${SPRINT_START} to ${SPRINT_END})"
echo "  CLI Sprint 2: $CLI_CYCLE2_ID (${CYCLE2_START} to ${CYCLE2_END})"
echo "  OPS Sprint 1: $OPS_CYCLE1_ID (${SPRINT_START} to ${SPRINT_END})"
echo "  OPS Sprint 2: $OPS_CYCLE2_ID (${CYCLE2_START} to ${CYCLE2_END})"
echo "Users: ${#USER_IDS[@]} created"
echo "Issues: 24 created (12 per team)"
echo ""
echo "Login as masud@multica.ai to see everything."
