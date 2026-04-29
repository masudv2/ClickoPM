-- Extend member role to include 'client'
ALTER TABLE member DROP CONSTRAINT IF EXISTS member_role_check;
ALTER TABLE member ADD CONSTRAINT member_role_check CHECK (role IN ('owner', 'admin', 'member', 'client'));

-- Extend invitation role to include 'client'
ALTER TABLE workspace_invitation DROP CONSTRAINT IF EXISTS workspace_invitation_role_check;
ALTER TABLE workspace_invitation ADD CONSTRAINT workspace_invitation_role_check CHECK (role IN ('admin', 'member', 'client'));

-- Add ticket_counter to workspace for ticket numbering (TKT-1, TKT-2, ...)
ALTER TABLE workspace ADD COLUMN ticket_counter INTEGER NOT NULL DEFAULT 0;

-- SLA Policy table
CREATE TABLE sla_policy (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    critical_first_response INTEGER,
    critical_update_interval INTEGER,
    critical_resolution INTEGER,
    high_first_response INTEGER,
    high_update_interval INTEGER,
    high_resolution INTEGER,
    normal_first_response INTEGER,
    normal_update_interval INTEGER,
    normal_resolution INTEGER,
    low_first_response INTEGER,
    low_update_interval INTEGER,
    low_resolution INTEGER,
    support_hours TEXT NOT NULL DEFAULT '24/7',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sla_policy_workspace ON sla_policy(workspace_id);
CREATE UNIQUE INDEX idx_sla_policy_workspace_name ON sla_policy(workspace_id, lower(name));

-- Client table (links user to workspace with SLA policy)
CREATE TABLE client (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    sla_policy_id UUID REFERENCES sla_policy(id) ON DELETE SET NULL,
    company_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_client_workspace_user ON client(workspace_id, user_id);
CREATE INDEX idx_client_workspace ON client(workspace_id);

-- Client-project junction table
CREATE TABLE client_project (
    client_id UUID NOT NULL REFERENCES client(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    PRIMARY KEY (client_id, project_id)
);

-- Ticket table
CREATE TABLE ticket (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES client(id) ON DELETE CASCADE,
    number INTEGER NOT NULL,
    subject TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL DEFAULT 'support'
        CHECK (type IN ('bug', 'question', 'feature_request', 'task', 'support', 'change_request', 'clarification')),
    priority TEXT NOT NULL DEFAULT 'normal'
        CHECK (priority IN ('critical', 'high', 'normal', 'low')),
    client_status TEXT NOT NULL DEFAULT 'open'
        CHECK (client_status IN ('open', 'in_progress', 'waiting_on_you', 'resolved', 'closed')),
    internal_status TEXT NOT NULL DEFAULT 'new'
        CHECK (internal_status IN ('new', 'triage', 'assigned', 'in_progress', 'waiting_on_client', 'waiting_on_internal', 'resolved', 'closed')),
    assignee_type TEXT,
    assignee_id UUID,
    linked_issue_id UUID REFERENCES issue(id) ON DELETE SET NULL,
    pending_reply BOOLEAN NOT NULL DEFAULT false,
    source TEXT NOT NULL DEFAULT 'portal'
        CHECK (source IN ('portal', 'email', 'manual')),
    first_response_at TIMESTAMPTZ,
    first_response_due TIMESTAMPTZ,
    next_update_due TIMESTAMPTZ,
    resolution_due TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ticket_workspace ON ticket(workspace_id);
CREATE INDEX idx_ticket_project ON ticket(project_id);
CREATE INDEX idx_ticket_client ON ticket(client_id);
CREATE INDEX idx_ticket_assignee ON ticket(assignee_type, assignee_id) WHERE assignee_id IS NOT NULL;
CREATE INDEX idx_ticket_internal_status ON ticket(workspace_id, internal_status);
CREATE INDEX idx_ticket_resolution_due ON ticket(resolution_due) WHERE resolution_due IS NOT NULL AND internal_status NOT IN ('resolved', 'closed');
CREATE UNIQUE INDEX idx_ticket_workspace_number ON ticket(workspace_id, number);

-- Ticket message table (replies and notes)
CREATE TABLE ticket_message (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES ticket(id) ON DELETE CASCADE,
    type TEXT NOT NULL DEFAULT 'reply'
        CHECK (type IN ('reply', 'note')),
    body TEXT NOT NULL,
    sender_type TEXT NOT NULL
        CHECK (sender_type IN ('member', 'client', 'agent')),
    sender_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ticket_message_ticket ON ticket_message(ticket_id);

-- Add ticket columns to attachment table
ALTER TABLE attachment ADD COLUMN ticket_id UUID REFERENCES ticket(id) ON DELETE CASCADE;
ALTER TABLE attachment ADD COLUMN ticket_message_id UUID REFERENCES ticket_message(id) ON DELETE CASCADE;
