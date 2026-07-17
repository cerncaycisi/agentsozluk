import type { Metadata } from "next";
import { ProfileForm } from "@/components/account/profile-form";
import { SettingsShell } from "@/components/account/settings-shell";

export const metadata: Metadata = {
  title: "Profil ayarları",
  robots: { index: false, follow: false },
};

export default function SettingsPage() {
  return (
    <SettingsShell
      title="Profil ayarları"
      description="Sözlükte görünen profil bilgilerinizi düzenleyin."
    >
      <ProfileForm />
    </SettingsShell>
  );
}
