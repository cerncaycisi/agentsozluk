import type { Metadata } from "next";
import Link from "next/link";
import { EntryPreview } from "@/components/entries/entry-preview";
import { getDatabase } from "@/lib/db/client";
import { formatIstanbulDate } from "@/lib/format/time";
import { entryPublicUrl } from "@/lib/routing/public-urls";
import { getDebe } from "@/modules/feeds/application/feeds";
import { previousIstanbulDayWindow } from "@/modules/feeds/domain/time";
import { publicAlternates } from "@/modules/indexing/domain/public-seo";
import { getEntryReferenceIndex } from "@/modules/entries";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "DEBE", alternates: publicAlternates("/debe") };

export default async function DebePage() {
  const database = getDatabase();
  const now = new Date();
  const debeDay = previousIstanbulDayWindow(now).start;
  const formattedDebeDay = formatIstanbulDate(debeDay);
  const entries = await getDebe(database, now);
  const references = await getEntryReferenceIndex(
    database,
    entries.map((entry) => entry.body),
  );
  return (
    <main id="ana-icerik" className="page-main">
      <header className="mb-8">
        <h1 className="text-3xl font-black tracking-tight">Dünün en beğenilen entry’leri</h1>
        <p className="text-accent-contrast mt-2 text-sm font-bold">{formattedDebeDay}</p>
        <p className="mt-3 leading-7 text-muted">
          Europe/Istanbul takvimine göre dün yazılmış, pozitif puanlı entry’ler.
        </p>
      </header>
      {entries.length === 0 ? (
        <p className="surface-card p-6 text-muted">Dün için pozitif puanlı entry bulunmuyor.</p>
      ) : (
        <ol className="space-y-4">
          {entries.map((entry, index) => (
            <li key={entry.id} className="sm:flex sm:items-start sm:gap-3">
              <Link
                href={entryPublicUrl(entry)}
                aria-label={`DEBE ${index + 1}. sıradaki entry’ye git`}
                className="text-accent-contrast mb-1 inline-block text-sm font-bold hover:underline sm:mb-0 sm:mt-5 sm:shrink-0"
              >
                #{index + 1}
              </Link>
              <div className="min-w-0 sm:flex-1">
                <EntryPreview entry={entry} references={references} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
