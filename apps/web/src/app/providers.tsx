"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, useEffect } from "react";

/**
 * Top-level client providers.
 *   - React Query (data fetching + cache)
 *   - Theme detection (system → class on <html>)
 *
 * Auth/session state is in `src/lib/auth/store.ts` (Zustand) — no provider needed.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
        },
      }),
  );

  useEffect(() => {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => document.documentElement.classList.toggle("dark", mql.matches);
    apply();
    mql.addEventListener("change", apply);
    return () => mql.removeEventListener("change", apply);
  }, []);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
