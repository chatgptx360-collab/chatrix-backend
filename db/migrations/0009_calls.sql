-- =====================================================
-- Chatrix — 0009_calls
-- 1:1 voice / video call records.
--
-- The realtime gateway is the source of truth for *active* calls;
-- this table is the durable history (call log) and the source of
-- truth for the call state-machine: ringing → answered → ended,
-- or any of the early-termination branches (declined, cancelled,
-- missed, failed).
--
-- We deliberately keep this 1:1-only at the schema level. Group
-- calls would split into calls + call_participants and need an
-- SFU upstream — out of scope.
-- =====================================================

CREATE TYPE call_kind   AS ENUM ('voice', 'video');
CREATE TYPE call_status AS ENUM (
    'ringing',     -- invite emitted, awaiting accept/decline
    'answered',    -- callee picked up, RTC media flowing
    'declined',    -- callee tapped Decline before pickup
    'missed',      -- timed out / callee unreachable
    'cancelled',   -- caller hung up before pickup
    'ended',       -- normal end after pickup
    'failed'       -- signalling/peer failure
);

CREATE TABLE calls (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Optional context: usually set when the call was started from inside
    -- a chat thread. NULL for ad-hoc calls from a profile.
    chat_id      UUID REFERENCES chats(id) ON DELETE SET NULL,
    caller_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    callee_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind         call_kind   NOT NULL,
    status       call_status NOT NULL DEFAULT 'ringing',
    started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    answered_at  TIMESTAMPTZ,
    ended_at     TIMESTAMPTZ,
    duration_ms  INTEGER,

    CONSTRAINT calls_distinct_parties CHECK (caller_id <> callee_id),
    CONSTRAINT calls_duration_when_ended
      CHECK (
        (status NOT IN ('answered', 'ringing') AND ended_at IS NOT NULL)
        OR status IN ('answered', 'ringing')
      )
);

-- Two-sided history scans (for "Calls" tab on each user's profile).
CREATE INDEX calls_caller_idx ON calls (caller_id, started_at DESC);
CREATE INDEX calls_callee_idx ON calls (callee_id, started_at DESC);
-- Quick lookup of a user's currently-live call (for busy-state checks).
CREATE INDEX calls_active_idx ON calls (caller_id, callee_id) WHERE status IN ('ringing', 'answered');
