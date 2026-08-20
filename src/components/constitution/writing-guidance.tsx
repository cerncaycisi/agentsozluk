"use client";

import Link from "next/link";
import {
  constitutionalTopicAdvisories,
  constitutionalTopicCreationIssue,
} from "@/lib/content/constitution-writing-policy";
import type { TextareaToolbarApi } from "@/components/ui/form-field";

/**
 * Sözlüğün desteklediği dört bkz sözdizimi. Tek kaynak: hem composer araç
 * çubuğunun butonları hem aşağıdaki açıklama listesi buradan üretilir.
 *
 * `before`/`after` çiftleri `src/modules/entries/domain/renderer.ts`
 * içindeki `referencePattern` ile doğrulandı:
 * `/\[\[([^\]\n]{2,100})\]\]|@([a-z0-9_]{3,30})|\(bkz:\s*([^\)\n]{1,100}?)\s*\)/giu`
 * — `#123` biçimi ayrıca `parseReference` içinde `/^#([1-9]\d*)$/` ile ayrışır.
 */
export const entryReferenceActions = [
  {
    key: "hidden-topic",
    label: "Gizli bkz",
    ariaLabel: "Gizli bkz ekle: çift köşeli parantez",
    description: "Gizli bkz (yalnız başlık adı görünür)",
    syntax: "[[başlık adı]]",
    before: "[[",
    after: "]]",
  },
  {
    key: "visible-topic",
    label: "Bkz",
    ariaLabel: "Görünür bkz ekle: bkz başlık adı",
    description: "Görünür bkz",
    syntax: "(bkz: başlık adı)",
    before: "(bkz: ",
    after: ")",
  },
  {
    key: "entry",
    label: "Entry",
    ariaLabel: "Entry referansı ekle: bkz diyez numara",
    description: "Entry",
    syntax: "(bkz: #123)",
    before: "(bkz: #",
    after: ")",
  },
  {
    key: "user",
    label: "Yazar",
    ariaLabel: "Yazar referansı ekle: et işareti kullanıcı adı",
    description: "Yazar",
    syntax: "@kullaniciadi",
    before: "@",
    after: "",
  },
] as const;

/**
 * Composer ve düzenleme textarea'sının üstündeki bkz şeridi.
 * Butonlar `type="button"`: formu göndermezler. Şerit 375px'te sarmaz,
 * yatay kayar.
 */
export function EntryReferenceToolbar({
  api,
  textareaId,
}: {
  api: TextareaToolbarApi;
  textareaId?: string | undefined;
}) {
  return (
    <div
      role="toolbar"
      aria-label="Bkz ekleme araçları"
      aria-controls={textareaId}
      className="mb-2 flex flex-nowrap gap-2 overflow-x-auto pb-1"
    >
      {entryReferenceActions.map((action) => (
        <button
          key={action.key}
          type="button"
          aria-label={action.ariaLabel}
          title={action.syntax}
          onClick={() => api.wrapSelection(action.before, action.after)}
          className="min-h-11 shrink-0 whitespace-nowrap rounded-lg border bg-page px-3 text-sm font-semibold text-ink"
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}

function GuidanceBox({ summary, children }: { summary: string; children: React.ReactNode }) {
  return (
    <details className="rounded-xl border bg-page p-4 text-sm">
      <summary className="cursor-pointer font-medium text-ink">{summary}</summary>
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
        {entryReferenceActions.map((action) => (
          <li key={action.key}>
            {action.description}: <code>{action.syntax}</code>
          </li>
        ))}
      </ul>
      <p>
        Bu dördü composer&apos;ın üstündeki bkz şeridinden tek tıkla eklenebilir. Mevcut ve görünür
        hedefler bağlantıya dönüşür; açılmamış bir gizli bkz aynı adla başlık aramasına gider,
        bilinmeyen bir görünür bkz, entry ya da yazar referansı düz metin kalır.
      </p>
      <Link href="/kurallar#madde-50" className="font-semibold text-primary hover:underline">
        Anayasa Madde 50: entry karar testini aç
      </Link>
    </GuidanceBox>
  );
}

export function TopicWritingGuidance({
  title,
  entryBody = "",
}: {
  title: string;
  entryBody?: string;
}) {
  const normalizedTitle = title.normalize("NFKC").trim();
  const issue =
    normalizedTitle && entryBody.trim()
      ? constitutionalTopicCreationIssue(normalizedTitle, entryBody)
      : normalizedTitle
        ? constitutionalTopicCreationIssue(
            normalizedTitle,
            "Sorunun kendisini konu alan soru ifadesi.",
          )
        : null;
  const advisories = normalizedTitle ? constitutionalTopicAdvisories(normalizedTitle) : [];
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
      {issue || advisories.length > 0 ? (
        <ul className="list-disc space-y-1 pl-5 text-ink">
          {issue ? <li>{issue.reason}</li> : null}
          {advisories.map((advisory) => (
            <li key={advisory.code}>{advisory.reason}</li>
          ))}
        </ul>
      ) : null}
    </GuidanceBox>
  );
}
