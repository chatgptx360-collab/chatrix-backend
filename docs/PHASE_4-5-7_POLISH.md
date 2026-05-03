# Phase 4.5 / 5.5 / 7.5 — Polish

The deferred items from each phase, focused on the high-impact ones. Both
mobile and web were updated in lockstep so the product stays coherent across
surfaces.

---

## ✅ Shipped

### 1. Avatar upload (mobile + web) · 4.5 + 5.5

End-to-end pipeline: pick → presigned PUT → finalize → PATCH `/users/me`.

- **Shared helper** — [`lib/upload.ts`](../apps/web/src/lib/upload.ts) on web
  (XHR with `progress` events) and the [mobile sibling](../apps/mobile/src/lib/upload.ts)
  (RN fetch + Blob). Same contract: `uploadFile(file, { kind, onProgress })`
  → returns the finalized `MediaFile`.
- **Web** ([profile/page.tsx](../apps/web/src/app/(app)/settings/profile/page.tsx))
  — hidden file input behind the avatar; live percent overlay during upload;
  blob preview swaps to canonical CDN URL on `finalize`.
- **Mobile** ([profile/edit.tsx](../apps/mobile/app/profile/edit.tsx))
  — `expo-image-picker` (square crop) → `uploadAsset()` → set local state.
  Camera-glyph badge overlay on the avatar; spinner overlay while uploading.
- Size + mime guards against `MEDIA_MAX_BYTES` from `@chatrix/shared/constants`
  before the upload even starts — fast-fail UX.

### 2. Reactions picker (mobile + web) · 4.5 + 5.5

Quick-react surface for the 6 most-used emojis (`@chatrix/shared/reactions`).

- **Web** ([ReactionPicker.tsx](../apps/web/src/components/chat/ReactionPicker.tsx))
  — fixed-positioned floating popover; click-outside + Escape close.
  Anchored to the bubble's `getBoundingClientRect()` so it tracks any layout.
  Triggered by right-click OR a hover-revealed `SmilePlus` button.
- **Mobile** ([ReactionsSheet.tsx](../apps/mobile/src/components/ReactionsSheet.tsx))
  — bottom-sheet modal with the same 6 emojis at the top, plus secondary
  actions (Reply / Delete-for-everyone) underneath. Light haptic per pick.
- Reaction chips on the bubble are now clickable to **toggle** — tap your own
  reaction to remove it. Optimistic patch in the React Query cache; the
  server's `reaction:updated` socket event reconciles.

### 3. Reply UI (mobile + web) · 4.5 + 5.5

- New components [`ReplyBanner.tsx`](../apps/web/src/components/chat/ReplyBanner.tsx)
  + [mobile twin](../apps/mobile/src/components/ReplyBanner.tsx) — gradient
  side-bar, "Replying to {author}", body preview, X to cancel.
- Chat-room pages own the `replyTo` state. Banner mounts above the composer
  when a reply target exists; cleared on send or cancel.
- `MessageBubble` (web) gained a hover toolbar: **react** / **reply** /
  **delete** (mine only). Mobile gets the same actions through the
  `ReactionsSheet`'s secondary action row.
- The composer's `onSubmit` already supported `replyToId`; now we plumb the
  full target's preview into the optimistic placeholder so the bubble shows
  the quoted message instantly.

### 4. Friend requests inbox (mobile + web) · 4.5 + 5.5

- **Backend**: new `GET /v1/friends/pending` returns `{ incoming, outgoing }`
  with hydrated `user` on each. `listFriends()` also gained user hydration so
  the rows can render avatars without a second round-trip.
- **Web** ([friends/page.tsx](../apps/web/src/app/(app)/friends/page.tsx))
  — three-section layout: search results when active, pending requests
  (incoming actionable, outgoing informational), then the friends list.
- **Mobile** ([(tabs)/friends.tsx](../apps/mobile/app/(tabs)/friends.tsx))
  — same shape with section headers + Accept / Decline buttons for incoming.
- Counts on each section header double as inbox badges. Accept / decline
  invalidates both the pending and friends queries so the row moves between
  sections without a manual refresh.

### 5. Privacy editor (web) · 5.5

[settings/privacy/page.tsx](../apps/web/src/app/(app)/settings/privacy/page.tsx)
replaces the placeholder shell with a real editor:

