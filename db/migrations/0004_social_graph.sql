-- =====================================================
-- Chatrix — 0004_social_graph
-- Friendships + blocks. Two directed rows model accept-flow + block.
-- =====================================================

CREATE TYPE friendship_status AS ENUM ('pending', 'accepted', 'declined', 'cancelled');

CREATE TABLE friendships (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    addressee_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status          friendship_status NOT NULL DEFAULT 'pending',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT friendships_no_self CHECK (requester_id <> addressee_id),
    -- Only one open request per direction; declined/cancelled rows can be re-opened by upsert.
    UNIQUE (requester_id, addressee_id)
);
CREATE INDEX friendships_addressee_idx ON friendships (addressee_id, status);
CREATE INDEX friendships_requester_idx ON friendships (requester_id, status);

CREATE TABLE blocked_users (
    blocker_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason       TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

    PRIMARY KEY (blocker_id, blocked_id),
    CONSTRAINT blocked_users_no_self CHECK (blocker_id <> blocked_id)
);
CREATE INDEX blocked_users_blocked_idx ON blocked_users (blocked_id);
