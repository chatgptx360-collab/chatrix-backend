-- =====================================================
-- Chatrix — 0005_chats_and_messages
-- Chats (DM + group + channel ready), members, messages, reads, attachments, reactions.
-- E2E-encryption-ready: messages.body is TEXT but transport may carry ciphertext blobs.
-- =====================================================

CREATE TYPE chat_type      AS ENUM ('dm', 'group', 'channel');
CREATE TYPE member_role    AS ENUM ('owner', 'admin', 'member');
CREATE TYPE message_kind   AS ENUM ('text', 'image', 'video', 'audio', 'file', 'gif', 'system');
CREATE TYPE message_state  AS ENUM ('sent', 'delivered', 'read', 'deleted');

-- ----- chats -----
CREATE TABLE chats (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type                chat_type NOT NULL,
    -- Group/channel only:
    title               TEXT,
    description         TEXT,
    avatar_url          TEXT,
    -- For channels: optional public handle (@news)
    public_handle       CITEXT UNIQUE,
    created_by          UUID REFERENCES users(id) ON DELETE SET NULL,
    -- Cached pointer to last message (avoids subquery on chat list)
    last_message_id     UUID,
    last_message_at     TIMESTAMPTZ,
    -- E2E pubkey for the chat (for future MLS/Olm-style group keying)
    encryption_metadata JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ
);
CREATE INDEX chats_last_message_at_idx ON chats (last_message_at DESC NULLS LAST);

-- ----- chat_members -----
CREATE TABLE chat_members (
    chat_id              UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role                 member_role NOT NULL DEFAULT 'member',
    -- Cursor of last-read message (drives unread badges + read receipts)
    last_read_message_id UUID,
    last_read_at         TIMESTAMPTZ,
    muted_until          TIMESTAMPTZ,
    pinned               BOOLEAN NOT NULL DEFAULT false,
    archived             BOOLEAN NOT NULL DEFAULT false,
    -- Per-member chat alias (custom nickname for the OTHER party in DMs)
    nickname             TEXT,
    joined_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    left_at              TIMESTAMPTZ,

    PRIMARY KEY (chat_id, user_id)
);
CREATE INDEX chat_members_user_idx          ON chat_members (user_id) WHERE left_at IS NULL;
CREATE INDEX chat_members_user_pinned_idx   ON chat_members (user_id, pinned) WHERE pinned = true;
CREATE INDEX chat_members_user_archived_idx ON chat_members (user_id, archived);

-- ----- messages -----
CREATE TABLE messages (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id            UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    sender_id          UUID REFERENCES users(id) ON DELETE SET NULL,
    kind               message_kind NOT NULL DEFAULT 'text',
    -- Plaintext body OR ciphertext blob (base64) when E2E is on.
    body               TEXT,
    -- Optional reply target
    reply_to_id        UUID REFERENCES messages(id) ON DELETE SET NULL,
    -- Forwarded-from pointer (denormalized to survive source deletion)
    forwarded_from     JSONB,
    -- Edit tracking
    edited_at          TIMESTAMPTZ,
    edit_history       JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{at, body}]
    -- Delete-for-everyone flag (rows are kept as tombstones for receipts)
    deleted_at         TIMESTAMPTZ,
    deleted_by         UUID REFERENCES users(id) ON DELETE SET NULL,
    -- Client idempotency key (prevents double-sends on retry)
    client_id          TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (chat_id, sender_id, client_id)
);
-- Critical: the hot path is "give me the last N messages in chat X".
CREATE INDEX messages_chat_created_idx ON messages (chat_id, created_at DESC);
CREATE INDEX messages_sender_idx       ON messages (sender_id);
CREATE INDEX messages_reply_idx        ON messages (reply_to_id);

ALTER TABLE chats
    ADD CONSTRAINT chats_last_message_fk
    FOREIGN KEY (last_message_id) REFERENCES messages(id) ON DELETE SET NULL;

ALTER TABLE chat_members
    ADD CONSTRAINT chat_members_last_read_fk
    FOREIGN KEY (last_read_message_id) REFERENCES messages(id) ON DELETE SET NULL;

-- ----- message_reads (per-recipient receipt log) -----
-- For DMs we could derive this from chat_members.last_read_message_id,
-- but a dedicated log scales cleanly to groups and supports per-message receipts.
CREATE TABLE message_reads (
    message_id   UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id      UUID NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
    read_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    delivered_at TIMESTAMPTZ,

    PRIMARY KEY (message_id, user_id)
);
CREATE INDEX message_reads_user_idx ON message_reads (user_id, read_at DESC);

-- ----- message_reactions -----
CREATE TABLE message_reactions (
    message_id  UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
    emoji       TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    PRIMARY KEY (message_id, user_id, emoji)
);
CREATE INDEX message_reactions_message_idx ON message_reactions (message_id);
