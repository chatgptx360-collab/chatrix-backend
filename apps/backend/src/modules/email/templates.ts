/**
 * Transactional email templates. Inline-styled for maximum compatibility
 * with mail clients (Gmail, Outlook, Apple Mail) that strip <style> blocks.
 *
 * Template philosophy:
 *  - One column, single CTA, no images at the top (so they render even with
 *    images blocked by default).
 *  - Plain-text fallback for every HTML email.
 *  - Brand gradient appears as a background gradient on the CTA button only —
 *    falls back to solid primary if gradients aren't supported.
 */

interface Rendered {
  subject: string;
  html: string;
  text: string;
}

const PRIMARY = "#634AF6";
const ACCENT = "#0ED3FF";
const FG = "#11131F";
const MUTED = "#6D7184";
const BG = "#FAFAFC";
const SURFACE = "#FFFFFF";
const BORDER = "#E4E6EC";

function shell(opts: { preview: string; heading: string; body: string; ctaLabel?: string; ctaUrl?: string; footer?: string }): string {
  // The hidden preview controls what shows up in the email-list preview pane.
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="x-apple-disable-message-reformatting" />
    <title>${escape(opts.heading)}</title>
  </head>
  <body style="margin:0;padding:0;background:${BG};font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif;color:${FG};">
    <div style="display:none;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;mso-hide:all;">${escape(opts.preview)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:40px 16px;">
      <tr><td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:${SURFACE};border:1px solid ${BORDER};border-radius:20px;overflow:hidden;">
          <tr><td style="padding:32px 36px 8px 36px;">
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td style="vertical-align:middle;padding-right:10px;">
                  <div style="width:28px;height:28px;border-radius:8px;background:linear-gradient(135deg, ${PRIMARY} 0%, ${ACCENT} 100%);"></div>
                </td>
                <td style="vertical-align:middle;font-size:18px;font-weight:600;letter-spacing:-0.01em;">Chatrix</td>
              </tr>
            </table>
          </td></tr>
          <tr><td style="padding:24px 36px 8px 36px;">
            <h1 style="margin:0 0 12px 0;font-size:24px;line-height:1.25;font-weight:600;color:${FG};">${escape(opts.heading)}</h1>
            <div style="font-size:15px;line-height:1.6;color:${FG};">${opts.body}</div>
          </td></tr>
          ${opts.ctaUrl && opts.ctaLabel ? `
          <tr><td style="padding:24px 36px 32px 36px;" align="left">
            <a href="${opts.ctaUrl}" style="display:inline-block;padding:14px 22px;background:${PRIMARY};background-image:linear-gradient(135deg, ${PRIMARY} 0%, ${ACCENT} 100%);color:#ffffff;text-decoration:none;border-radius:999px;font-weight:600;font-size:15px;">${escape(opts.ctaLabel)}</a>
            <div style="margin-top:14px;font-size:13px;color:${MUTED};">If the button doesn't work, paste this link into your browser:<br/><span style="word-break:break-all;">${escape(opts.ctaUrl)}</span></div>
          </td></tr>` : ""}
          <tr><td style="padding:0 36px 28px 36px;border-top:1px solid ${BORDER};">
            <p style="margin:24px 0 0 0;font-size:12px;line-height:1.6;color:${MUTED};">
              ${opts.footer ?? "You received this because someone (hopefully you) used this email on Chatrix."}<br/>
              Chatrix · chatrix.app · <a href="https://chatrix.app/legal/privacy" style="color:${MUTED};">Privacy</a> · <a href="https://chatrix.app/legal/terms" style="color:${MUTED};">Terms</a>
            </p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]!));
}

// ---------- Templates ----------

export function renderVerifyEmail(args: { username: string; verifyUrl: string }): Rendered {
  const subject = "Verify your Chatrix email";
  const html = shell({
    preview: "Confirm your email to finish setting up Chatrix.",
    heading: "Confirm your email",
    body: `
      <p style="margin:0 0 12px 0;">Hey <strong>@${escape(args.username)}</strong>,</p>
      <p style="margin:0 0 12px 0;">Tap the button below to verify your email and unlock your account. The link expires in 24 hours.</p>
    `,
    ctaLabel: "Verify email",
    ctaUrl: args.verifyUrl,
    footer: "Didn't sign up? You can safely ignore this email — no account will be created until it's verified.",
  });
  const text = `Hey @${args.username},

Confirm your email to finish setting up Chatrix:
${args.verifyUrl}

The link expires in 24 hours. If you didn't sign up, you can ignore this email.`;
  return { subject, html, text };
}

export function renderResetPasswordEmail(args: { username: string; resetUrl: string }): Rendered {
  const subject = "Reset your Chatrix password";
  const html = shell({
    preview: "Use this link to choose a new Chatrix password.",
    heading: "Reset your password",
    body: `
      <p style="margin:0 0 12px 0;">Hi <strong>@${escape(args.username)}</strong>,</p>
      <p style="margin:0 0 12px 0;">We received a request to reset your password. Tap below to pick a new one. The link expires in 1 hour and can only be used once.</p>
    `,
    ctaLabel: "Reset password",
    ctaUrl: args.resetUrl,
    footer: "Didn't ask for this? Your password is unchanged — you can safely ignore this email. For peace of mind, we sign you out of all devices when you reset.",
  });
  const text = `Hi @${args.username},

Reset your Chatrix password:
${args.resetUrl}

The link expires in 1 hour and can only be used once. If you didn't request this, your password is unchanged.`;
  return { subject, html, text };
}

export function renderWelcomeEmail(args: { username: string }): Rendered {
  const subject = `Welcome to Chatrix, @${args.username}`;
  const html = shell({
    preview: "Your Chatrix account is ready.",
    heading: "Welcome to Chatrix",
    body: `
      <p style="margin:0 0 12px 0;">Your username is <strong>@${escape(args.username)}</strong>. Share this link to let anyone add you:</p>
      <p style="margin:0 0 12px 0;background:${BG};border:1px solid ${BORDER};border-radius:12px;padding:12px 14px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;">chatrix.app/@${escape(args.username)}</p>
      <p style="margin:0;">Have fun. Be kind. Stay private.</p>
    `,
    footer: "You can change notification + privacy settings any time from your profile.",
  });
  const text = `Welcome to Chatrix, @${args.username}.
Share this link to let anyone add you: chatrix.app/@${args.username}`;
  return { subject, html, text };
}
