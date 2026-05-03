/**
 * Mobile auth store. Tokens live in expo-secure-store (Keychain / Keystore),
 * not AsyncStorage — refresh tokens are sensitive.
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import * as SecureStore from "expo-secure-store";
import type { AuthSession, SelfUser } from "@chatrix/shared/types";

interface AuthState {
  user: SelfUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: string | null;
  setSession: (s: AuthSession) => void;
  clear: () => void;
  refresh: () => Promise<boolean>;
}

const BASE = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000";

const secureStorage = {
  getItem: async (key: string) => (await SecureStore.getItemAsync(key)) ?? null,
  setItem: async (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: async (key: string) => SecureStore.deleteItemAsync(key),
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null, accessToken: null, refreshToken: null, expiresAt: null,
      setSession: (s) => set({
        user: s.user, accessToken: s.accessToken,
        refreshToken: s.refreshToken, expiresAt: s.expiresAt,
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
        if (!res.ok) { get().clear(); return false; }
        get().setSession((await res.json()) as AuthSession);
        return true;
      },
    }),
    {
      name: "chatrix.auth",
      storage: createJSONStorage(() => secureStorage),
      partialize: (s) => ({
        user: s.user, accessToken: s.accessToken,
        refreshToken: s.refreshToken, expiresAt: s.expiresAt,
      }),
    },
  ),
);
