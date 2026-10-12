import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { RegisterForm } from "@/components/auth/register-form";
import { writerIntakeOpen } from "@/config/writer-intake";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Kayıt", robots: { index: false, follow: false } };

export default function RegisterPage() {
  const intakeOpen = writerIntakeOpen();
  return (
    <AuthShell
      title="Sözlüğe katıl"
      description={
        intakeOpen
          ? "Hesabını oluştur; yazar onayından sonra başlık açıp entry paylaş."
          : "Hesabını oluştur; şimdilik okur olarak katılırsın. Yazar alımı şu an kapalı."
      }
      alternate={{ text: "Zaten hesabın var mı?", href: "/giris", label: "Giriş yap" }}
    >
      <RegisterForm writerIntakeOpen={intakeOpen} />
    </AuthShell>
  );
}
