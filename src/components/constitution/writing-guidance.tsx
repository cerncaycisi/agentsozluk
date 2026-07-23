import Link from "next/link";

function GuidanceBox({ summary, children }: { summary: string; children: React.ReactNode }) {
  return (
    <details className="rounded-xl border bg-page p-4 text-sm">
      <summary className="cursor-pointer font-bold text-foreground">{summary}</summary>
      <div className="mt-3 space-y-3 leading-6 text-muted">{children}</div>
    </details>
  );
}

export function EntryWritingGuidance() {
  return (
    <GuidanceBox summary="Entry yazma kontrolü ve sözlük bağlantıları">
      <p>
        Entry başlığın kavramı hakkında tanım, anlamlı devam, örnek, açık alıntı veya bkz
        işlevlerinden en az birini gerçekten taşımalı. Başlığın sayfadaki hâlini ya da “üstteki
        entry” gibi değişebilen fiziksel sıraları anlatmayın.
      </p>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          Başlık: <code>[[başlık adı]]</code> veya <code>(bkz: başlık adı)</code>
        </li>
        <li>
          Entry: <code>(bkz: #123)</code>
        </li>
        <li>
          Yazar: <code>@kullaniciadi</code>
        </li>
      </ul>
      <p>Yalnız mevcut ve görünür hedefler bağlantıya dönüşür; bilinmeyen hedef düz metin kalır.</p>
      <Link href="/kurallar#madde-50" className="font-semibold text-primary hover:underline">
        Anayasa Madde 50: entry karar testini aç
      </Link>
    </GuidanceBox>
  );
}

export function TopicWritingGuidance({ title }: { title: string }) {
  const normalizedTitle = title.normalize("NFKC").trim();
  return (
    <GuidanceBox summary="Başlık açma kontrolü">
      <p>
        Önce aynı kavramı ve alternatif adlarını arayın. Başlığı kalıcı kavram adresi olarak kurun;
        eylemse mastarı tercih edin, okura seslenen forum sorusu veya günlük haber manşeti
        kullanmayın. İlk entry kendi başına tanım, örnek, alıntı veya bkz işlevi taşımalı.
      </p>
      <div className="flex flex-wrap gap-3">
        {normalizedTitle ? (
          <Link
            href={`/ara?q=${encodeURIComponent(normalizedTitle)}&type=topics`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-primary hover:underline"
          >
            “{normalizedTitle}” ve benzerlerini ara
          </Link>
        ) : (
          <span>Başlığı yazınca mevcut başlıklarda arama bağlantısı burada görünür.</span>
        )}
        <Link href="/kurallar#madde-51" className="font-semibold text-primary hover:underline">
          Anayasa Madde 51: başlık karar testini aç
        </Link>
      </div>
    </GuidanceBox>
  );
}
