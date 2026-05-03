/**
 * Cross-platform constants. Anything a client and the backend must agree on
 * (limits, regexes, defaults) lives here so it cannot drift.
 */

export const APP_NAME = "Chatrix" as const;
export const APP_TAGLINE = "WhatsApp without the phone number." as const;

// ----- Username rules -----
// MUST stay in sync with users_username_format CHECK in 0002_users_and_profiles.sql
export const USERNAME_REGEX = /^[a-zA-Z][a-zA-Z0-9_]{2,29}$/;
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;

// ----- Password rules -----
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

// ----- Display name / bio -----
export const DISPLAY_NAME_MAX_LENGTH = 64;
export const BIO_MAX_LENGTH = 280;

// ----- Message limits -----
export const MESSAGE_TEXT_MAX_LENGTH = 8000;
export const MESSAGE_EDIT_WINDOW_MS = 1000 * 60 * 60 * 24 * 2; // 48h
export const MESSAGE_PAGE_SIZE = 50;

// ----- Media limits (free tier; premium overrides) -----
export const MEDIA_MAX_BYTES = {
  image: 10 * 1024 * 1024,        // 10 MB
  gif:    8 * 1024 * 1024,        //  8 MB
  audio: 25 * 1024 * 1024,        // 25 MB (voice notes)
  video:100 * 1024 * 1024,        // 100 MB
  file: 100 * 1024 * 1024,        // 100 MB
} as const;

export const MEDIA_ALLOWED_MIME = {
  image: ["image/jpeg", "image/png", "image/webp", "image/heic"],
  gif:   ["image/gif", "image/webp"],
  audio: ["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav"],
  video: ["video/mp4", "video/webm", "video/quicktime"],
  file:  ["*/*"],
} as const;

// ----- Reactions -----
export const REACTION_MAX_PER_USER_PER_MESSAGE = 6;

// ----- Friends -----
export const FRIENDS_MAX_PENDING_PER_DAY = 50;

// ----- Profile share link -----
// chatrix.app/@kamsy
export const PROFILE_LINK_BASE = "https://chatrix.app";
export const profileLink = (username: string) => `${PROFILE_LINK_BASE}/@${username}`;

// ----- Pagination -----
export const DEFAULT_PAGE_SIZE = 30;
export const MAX_PAGE_SIZE = 100;

// ----- Auth -----
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;            // 15m
export const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30; // 30d
