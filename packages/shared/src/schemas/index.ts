/**
 * Zod validation schemas. Imported by the backend (DTOs) and clients
 * (form validation) so the rules are defined exactly once.
 */
import { z } from "zod";
import {
  USERNAME_REGEX,
  USERNAME_MIN_LENGTH,
  USERNAME_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  DISPLAY_NAME_MAX_LENGTH,
  BIO_MAX_LENGTH,
  MESSAGE_TEXT_MAX_LENGTH,
} from "../constants";

// ===== Primitives =====

export const uuidSchema = z.string().uuid();

export const usernameSchema = z
  .string()
  .min(USERNAME_MIN_LENGTH)
  .max(USERNAME_MAX_LENGTH)
  .regex(USERNAME_REGEX, "Must start with a letter and use only letters, numbers, or underscores.");

export const emailSchema = z.string().email().max(254).toLowerCase();

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH)
  .max(PASSWORD_MAX_LENGTH)
  // Soft policy — keep the gate at length, score the rest in UI.
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), {
    message: "Password must contain letters and numbers.",
  });

// ===== Auth =====

export const signupSchema = z.object({
  username: usernameSchema,
  email: emailSchema,
  password: passwordSchema,
  displayName: z.string().min(1).max(DISPLAY_NAME_MAX_LENGTH).optional(),
  device: z
    .object({
      platform: z.enum(["ios", "android", "web", "desktop"]),
      deviceName: z.string().max(120).optional(),
      pushToken: z.string().max(500).optional(),
    })
    .optional(),
});
export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  // Accept either username OR email in one field — UX win.
  identifier: z.string().min(3).max(254),
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  device: signupSchema.shape.device,
});
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(20),
});

export const requestPasswordResetSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z.object({
  token: z.string().min(20),
  password: passwordSchema,
});

export const verifyEmailSchema = z.object({ token: z.string().min(20) });

// ===== Profile =====

export const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(DISPLAY_NAME_MAX_LENGTH).nullable().optional(),
  bio: z.string().max(BIO_MAX_LENGTH).nullable().optional(),
  avatarUrl: z.string().url().nullable().optional(),
  bannerUrl: z.string().url().nullable().optional(),
  theme: z.string().max(64).optional(),
  locale: z.string().max(10).optional(),
  privacy: z
    .object({
      lastSeen: z.enum(["everyone", "contacts", "nobody"]),
      profilePicture: z.enum(["everyone", "contacts", "nobody"]),
      readReceipts: z.boolean(),
      searchable: z.boolean(),
    })
    .partial()
    .optional(),
  notifications: z
    .object({
      mentions: z.boolean(),
      messages: z.boolean(),
      sounds: z.boolean(),
      preview: z.boolean(),
    })
    .partial()
    .optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

// ===== Social =====

export const friendActionSchema = z.object({ userId: uuidSchema });

// ===== Chat / Messages =====

export const createDmSchema = z.object({ peerId: uuidSchema });

export const createGroupSchema = z.object({
  title: z.string().min(1).max(80),
  description: z.string().max(280).optional(),
  memberIds: z.array(uuidSchema).min(1).max(256),
});

export const sendMessageSchema = z.object({
  chatId: uuidSchema,
  // Either body (text) or attachments (or both for captioned media).
  body: z.string().max(MESSAGE_TEXT_MAX_LENGTH).optional(),
  kind: z.enum(["text", "image", "video", "audio", "file", "gif"]).default("text"),
  replyToId: uuidSchema.optional(),
  forwardOf: uuidSchema.optional(),
  attachments: z.array(uuidSchema).max(10).optional(),
  // Idempotency key — clients generate (e.g. crypto.randomUUID())
  clientId: z.string().min(8).max(64).optional(),
}).refine((m) => !!m.body || (m.attachments && m.attachments.length > 0) || !!m.forwardOf, {
  message: "Message must have a body, attachments, or be a forward.",
});
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export const editMessageSchema = z.object({
  messageId: uuidSchema,
  body: z.string().min(1).max(MESSAGE_TEXT_MAX_LENGTH),
});

export const deleteMessageSchema = z.object({
  messageId: uuidSchema,
  scope: z.enum(["me", "everyone"]),
});

export const reactionSchema = z.object({
  messageId: uuidSchema,
  emoji: z.string().min(1).max(16),
});

// ===== Media =====

export const initUploadSchema = z.object({
  kind: z.enum(["image", "video", "audio", "file", "gif"]),
  mimeType: z.string().min(3).max(120),
  sizeBytes: z.number().int().positive(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  durationMs: z.number().int().nonnegative().optional(),
});
export type InitUploadInput = z.infer<typeof initUploadSchema>;

// ===== Reports =====

export const createReportSchema = z.object({
  targetKind: z.enum(["user", "message", "chat"]),
  targetId: uuidSchema,
  reason: z.string().min(3).max(200),
  details: z.string().max(2000).optional(),
});
