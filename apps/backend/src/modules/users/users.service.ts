import { Injectable } from "@nestjs/common";
import { ChatrixError, ErrorCode } from "@chatrix/shared/errors";
import type { PublicUser, SelfUser, UUID } from "@chatrix/shared/types";
import type { UpdateProfileInput } from "@chatrix/shared/schemas";
import { DatabaseService } from "../../db/database.service";

@Injectable()
export class UsersService {
  constructor(private readonly db: DatabaseService) {}

  /** Public lookup by @username — used by the search bar and share-link routes. */
  async getByUsername(username: string, viewerId?: UUID): Promise<PublicUser> {
    const row = await this.db.oneOrNull<{
      id: UUID; username: string; display_name: string | null; avatar_url: string | null;
      bio: string | null; presence: PublicUser["presence"]; last_seen_at: Date | null;
      privacy: { searchable: boolean; lastSeen: PublicUser["presence"] };
    }>(
      `SELECT u.id, u.username, p.display_name, p.avatar_url, p.bio, p.presence, p.last_seen_at, p.privacy
         FROM users u
         JOIN profiles p ON p.user_id = u.id
        WHERE u.username = $1 AND u.deleted_at IS NULL AND u.status = 'active'`,
      [username],
    );
    if (!row) throw new ChatrixError(ErrorCode.NOT_FOUND, "User not found.", 404);
    if (!row.privacy.searchable && row.id !== viewerId) {
      throw new ChatrixError(ErrorCode.NOT_FOUND, "User not found.", 404);
    }
    return {
      id: row.id,
      username: row.username,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      bio: row.bio,
      presence: row.presence,
      lastSeenAt: row.last_seen_at?.toISOString() ?? null,
    };
  }

  /** Trigram + prefix search — fronted by `users_username_trgm_idx`. */
  async search(query: string, limit = 20): Promise<PublicUser[]> {
    const q = query.trim().replace(/^@/, "");
    if (q.length < 2) return [];
    return this.db.many<any>(
      `SELECT u.id, u.username, p.display_name, p.avatar_url, p.bio, p.presence, p.last_seen_at
         FROM users u
         JOIN profiles p ON p.user_id = u.id
        WHERE u.deleted_at IS NULL AND u.status = 'active'
          AND (p.privacy ->> 'searchable')::boolean = true
          AND (u.username ILIKE $1 OR u.username % $2 OR p.display_name % $2)
        ORDER BY similarity(u.username, $2) DESC
        LIMIT $3`,
      [`${q}%`, q, limit],
    ).then((rows) =>
      rows.map((row) => ({
        id: row.id,
        username: row.username,
        displayName: row.display_name,
        avatarUrl: row.avatar_url,
        bio: row.bio,
        presence: row.presence,
        lastSeenAt: row.last_seen_at?.toISOString() ?? null,
      })),
    );
  }

  /** Patch profile. Only the fields the user explicitly sent are updated. */
  async updateProfile(userId: UUID, patch: UpdateProfileInput): Promise<SelfUser> {
    const fields: string[] = [];
    const values: unknown[] = [userId];
    let i = 2;
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) continue;
      const col = ({
        displayName: "display_name",
        bio: "bio",
        avatarUrl: "avatar_url",
        bannerUrl: "banner_url",
        theme: "theme",
        locale: "locale",
        privacy: "privacy",
        notifications: "notifications",
      } as Record<string, string>)[k];
      if (!col) continue;
      fields.push(`${col} = $${i++}`);
      values.push(v);
    }
    if (fields.length) {
      await this.db.query(`UPDATE profiles SET ${fields.join(", ")} WHERE user_id = $1`, values);
    }
    // Caller (the controller) refreshes via AuthService.loadSelf; we keep the
    // single source of truth there to avoid drift.
    return null as unknown as SelfUser;
  }
}
