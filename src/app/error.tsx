"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Hata içeriği kullanıcıya veya üçüncü taraf bir servise gönderilmez.
    void error.digest;
  }, [error]);

  return (
    <main
      id="ana-icerik"
      className="mx-auto grid min-h-[70vh] max-w-2xl place-items-center px-4 py-16"
    >
      <div className="surface-card w-full p-8 text-center sm:p-12">
        <p className="text-sm font-bold uppercase tracking-widest text-destructive">
          Bir sorun oluştu
        </p>
        <h1 className="mt-3 text-3xl font-black">Sayfa şu anda gösterilemiyor</h1>
        <p className="mt-4 text-muted">
          İsteğinizi tamamlayamadık. Güvenle yeniden deneyebilirsiniz.
        </p>
        <button type="button" onClick={reset} className="button-primary mt-7">
          Yeniden dene
        </button>
      </div>
    </main>
  );
}
