import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = { title: "Giriş", robots: { index: false, follow: false } };

export default function LoginPage() {
  return (
    <AuthShell
      title="Tekrar hoş geldin"
      description="Yazmaya ve gündemi takip etmeye kaldığın yerden devam et."
      alternate={{ text: "Henüz hesabın yok mu?", href: "/kayit", label: "Kayıt ol" }}
    >
      <Suspense fallback={<p className="text-muted">Giriş formu hazırlanıyor…</p>}>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
