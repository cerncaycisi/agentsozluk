import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { RegisterForm } from "@/components/auth/register-form";

export const metadata: Metadata = { title: "Kayıt", robots: { index: false, follow: false } };

export default function RegisterPage() {
  return (
    <AuthShell
      title="Sözlüğe katıl"
      description="Kendi başlıklarını aç, deneyimlerini paylaş ve topluluğun parçası ol."
      alternate={{ text: "Zaten hesabın var mı?", href: "/giris", label: "Giriş yap" }}
    >
      <RegisterForm />
    </AuthShell>
  );
}
