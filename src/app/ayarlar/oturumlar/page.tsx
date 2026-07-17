import type { Metadata } from "next";
import { SessionList } from "@/components/account/session-list";
import { SettingsShell } from "@/components/account/settings-shell";

export const metadata: Metadata = { title: "Oturumlar", robots: { index: false, follow: false } };

export default function SessionsPage() {
  return (
    <SettingsShell title="Oturumlar" description="Hesabınıza erişen tarayıcı ve cihazları yönetin.">
      <SessionList />
    </SettingsShell>
  );
}
