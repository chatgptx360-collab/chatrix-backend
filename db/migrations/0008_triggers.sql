-- =====================================================
-- Chatrix — 0008_triggers
-- updated_at maintenance + chat last-message denormalization.
-- =====================================================

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER users_updated_at      BEFORE UPDATE ON users        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER profiles_updated_at   BEFORE UPDATE ON profiles     FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER chats_updated_at      BEFORE UPDATE ON chats        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER friendships_updated_at BEFORE UPDATE ON friendships FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER media_files_updated_at BEFORE UPDATE ON media_files FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Bump chats.last_message_* whenever a non-deleted message is inserted.
CREATE OR REPLACE FUNCTION bump_chat_last_message() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    UPDATE chats
       SET last_message_id = NEW.id,
           last_message_at = NEW.created_at
     WHERE id = NEW.chat_id;
    RETURN NEW;
END;
$$;

CREATE TRIGGER messages_bump_chat
    AFTER INSERT ON messages
    FOR EACH ROW
    WHEN (NEW.deleted_at IS NULL)
    EXECUTE FUNCTION bump_chat_last_message();
