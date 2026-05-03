import { Injectable } from "@nestjs/common";
import argon2 from "argon2";
import { Env } from "../../config/env";

/**
 * Argon2id — modern KDF recommended by OWASP for password storage.
 * Cost params come from env so we can tune them as hardware improves.
 */
@Injectable()
export class PasswordService {
  constructor(private readonly env: Env) {}

  hash(plain: string): Promise<string> {
    return argon2.hash(plain, {
      type: argon2.argon2id,
      memoryCost: this.env.ARGON2_MEMORY_COST,
      timeCost: this.env.ARGON2_TIME_COST,
      parallelism: this.env.ARGON2_PARALLELISM,
    });
  }

  /**
   * Constant-time verification. Returns false on any error so we never
   * leak info via timing or thrown exceptions.
   */
  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  }
}
