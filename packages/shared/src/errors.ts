/**
 * Stable error codes shared between server and clients.
 * Clients map codes → translated messages; server returns the code in JSON.
 */

export const ErrorCode = {
  // Generic
  UNKNOWN:                  "UNKNOWN",
  VALIDATION:               "VALIDATION",
  NOT_FOUND:                "NOT_FOUND",
  FORBIDDEN:                "FORBIDDEN",
  UNAUTHORIZED:             "UNAUTHORIZED",
  RATE_LIMITED:             "RATE_LIMITED",

  // Auth
  AUTH_INVALID_CREDENTIALS: "AUTH_INVALID_CREDENTIALS",
  AUTH_EMAIL_TAKEN:         "AUTH_EMAIL_TAKEN",
  AUTH_USERNAME_TAKEN:      "AUTH_USERNAME_TAKEN",
  AUTH_EMAIL_NOT_VERIFIED:  "AUTH_EMAIL_NOT_VERIFIED",
  AUTH_TOKEN_EXPIRED:       "AUTH_TOKEN_EXPIRED",
  AUTH_TOKEN_INVALID:       "AUTH_TOKEN_INVALID",
  AUTH_ACCOUNT_SUSPENDED:   "AUTH_ACCOUNT_SUSPENDED",
  AUTH_ACCOUNT_BANNED:      "AUTH_ACCOUNT_BANNED",

  // Social
  SOCIAL_BLOCKED:           "SOCIAL_BLOCKED",
  SOCIAL_NOT_FRIENDS:       "SOCIAL_NOT_FRIENDS",
  SOCIAL_REQUEST_EXISTS:    "SOCIAL_REQUEST_EXISTS",
  SOCIAL_SELF_ACTION:       "SOCIAL_SELF_ACTION",

  // Chat
  CHAT_NOT_MEMBER:          "CHAT_NOT_MEMBER",
  CHAT_NOT_FOUND:           "CHAT_NOT_FOUND",
  MESSAGE_NOT_FOUND:        "MESSAGE_NOT_FOUND",
  MESSAGE_NOT_OWNED:        "MESSAGE_NOT_OWNED",
  MESSAGE_EDIT_WINDOW_CLOSED: "MESSAGE_EDIT_WINDOW_CLOSED",

  // Media
  MEDIA_TOO_LARGE:          "MEDIA_TOO_LARGE",
  MEDIA_BAD_MIME:           "MEDIA_BAD_MIME",
  MEDIA_UPLOAD_FAILED:      "MEDIA_UPLOAD_FAILED",

  // Calls
  CALL_NOT_FOUND:           "CALL_NOT_FOUND",
  CALL_NOT_PARTICIPANT:     "CALL_NOT_PARTICIPANT",
  CALL_INVALID_STATE:       "CALL_INVALID_STATE",
  CALL_PEER_OFFLINE:        "CALL_PEER_OFFLINE",
  CALL_PEER_BUSY:           "CALL_PEER_BUSY",
  CALL_SELF_INVITE:         "CALL_SELF_INVITE",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface ApiError {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Backend throws this; the global filter serializes it to a stable JSON shape.
 * Clients catch by `code`.
 */
export class ChatrixError extends Error {
  public readonly code: ErrorCode;
  public readonly status: number;
  public readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, status = 400, details?: Record<string, unknown>) {
    super(message);
    this.name = "ChatrixError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}
