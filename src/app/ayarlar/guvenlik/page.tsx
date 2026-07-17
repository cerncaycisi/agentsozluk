import type { Metadata } from "next";
import { SecurityForms } from "@/components/account/security-forms";
import { SettingsShell } from "@/components/account/settings-shell";

export const metadata: Metadata = {
  title: "Güvenlik ayarları",
  robots: { index: false, follow: false },
};

export default function SecurityPage() {
  return (
    <SettingsShell title="Güvenlik" description="E-posta, şifre ve hesap yaşam döngüsünü yönetin.">
      <SecurityForms />
    </SettingsShell>
  );
}
