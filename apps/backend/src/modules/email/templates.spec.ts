import { describe, it, expect } from "vitest";
import { renderVerifyEmail, renderResetPasswordEmail, renderWelcomeEmail } from "./templates";

describe("email templates", () => {
  describe("verify", () => {
    const out = renderVerifyEmail({ username: "kamsy", verifyUrl: "https://chatrix.app/verify-email?token=abc" });

    it("includes the username and link", () => {
      expect(out.html).toContain("@kamsy");
      expect(out.html).toContain("https://chatrix.app/verify-email?token=abc");
      expect(out.text).toContain("@kamsy");
      expect(out.text).toContain("https://chatrix.app/verify-email?token=abc");
    });

    it("escapes HTML in the username", () => {
      const malicious = renderVerifyEmail({ username: '<script>alert(1)</script>', verifyUrl: "https://x" });
      expect(malicious.html).not.toContain("<script>alert(1)</script>");
      expect(malicious.html).toContain("&lt;script&gt;");
    });
  });

  it("reset email surfaces sign-out warning in text fallback", () => {
    const out = renderResetPasswordEmail({ username: "kamsy", resetUrl: "https://chatrix.app/reset?token=xyz" });
    expect(out.text.toLowerCase()).toContain("expires in 1 hour");
    expect(out.text).toContain("https://chatrix.app/reset?token=xyz");
  });

  it("welcome email mentions the canonical share link", () => {
    const out = renderWelcomeEmail({ username: "kamsy" });
    expect(out.html).toContain("chatrix.app/@kamsy");
    expect(out.text).toContain("chatrix.app/@kamsy");
  });
});
