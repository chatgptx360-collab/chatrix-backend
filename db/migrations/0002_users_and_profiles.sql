-- =====================================================
-- Chatrix — 0002_users_and_profiles
-- Identity (email + username) and user-facing profile.
-- =====================================================

CREATE TYPE user_role     AS ENUM ('user', 'moderator', 'admin');
CREATE TYPE user_status   AS ENUM ('active', 'suspended', 'banned', 'deleted');
CREATE TYPE presence_state AS ENUM ('online', 'away', 'offline');

-- ----- users: authentication identity -----
CREATE TABLE users (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username            CITEXT NOT NULL UNIQUE,
    email               CITEXT NOT NULL UNIQUE,
    password_hash       TEXT   NOT NULL,
    email_verified_at   TIMESTAMPTZ,
    role                user_role   NOT NULL DEFAULT 'user',
    status              user_status NOT NULL DEFAULT 'active',
    last_login_at       TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ,

    -- Username rules: 3–30 chars, alphanumeric + underscore, must start with a letter
    CONSTRAINT users_username_format CHECK (username ~ '^[a-zA-Z][a-zA-Z0-9_]{2,29}$')
);

CREATE INDEX users_status_idx        ON users (status) WHERE deleted_at IS NULL;
CREATE INDEX users_username_trgm_idx ON users USING gin (username gin_trgm_ops);
CREATE INDEX users_created_at_idx    ON users (created_at DESC);

-- ----- profiles: presentation layer (separated for scaling reads) -----
CREATE TABLE profiles (
    user_id          UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    display_name     TEXT,
    bio              TEXT,
    avatar_url       TEXT,
    banner_url       TEXT,
    presence         presence_state NOT NULL DEFAULT 'offline',
    last_seen_at     TIMESTAMPTZ,
    -- Privacy preferences (JSONB so we can evolve without migrations)
    privacy          JSONB NOT NULL DEFAULT jsonb_build_object(
        'last_seen',       'everyone',  -- everyone | contacts | nobody
        'profile_picture', 'everyone',
        'read_receipts',   true,
        'searchable',      true
    ),
    -- Notification preferences
    notifications    JSONB NOT NULL DEFAULT jsonb_build_object(
        'mentions',  true,
        'messages',  true,
        'sounds',    true,
        'preview',   true
    ),
    theme            TEXT NOT NULL DEFAULT 'system', -- system | light | dark | <theme-id>
    locale           TEXT NOT NULL DEFAULT 'en',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT profiles_display_name_len CHECK (display_name IS NULL OR char_length(display_name) BETWEEN 1 AND 64),
    CONSTRAINT profiles_bio_len          CHECK (bio          IS NULL OR char_length(bio) <= 280)
);

CREATE INDEX profiles_display_name_trgm_idx ON profiles USING gin (display_name gin_trgm_ops);
CREATE INDEX profiles_presence_idx          ON profiles (presence) WHERE presence <> 'offline';

-- ----- email_verification_tokens -----
CREATE TABLE email_verification_tokens (
    token       TEXT PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at  TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX email_verification_tokens_user_idx ON email_verification_tokens (user_id);

-- ----- password_reset_tokens -----
CREATE TABLE password_reset_tokens (
    token       TEXT PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at  TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX password_reset_tokens_user_idx ON password_reset_tokens (user_id);
