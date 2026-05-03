"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2 } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { SettingsSubLayout } from "@/components/layout/SettingsSubLayout";
import { useAuthStore } from "@/lib/auth/store";
import { ApiUsers } from "@/lib/api/endpoints";
import { uploadFile } from "@/lib/upload";
import { ChatrixError } from "@chatrix/shared/errors";
import { profileLink, BIO_MAX_LENGTH, DISPLAY_NAME_MAX_LENGTH, MEDIA_MAX_BYTES } from "@chatrix/shared/constants";

/**
 * Edit profile — display name + bio + avatar upload.
 *
 * Avatar flow:
 *   click overlay → hidden file input → uploadFile() (init/PUT/finalize) →
 *   PATCH /users/me with the new avatarUrl → refresh local store.
 *
 * The previewURL (object URL) gives instant visual feedback while the upload
 * runs; we revoke it once the server returns the canonical URL.
 */
export default function EditProfilePage() {
  const router = useRouter();
  const me = useAuthStore((s) => s.user);
  const setSession = useAuthStore((s) => s.setSession);
  const fileRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState(me?.displayName ?? "");
  const [bio,         setBio]         = useState(me?.bio ?? "");
  const [busy,        setBusy]        = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [uploading,   setUploading]   = useState(false);
  const [uploadPct,   setUploadPct]   = useState(0);
  const [previewUrl,  setPreviewUrl]  = useState<string | null>(null);
  const [avatarUrl,   setAvatarUrl]   = useState<string | null>(me?.avatarUrl ?? null);

  if (!me) return null;

  async function pickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;

    setError(null);
    if (file.size > MEDIA_MAX_BYTES.image) {
      setError(`Avatars must be under ${Math.round(MEDIA_MAX_BYTES.image / 1024 / 1024)} MB.`);
      return;
    }

    const localPreview = URL.createObjectURL(file);
    setPreviewUrl(localPreview);
    setUploading(true);
    setUploadPct(0);
    try {
      const media = await uploadFile(file, {
        kind: "image",
        onProgress: setUploadPct,
      });
      setAvatarUrl(media.url);     // server-canonical URL — survives reload
      URL.revokeObjectURL(localPreview);
      setPreviewUrl(null);
    } catch (err) {
      URL.revokeObjectURL(localPreview);
      setPreviewUrl(null);
      setError(err instanceof ChatrixError ? err.message : "Upload failed. Try again.");
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    setError(null);
    setBusy(true);
    try {
      const updated = await ApiUsers.updateMe({
        displayName: displayName.trim() || null,
        bio:         bio.trim() || null,
        avatarUrl:   avatarUrl,
      });
      const auth = useAuthStore.getState();
      setSession({
        user: updated,
        accessToken:  auth.accessToken!,
        refreshToken: auth.refreshToken!,
        expiresAt:    auth.expiresAt!,
      });
      router.push("/settings");
    } catch (err) {
      setError(err instanceof ChatrixError ? err.message : "Couldn't save changes.");
    } finally {
      setBusy(false);
    }
  }

  const displayedAvatar = previewUrl ?? avatarUrl;

  return (
    <SettingsSubLayout title="Edit profile">
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={pickAvatar}
      />

      <div className="flex flex-col items-center mb-6">
        <button
          type="button"
          aria-label="Change photo"
          className="relative group"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
        >
          <Avatar url={displayedAvatar} name={me.displayName ?? me.username} size={104} />
          <span className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/40 transition flex items-center justify-center text-white opacity-0 group-hover:opacity-100">
            {uploading ? <Loader2 size={20} className="animate-spin" /> : <Camera size={20} />}
          </span>
          {uploading && (
            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-fg/80 text-bg text-[10px] font-bold tabular-nums">
              {Math.round(uploadPct * 100)}%
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="mt-3 text-primary text-sm font-semibold hover:underline disabled:opacity-50"
        >
          {uploading ? "Uploading…" : "Change photo"}
        </button>
      </div>

      <Input
        label="Display name"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        placeholder="Your name"
        maxLength={DISPLAY_NAME_MAX_LENGTH}
      />
      <div>
        <label className="block text-[11px] font-bold uppercase tracking-wider text-muted mb-1.5">Bio</label>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="A short line about you"
          maxLength={BIO_MAX_LENGTH}
          rows={4}
          className="w-full bg-surface border border-border rounded-2xl px-4 py-3 text-[15px] text-fg placeholder:text-muted outline-none focus:border-primary/60 transition resize-none"
        />
        <p className="mt-1.5 text-right text-[11px] text-muted">{bio.length}/{BIO_MAX_LENGTH}</p>
      </div>

      <div className="mt-3 rounded-2xl border border-border bg-surface px-4 py-3.5">
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted">Your @ handle</p>
        <p className="mt-1 text-[16px] font-semibold text-fg">@{me.username}</p>
        <p className="mt-1 text-[12px] text-muted">{profileLink(me.username)}</p>
      </div>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      <div className="mt-6">
        <Button label="Save changes" onClick={save} loading={busy} disabled={uploading} fullWidth />
      </div>
    </SettingsSubLayout>
  );
}
