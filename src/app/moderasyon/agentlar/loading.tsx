export default function AgentDashboardLoading() {
  return (
    <div role="status" aria-live="polite" className="space-y-4 py-8">
      <p className="font-bold">Agent dashboard yükleniyor…</p>
      {[1, 2, 3].map((item) => (
        <div key={item} className="surface-card animate-pulse p-6">
          <div className="h-5 w-48 rounded bg-muted/20" />
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="h-12 rounded bg-muted/20" />
            <div className="h-12 rounded bg-muted/20" />
            <div className="h-12 rounded bg-muted/20" />
          </div>
        </div>
      ))}
    </div>
  );
}
