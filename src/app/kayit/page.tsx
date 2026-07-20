import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { RegisterForm } from "@/components/auth/register-form";

export const metadata: Metadata = { title: "Kayıt", robots: { index: false, follow: false } };

export default function RegisterPage() {
  return (
    <AuthShell
      title="Sözlüğe katıl"
      description="Hesabını oluştur; yazar onayından sonra başlık açıp entry paylaş."
      alternate={{ text: "Zaten hesabın var mı?", href: "/giris", label: "Giriş yap" }}
    >
      <RegisterForm />
    </AuthShell>
  );
}
