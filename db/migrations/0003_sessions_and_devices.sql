-- =====================================================
-- Chatrix — 0003_sessions_and_devices
-- Refresh-token sessions + device registry (push targets).
-- =====================================================

CREATE TYPE device_platform AS ENUM ('ios', 'android', 'web', 'desktop');

-- One row per refresh token (rotated on every use).
-- Allows per-device sign-out + audit.
CREATE TABLE sessions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    refresh_token_hash  TEXT NOT NULL UNIQUE,        -- SHA-256 of refresh JWT
    device_id           UUID,                        -- nullable until linked
    user_agent          TEXT,
    ip_address          INET,
    expires_at          TIMESTAMPTZ NOT NULL,
    revoked_at          TIMESTAMPTZ,
    last_used_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_active_idx ON sessions (user_id) WHERE revoked_at IS NULL;
CREATE INDEX sessions_expires_idx      ON sessions (expires_at);

CREATE TABLE devices (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    platform          device_platform NOT NULL,
    device_name       TEXT,
    push_token        TEXT,         -- Expo push token / web-push subscription endpoint
    push_subscription JSONB,        -- web-push p256dh + auth keys
    last_active_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (user_id, push_token)
);
CREATE INDEX devices_user_idx ON devices (user_id);

ALTER TABLE sessions
    ADD CONSTRAINT sessions_device_fk
    FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE SET NULL;
