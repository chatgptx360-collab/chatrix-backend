import { useState } from "react";
import { ScrollView, View, Text, Pressable, StyleSheet, Alert, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { ArrowLeft, Camera } from "lucide-react-native";
import * as ImagePicker from "expo-image-picker";
import { Screen } from "@/components/Screen";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { useTheme } from "@/lib/ui/theme";
import { useAuthStore } from "@/lib/auth/store";
import { ApiUsers } from "@/lib/api/client";
import { uploadAsset } from "@/lib/upload";
import { ChatrixError } from "@chatrix/shared/errors";
import { constants } from "@chatrix/shared";

/**
 * Edit profile. Display name, bio, and avatar.
 *
 * Avatar upload uses the two-phase flow: pick image → POST /media/init →
 * PUT to presigned URL → POST /media/:id/finalize → PATCH /users/me with
 * the new avatar URL. Wired up below; falls back gracefully if the picker
 * isn't available (Expo Go on some platforms).
 */
export default function EditProfile() {
  const t = useTheme();
  const router = useRouter();
  const me = useAuthStore((s) => s.user);
  const setSession = useAuthStore((s) => s.setSession);

  const [displayName, setDisplayName] = useState(me?.displayName ?? "");
  const [bio,         setBio]         = useState(me?.bio ?? "");
  const [avatarUrl,   setAvatarUrl]   = useState<string | null>(me?.avatarUrl ?? null);
  const [previewUri,  setPreviewUri]  = useState<string | null>(null);
  const [uploading,   setUploading]   = useState(false);
  const [busy,        setBusy]        = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  if (!me) return <Screen />;

  async function pickAvatar() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "We need access to your photos to update your avatar.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [1, 1], quality: 0.85,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;

    setError(null);
    setPreviewUri(asset.uri);          // instant local preview
    setUploading(true);
    try {
      const media = await uploadAsset({
        uri: asset.uri,
        mimeType: asset.mimeType ?? "image/jpeg",
        width: asset.width, height: asset.height,
        fileSize: asset.fileSize ?? null,
      }, { kind: "image" });
      setAvatarUrl(media.url);
      setPreviewUri(null);             // server URL takes over
    } catch (err) {
      setPreviewUri(null);
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
      // Refresh stored user.
      setSession({
        user: updated as any,
        accessToken: useAuthStore.getState().accessToken!,
        refreshToken: useAuthStore.getState().refreshToken!,
        expiresAt: useAuthStore.getState().expiresAt!,
      });
      router.back();
    } catch (err) {
      setError(err instanceof ChatrixError ? err.message : "Couldn't save changes.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen edges={["top"]}>
      <View style={[s.header, { borderBottomColor: t.colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={8}><ArrowLeft size={24} color={t.colors.fg} /></Pressable>
        <Text style={[s.title, { color: t.colors.fg }]}>Edit profile</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
        <View style={{ alignItems: "center", marginBottom: 24 }}>
          <Pressable onPress={pickAvatar} disabled={uploading} hitSlop={8} style={{ position: "relative" }}>
            <Avatar
              url={previewUri ?? avatarUrl}
              name={me.displayName ?? me.username}
              size={96}
            />
            {uploading && (
              <View
                style={{
                  position: "absolute", inset: 0,
                  backgroundColor: "rgba(0,0,0,0.45)",
                  borderRadius: 48,
                  alignItems: "center", justifyContent: "center",
                }}
              >
                <ActivityIndicator color="#fff" />
              </View>
            )}
            {!uploading && (
              <View
                style={{
                  position: "absolute", right: 0, bottom: 0,
                  backgroundColor: t.colors.primary,
                  width: 30, height: 30, borderRadius: 15,
                  alignItems: "center", justifyContent: "center",
                  borderWidth: 3, borderColor: t.colors.bg,
                }}
              >
                <Camera size={14} color="#fff" />
              </View>
            )}
          </Pressable>
          <Pressable onPress={pickAvatar} disabled={uploading} hitSlop={6}>
            <Text style={{ marginTop: 10, color: t.colors.primary, fontWeight: "600" }}>
              {uploading ? "Uploading…" : "Change photo"}
            </Text>
          </Pressable>
        </View>

        <Input
          label="Display name"
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Your name"
          maxLength={64}
        />
        <Input
          label="Bio"
          value={bio}
          onChangeText={setBio}
          placeholder="A short line about you"
          multiline
          maxLength={280}
          style={{ minHeight: 100 }}
        />

        <View style={{ marginTop: 8, padding: 14, borderRadius: 14, backgroundColor: t.colors.surface, borderWidth: 1, borderColor: t.colors.border }}>
          <Text style={{ fontSize: 12, fontWeight: "700", color: t.colors.muted, letterSpacing: 0.4 }}>YOUR @ HANDLE</Text>
          <Text style={{ fontSize: 16, fontWeight: "600", color: t.colors.fg, marginTop: 4 }}>@{me.username}</Text>
          <Text style={{ fontSize: 12, color: t.colors.muted, marginTop: 6 }}>{constants.profileLink(me.username)}</Text>
        </View>

        {!!error && <Text style={{ color: t.colors.danger, marginTop: 12 }}>{error}</Text>}

        <View style={{ marginTop: 20 }}>
          <Button label="Save changes" onPress={save} loading={busy} />
        </View>
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  title:  { fontSize: 16, fontWeight: "600" },
});
