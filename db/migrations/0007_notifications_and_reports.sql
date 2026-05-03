-- =====================================================
-- Chatrix — 0007_notifications_and_reports
-- In-app notifications + user/message reports + admin audit log.
-- =====================================================

CREATE TYPE notification_kind AS ENUM (
    'friend_request',
    'friend_accepted',
    'message',
    'mention',
    'reaction',
    'system'
);

CREATE TABLE notifications (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind        notification_kind NOT NULL,
    -- Generic payload — references the source object(s)
    payload     JSONB NOT NULL,
    read_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Hot path: "give me unread notifications for user X newest first"
CREATE INDEX notifications_user_unread_idx
    ON notifications (user_id, created_at DESC)
    WHERE read_at IS NULL;
CREATE INDEX notifications_user_all_idx
    ON notifications (user_id, created_at DESC);

-- ----- reports (user-submitted abuse reports) -----
CREATE TYPE report_target AS ENUM ('user', 'message', 'chat');
CREATE TYPE report_status AS ENUM ('open', 'reviewing', 'actioned', 'dismissed');

CREATE TABLE reports (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_kind   report_target NOT NULL,
    target_id     UUID NOT NULL,                -- soft FK; see check below
    reason        TEXT NOT NULL,
    details       TEXT,
    status        report_status NOT NULL DEFAULT 'open',
    -- Moderation
    handled_by    UUID REFERENCES users(id) ON DELETE SET NULL,
    handled_at    TIMESTAMPTZ,
    resolution    TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT reports_reason_len CHECK (char_length(reason) BETWEEN 3 AND 200)
);
CREATE INDEX reports_status_idx     ON reports (status, created_at DESC);
CREATE INDEX reports_target_idx     ON reports (target_kind, target_id);
CREATE INDEX reports_reporter_idx   ON reports (reporter_id);

-- ----- admin_audit_log -----
CREATE TABLE admin_audit_log (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id    UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    action      TEXT NOT NULL,        -- e.g. 'user.suspend', 'report.dismiss'
    target_kind TEXT,
    target_id   UUID,
    metadata    JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX admin_audit_log_actor_idx ON admin_audit_log (actor_id, created_at DESC);
CREATE INDEX admin_audit_log_action_idx ON admin_audit_log (action, created_at DESC);
