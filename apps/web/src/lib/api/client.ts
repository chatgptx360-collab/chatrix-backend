/**
 * Single fetch wrapper used by every web client call.
 *  - Reads access token from the auth store.
 *  - Auto-refreshes on 401 once, then retries.
 *  - Maps non-2xx responses to ChatrixError instances.
 */
import { ChatrixError, ErrorCode } from "@chatrix/shared/errors";
import type { ApiError } from "@chatrix/shared/errors";
import { useAuthStore } from "../auth/store";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const PREFIX = "/v1";

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  /** When true, skip auth refresh handling (used by /auth/refresh itself). */
  skipRefresh?: boolean;
}

export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { skipRefresh, body, headers, ...rest } = opts;
  const auth = useAuthStore.getState();

  const res = await fetch(`${BASE}${PREFIX}${path}`, {
    ...rest,
    headers: {
      "content-type": "application/json",
      ...(auth.accessToken ? { authorization: `Bearer ${auth.accessToken}` } : {}),
      ...(headers ?? {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && !skipRefresh && auth.refreshToken) {
    const refreshed = await auth.refresh();
    if (refreshed) return api<T>(path, { ...opts, skipRefresh: true });
  }

  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as ApiError | null;
    throw new ChatrixError(
      err?.code ?? ErrorCode.UNKNOWN,
      err?.message ?? `HTTP ${res.status}`,
      res.status,
      err?.details,
    );
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
