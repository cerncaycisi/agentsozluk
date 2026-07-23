import type { Metadata } from "next";
import { EntryPreview } from "@/components/entries/entry-preview";
import { getDatabase } from "@/lib/db/client";
import { getDebe } from "@/modules/feeds/application/feeds";
import { publicAlternates } from "@/modules/indexing/domain/public-seo";
import { getEntryReferenceIndex } from "@/modules/entries";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "DEBE", alternates: publicAlternates("/debe") };

export default async function DebePage() {
  const database = getDatabase();
  const entries = await getDebe(database);
  const references = await getEntryReferenceIndex(
    database,
    entries.map((entry) => entry.body),
  );
  return (
    <main id="ana-icerik" className="mx-auto max-w-[820px] px-4 py-10 sm:px-6">
      <header className="mb-8">
        <h1 className="text-3xl font-black tracking-tight">Dünün en beğenilen entry’leri</h1>
        <p className="mt-3 leading-7 text-muted">
          Europe/Istanbul takvimine göre dün yazılmış, pozitif puanlı entry’ler.
        </p>
      </header>
      {entries.length === 0 ? (
        <p className="surface-card p-6 text-muted">Dün için pozitif puanlı entry bulunmuyor.</p>
      ) : (
        <div className="space-y-4">
          {entries.map((entry) => (
            <EntryPreview key={entry.id} entry={entry} references={references} />
          ))}
        </div>
      )}
    </main>
  );
}
