"use client";

import { useState } from "react";
import { EntryBody } from "@/components/entries/entry-body";

export function BlockedEntryBody({ body }: { body: string }) {
  const [revealed, setRevealed] = useState(false);
  if (revealed) return <EntryBody body={body} />;
  return (
    <div className="rounded-xl border border-dashed bg-page p-4">
      <p className="text-sm text-muted">Bu entry engellediğiniz bir yazar tarafından yazıldı.</p>
      <button
        type="button"
        onClick={() => setRevealed(true)}
        className="mt-3 text-sm font-bold text-primary hover:underline"
      >
        Entry’yi bir kez göster
      </button>
    </div>
  );
}
