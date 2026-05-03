# Deploying the Chatrix mobile app

Built with Expo, deployed via [EAS (Expo Application Services)](https://expo.dev/eas).
EAS handles the cloud build, code signing, and store submission. No Mac
required for iOS builds.

---

## Prerequisites

```bash
npm install -g eas-cli
eas login
```

You'll need:

- An [Expo account](https://expo.dev/signup) (free)
- An **Apple Developer account** ($99/year) — required for App Store + TestFlight
- A **Google Play Developer account** ($25 one-time) — required for Play Store
- A **paid EAS plan** *eventually* (free tier covers ~30 builds/month, then $19/mo)

---

## 1. First-time project setup

```bash
cd apps/mobile
eas init
```

This creates an EAS project ID and writes it back into `app.json`. Replace
the placeholder:
```json
"extra": { "eas": { "projectId": "REPLACE_ME_WITH_EAS_PROJECT_ID" } }
```

Then push the credentials to EAS:
```bash
eas credentials       # walk through iOS + Android signing keys
```

For iOS, EAS can either generate keys for you or import yours from Apple
Developer Portal. For Android, EAS generates a keystore by default — back it
up (it's the only way to ship updates to the same listing on Play).

---

## 2. Build profiles

[`apps/mobile/eas.json`](../apps/mobile/eas.json) defines three profiles:

| Profile        | Distribution            | API URL                            |
| -------------- | ----------------------- | ---------------------------------- |
| `development`  | Internal (dev client)   | `http://localhost:4000`            |
| `preview`      | Internal (TestFlight / Play Internal) | `https://staging-api.chatrix.app`  |
| `production`   | App Store + Play Store  | `https://api.chatrix.app`          |

### Triggering builds

```bash
# Local dev client (run on simulator)
eas build --profile development --platform ios

# Internal QA — TestFlight + Play Internal
eas build --profile preview --platform all

# Store-ready
eas build --profile production --platform all
```

Builds run on EAS cloud. iOS uses an `m-medium` resource class (~10 min build);
Android builds in ~5 min.

---

## 3. App Store + Play Store metadata

EAS handles binaries — *metadata* (description, keywords, screenshots,
review questions) is set up once in:

- **App Store Connect** — [appstoreconnect.apple.com](https://appstoreconnect.apple.com)
  - Create the app under Bundle ID `app.chatrix.client` (matches `app.json`)
  - Privacy policy URL: `https://chatrix.app/legal/privacy`
  - Support URL: `https://chatrix.app/help`
  - Encryption export compliance: declare *standard* encryption (HTTPS only;
    if/when you ship E2E, switch to *non-standard* and file the export form)

- **Google Play Console** — [play.google.com/console](https://play.google.com/console)
  - Create the app under package name `app.chatrix.client`
  - Data Safety form: declare what you collect (email, username, messages,
    media). Be honest — Google's review team checks.

### Screenshot strategy

Expo's [snack tool](https://snack.expo.dev) + simulator screenshots cover
the basics. For polished store assets, run the dev client on a simulator
device (iPhone 15 Pro, Pixel 8 Pro for the right aspect ratios) and capture
**at least**:

- Welcome screen
- Chat list with a few sample conversations
- Chat room with bubbles + typing indicator
- Profile/settings hub

5-7 screenshots per platform is enough.

---

## 4. Submitting to the stores

After a successful production build:

```bash
# Submit the latest production build to App Store Connect (TestFlight first)
eas submit --profile production --platform ios

# Submit to Google Play (releaseStatus is "draft" by default per eas.json —
# review and promote in Play Console)
eas submit --profile production --platform android
```

iOS submissions land in **TestFlight** for internal review, then promote
through Apple's review queue (1-3 days).

Android submissions land in the **Internal Testing** track first; promote
to Production via the Play Console.

---

## 5. Over-the-air updates (optional but recommended)

Expo's OTA is the killer feature — JS-only changes ship without a store
review (under 24 hours, vs. days for a full submission).

```bash
eas update --branch production --message "Fix typing-indicator flicker"
```

The `expo-updates` library is auto-included. Channels in `eas.json` map
each build profile to its update branch:

- `development` → `development` channel
- `preview`     → `preview`
- `production`  → `production`

⚠️ **Limits**: native code changes (new Expo modules, dependency upgrades that
include native code) still require a full build + store submission. JS-only
changes ship via `eas update`.

---

## 6. Push notifications

The backend already has the Expo push fanout wired (see
[push.service.ts](../apps/backend/src/modules/notifications/push.service.ts:1)).
For production:

1. **Generate an Expo access token** at [expo.dev → Account → Access Tokens](https://expo.dev/settings/access-tokens)
2. Set it on the backend:
   ```
   EXPO_ACCESS_TOKEN=expo_xxx_xxx
   ```
   This is used to authenticate the server's calls to the Expo push API
   (eliminates rate-limiting that hits unauthenticated calls).
3. The mobile app's [auth/store.ts](../apps/mobile/src/lib/auth/store.ts:1)
   already includes a `device.pushToken` field on signup/login — register
   the device's `ExpoPushToken` here when the app first runs.

(The registration call happens in `expo-notifications`'s `getExpoPushTokenAsync`.
Phase 4.5 adds the explicit hook — for now, the field is wired through but
not populated.)

---

## 7. Versioning

`eas.json` sets `appVersionSource: "remote"` and `autoIncrement: true` on
the production profile — every build bumps the build number automatically.

The user-visible version (`0.1.0`) lives in `app.json`. Bump it manually for
new feature releases:

```bash
# In apps/mobile
npm version minor    # 0.1.0 → 0.2.0
git commit -am "Release 0.2.0"
git tag v0.2.0
```

Then run `eas build --profile production --platform all`.

---

## 8. Common gotchas

| Symptom | Fix |
| --- | --- |
| iOS build fails with "Invalid signing certificate" | Run `eas credentials` and regenerate distribution cert |
| Push tokens come back empty in dev | Tokens only populate in **standalone builds** — not in Expo Go |
| Android Play Internal won't accept the upload | Bump the version in `app.json` and rebuild — Play rejects duplicate version codes |
| Universal Link `chatrix.app/@kamsy` doesn't open the app on iOS | Replace `REPLACE_WITH_TEAM_ID` in [`apple-app-site-association`](../apps/web/public/.well-known/apple-app-site-association) with your Apple Team ID. Verify with `curl -s https://chatrix.app/.well-known/apple-app-site-association \| jq` (must return JSON, not HTML). |
| Universal Link works on iOS but app doesn't open on Android | Same idea — fill in `REPLACE_WITH_RELEASE_KEY_SHA256_FINGERPRINT` in [`assetlinks.json`](../apps/web/public/.well-known/assetlinks.json). Get it via `keytool -list -v -keystore <release.keystore>` (look for `SHA256:` line). For EAS-managed signing: `eas credentials -p android` and copy the SHA-256 there. |
| TestFlight crash on launch with "Library not loaded: @rpath/..." | Native module mismatch — clean prebuild: `npx expo prebuild --clean` |

---

## 9. Cost summary

| Cost                           | Amount                    |
| ------------------------------ | ------------------------- |
| Apple Developer membership     | $99/year                  |
| Google Play Developer one-time | $25                       |
| EAS Hobby (≤30 builds/month)   | $0                        |
| EAS Production (unlimited)     | $19/mo                    |
| Expo push (free tier)          | $0 (with `EXPO_ACCESS_TOKEN`) |

For a pre-revenue MVP: Apple + Google fees + free EAS tier = ~$125 first
year. Move to EAS Production once you ship updates more than every 2-3 days.
