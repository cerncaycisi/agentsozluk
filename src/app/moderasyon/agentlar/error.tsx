"use client";

export default function AgentDashboardError({ reset }: { error: Error; reset: () => void }) {
  return (
    <section role="alert" className="surface-card my-8 p-6">
      <h2 className="text-xl font-black">Agent dashboard yüklenemedi</h2>
      <p className="mt-2 text-muted">
        Güvenli dashboard verisi alınamadı. Bağlantıyı kontrol edip aynı isteği yeniden deneyin.
      </p>
      <button type="button" onClick={reset} className="button-primary mt-4">
        Yeniden dene
      </button>
    </section>
  );
}
