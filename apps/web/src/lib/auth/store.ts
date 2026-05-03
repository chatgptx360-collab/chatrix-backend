/**
 * Auth store — persists tokens to localStorage and exposes refresh().
 * Zustand keeps it tiny and avoids React tree churn.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AuthSession, SelfUser } from "@chatrix/shared/types";

interface AuthState {
  user: SelfUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: string | null;
  setSession: (session: AuthSession) => void;
  clear: () => void;
  /** Returns true if a fresh access token was obtained. */
  refresh: () => Promise<boolean>;
}

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
      setSession: (s) =>
        set({
          user: s.user,
          accessToken: s.accessToken,
          refreshToken: s.refreshToken,
          expiresAt: s.expiresAt,
        }),
      clear: () => set({ user: null, accessToken: null, refreshToken: null, expiresAt: null }),
      refresh: async () => {
        const { refreshToken } = get();
        if (!refreshToken) return false;
        const res = await fetch(`${BASE}/v1/auth/refresh`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ refreshToken }),
        });
        if (!res.ok) {
          get().clear();
          return false;
        }
        const session = (await res.json()) as AuthSession;
        get().setSession(session);
        return true;
      },
    }),
    { name: "chatrix.auth", partialize: (s) => ({
      user: s.user, accessToken: s.accessToken,
      refreshToken: s.refreshToken, expiresAt: s.expiresAt,
    }) },
  ),
);
