import { describe, it, expect } from "vitest";
import { PasswordService } from "./password.service";
import type { Env } from "../../config/env";

/**
 * Real argon2 — no mocks. Cost params are minimum-allowed so the suite stays fast.
 * The point is to verify the wiring (hash format, verify outcomes), not the KDF itself.
 */
const env = {
  ARGON2_MEMORY_COST: 8192,  // 8MB — minimum that argon2 accepts
  ARGON2_TIME_COST: 1,
  ARGON2_PARALLELISM: 1,
} as unknown as Env;

const svc = new PasswordService(env);

describe("PasswordService", () => {
  it("produces an argon2id hash that includes the cost params", async () => {
    const hash = await svc.hash("hunter2-better-be-good");
    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(hash).toMatch(/m=\d+,t=\d+,p=\d+/);
  });

  it("verify returns true for the right password", async () => {
    const hash = await svc.hash("correct horse battery staple");
    expect(await svc.verify(hash, "correct horse battery staple")).toBe(true);
  });

  it("verify returns false for the wrong password", async () => {
    const hash = await svc.hash("correct horse battery staple");
    expect(await svc.verify(hash, "wrong horse battery staple")).toBe(false);
  });

  it("verify returns false (never throws) on a malformed hash", async () => {
    expect(await svc.verify("not-a-real-hash", "anything")).toBe(false);
  });

  it("two hashes of the same password differ (random salt)", async () => {
    const a = await svc.hash("same-password");
    const b = await svc.hash("same-password");
    expect(a).not.toEqual(b);
  });
});
