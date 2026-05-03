-- =====================================================
-- Chatrix — 0001_extensions
-- Required Postgres extensions.
-- =====================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";       -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "citext";         -- case-insensitive emails / usernames
CREATE EXTENSION IF NOT EXISTS "pg_trgm";        -- trigram search for usernames / display names
CREATE EXTENSION IF NOT EXISTS "btree_gin";      -- composite GIN indexes
