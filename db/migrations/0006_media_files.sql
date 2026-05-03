-- =====================================================
-- Chatrix — 0006_media_files
-- Uploaded media (images / video / audio / files / GIFs).
-- Decoupled from messages so an upload can be referenced from many places
-- (avatar, message, banner) and we can run AV-scan / transcode jobs.
-- =====================================================

CREATE TYPE media_kind   AS ENUM ('image', 'video', 'audio', 'file', 'gif');
CREATE TYPE media_status AS ENUM ('pending', 'uploaded', 'processing', 'ready', 'failed', 'rejected');

CREATE TABLE media_files (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind            media_kind   NOT NULL,
    status          media_status NOT NULL DEFAULT 'pending',
    storage_driver  TEXT NOT NULL,             -- supabase | s3 | local
    storage_key     TEXT NOT NULL,             -- bucket-relative path
    public_url      TEXT,                       -- CDN url (filled after 'ready')
    mime_type       TEXT NOT NULL,
    size_bytes      BIGINT NOT NULL,
    width           INTEGER,
    height          INTEGER,
    duration_ms     INTEGER,                    -- for audio/video
    -- Pre-computed blurhash / waveform for instant skeleton render
    blurhash        TEXT,
    waveform        JSONB,
    checksum_sha256 TEXT,
    -- Optional thumbnail (generated server-side)
    thumbnail_key   TEXT,
    -- Soft delete (so already-sent messages don't break)
    deleted_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT media_size_positive CHECK (size_bytes >= 0)
);
CREATE INDEX media_files_owner_idx  ON media_files (owner_id, created_at DESC);
CREATE INDEX media_files_status_idx ON media_files (status) WHERE status IN ('pending','processing');

-- Many-to-many: a message may carry multiple attachments (carousel)
CREATE TABLE message_attachments (
    message_id  UUID NOT NULL REFERENCES messages(id)    ON DELETE CASCADE,
    media_id    UUID NOT NULL REFERENCES media_files(id) ON DELETE CASCADE,
    position    SMALLINT NOT NULL DEFAULT 0,

    PRIMARY KEY (message_id, media_id)
);
CREATE INDEX message_attachments_media_idx ON message_attachments (media_id);
