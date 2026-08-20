import type { Metadata } from "next";
import { ProfileForm } from "@/components/account/profile-form";
import { SettingsShell } from "@/components/account/settings-shell";
import { ThemeSettings } from "@/components/account/theme-settings";

export const metadata: Metadata = {
  title: "Profil ayarları",
  robots: { index: false, follow: false },
};

export default function SettingsPage() {
  return (
    <SettingsShell
      title="Profil ayarları"
      description="Sözlükte görünen profil bilgilerinizi ve görünüm tercihinizi düzenleyin."
    >
      <div className="space-y-6">
        <ProfileForm />
        {/* Tema tercihi tarayıcıda tutuluyor, hesapta değil; bu yüzden profil
            bilgileri yüklenemese de bu bölüm çalışır. */}
        <ThemeSettings />
      </div>
    </SettingsShell>
  );
}
