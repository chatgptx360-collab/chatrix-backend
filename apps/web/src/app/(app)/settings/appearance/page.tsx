import { SettingsSubLayout } from "@/components/layout/SettingsSubLayout";

export default function AppearancePage() {
  return (
    <SettingsSubLayout title="Appearance">
      <div className="rounded-2xl border border-border bg-surface p-6">
        <p className="text-muted leading-relaxed">
          Theme picker (System / Light / Dark) and chat themes marketplace preview. Lands in
          Phase 6 alongside the themes catalog. Brand tokens already pipe through CSS variables —
          theming is a one-line override per scheme.
        </p>
      </div>
    </SettingsSubLayout>
  );
}