- **Last seen** + **Profile picture** — three-way segmented control
  (Everyone / Friends / Nobody). Mirrors the schema's `lastSeen` /
  `profilePicture` enums.
- **Read receipts** — toggle. Description spells out the reciprocal effect
  (turn yours off, you stop seeing others').
- **Searchable** — toggle. Description clarifies that the share-link still
  works either way (so users don't fear "going dark" prevents friends from
  reaching them).
- All controls **commit immediately** (no Save button) — these are
  single-decision fields, not a form.
- Reuses a new [`Toggle.tsx`](../apps/web/src/components/ui/Toggle.tsx) brand
  primitive (iOS-style, brand gradient on, surface off).

### 6. Notifications editor (web) · 5.5

[settings/notifications/page.tsx](../apps/web/src/app/(app)/settings/notifications/page.tsx)
fully replaces the placeholder:

- **Browser permission gate** at the top — surfaces the right state
  (default → button to request, denied → "re-enable in browser settings",
  granted → success pill, unsupported → quiet fallback).
- Four toggles for the schema fields: messages / mentions / sounds / preview.
- Each one is committed independently to `PATCH /users/me`.

### 7. Image send (web) · 5.5

[Composer.tsx](../apps/web/src/components/chat/Composer.tsx) now supports
attachments via three input methods:

1. **Click paperclip** → file picker (image + video accepted)
2. **Drag-drop** files onto the composer (visible focus ring while dragging)
3. **Paste** with Cmd/Ctrl+V — a clipboard image attaches directly

Per-attachment behavior:
- Thumbnail preview row above the input
- Live progress overlay (0–100%) during upload
- Per-attachment X to remove (revokes the blob URL)
- Size validation against `MEDIA_MAX_BYTES`; oversized files attach in an
  `error` state with the limit shown inline
- Send button disables while any attachment is still uploading; once they
  resolve `ready`, the message ships with `attachments: [mediaId, ...]`
- Caption support — text input becomes "Add a caption (optional)" when
  attachments are present

Mobile image send is queued for Phase 5.5b — needs the picker + bottom-sheet
attachment row; the upload helper is already wired and shared.

### 8. Universal Links / App Links (Phase 7.5)

Brand share-link `chatrix.app/@kamsy` now opens the native app when installed:

- [`apps/web/public/.well-known/apple-app-site-association`](../apps/web/public/.well-known/apple-app-site-association)
  — covers `/u/*`, `/@*`, and `/chats/*` paths
- [`apps/web/public/.well-known/assetlinks.json`](../apps/web/public/.well-known/assetlinks.json)
  — Android equivalent
- [`next.config.mjs`](../apps/web/next.config.mjs) `headers()` rule sets
  `content-type: application/json` for both files (Next defaults extension-less
  files to octet-stream, which iOS rejects)
- Two placeholders to fill before shipping (Apple Team ID + Android signing
  SHA-256). Documented in the `deploy-mobile.md` troubleshooting table.

---

## ⏳ Still deferred (Phase 8)

The honest list of what's NOT done — these are real features that need real
work, not placeholders pretending to be features:

- **Voice notes** — recording UI + waveform + audio playback. Needs
  `expo-av`/`MediaRecorder` integration plus a dedicated bubble variant.
- **Mobile image send** — native picker → composer attachment row → caption
  input. Helper is shared; needs the UI.
- **Forwarding UI** — backend already accepts `forwardOf`; UI is a chat-picker
  modal opened from the bubble's hover/long-press menu.
- **Web push service worker** — VAPID keys, service worker registration,
  notification click-to-route handler. Backend hook is already wired
  ([`push.service.ts`](../apps/backend/src/modules/notifications/push.service.ts)).
- **Appearance editor** — theme picker (System / Light / Dark + custom).
  Backend stores `profiles.theme` already; UI is a one-screen build.
- **Mention parser** — `@username` autocomplete in the composer + linkify
  in bubbles + dedicated push category (the schema's `notifications.mentions`
  toggle already exists).

---

## File count delta

| Phase end                  | Files |
| -------------------------- | ----- |
| Phase 7 (last full count)  | 210   |
| After polish (this pass)   | ~225  |

New files: 2 upload helpers, 2 reaction components (ReactionPicker.tsx,
ReactionsSheet.tsx), 2 reply banners, 1 Toggle primitive, 2 well-known
files. Plus rewrites of 5 existing pages/components and 1 deliverables doc.
