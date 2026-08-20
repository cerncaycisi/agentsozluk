import Link from "next/link";
import { EntryPreview, type EntryPreviewActions } from "@/components/entries/entry-preview";
import { topicPublicUrl } from "@/lib/routing/public-urls";
import type { HomeSamplerBlock } from "@/modules/feeds/application/feeds";
import type { ReferenceIndex } from "@/modules/entries";

/**
 * "Başlık + o başlıktan tek entry" bloklarının tekrarı. Ana sayfa akışı bu.
 *
 * Entry gövdeleri **her zaman** `collapsible` ile gösterilir: bir bloktaki uzun bir
 * entry aksi hâlde diğer dokuz bloğu ekranın dışına iter ve sayfa oryantasyon
 * görevini kaybeder.
 */
export function TopicSamplerFeed({
  blocks,
  references,
  guestActions = false,
  actions,
  blockedAuthorIds,
  emptyMessage,
}: {
  blocks: readonly HomeSamplerBlock[];
  references?: ReferenceIndex;
  /** Ziyaretçinin misafir OLDUĞU biliniyorsa `true`. Bkz. `EntryPreview`. */
  guestActions?: boolean;
  /**
   * Oturum açmış ACTIVE kullanıcı için entry id'sine göre aksiyonlar. Sayfa
   * hazırlar (tek sorguda), bileşen yalnız dağıtır — burada veri çekilmez.
   */
  actions?: ReadonlyMap<string, EntryPreviewActions>;
  /**
   * Ziyaretçinin engellediği yazarlar. `actions` verildiğinde bu ŞART: aksi hâlde
   * engellenmiş yazarın entry'si maskesiz görünür ve yanında "engelle" düğmesi
   * çıkar — engel zaten koyulmuşken.
   */
  blockedAuthorIds?: ReadonlySet<string>;
  emptyMessage: string;
}) {
  if (blocks.length === 0) return <p className="surface-card p-6 text-muted">{emptyMessage}</p>;
  return (
    /* Ayraç bloğun tamamını sarar: başlık + entry + "başlığa git" tek bir birim.
       `EntryPreview` kendi çizgisini çizseydi başlıkla entry'sinin arasına düşerdi,
       bu yüzden `divider={false}`. */
    <ol>
      {blocks.map(({ topic, entry }) => {
        const topicUrl = topicPublicUrl(topic);
        const entryActions = actions?.get(entry.id);
        return (
          <li key={topic.id} className="border-t py-4">
            <h2 className="title-section mb-2">
              <Link href={topicUrl} className="link-quiet">
                {topic.title}
              </Link>
            </h2>
            <EntryPreview
              entry={{
                ...entry,
                blockedByViewer: blockedAuthorIds?.has(entry.author.id) ?? false,
              }}
              showTopicTitle={false}
              divider={false}
              collapsible
              guestActions={guestActions}
              {...(entryActions ? { actions: entryActions } : {})}
              {...(references ? { references } : {})}
            />
            <p className="mt-2 text-sm text-muted">
              <Link href={topicUrl} className="link-strong font-semibold">
                başlığa git
              </Link>
              <span aria-hidden="true"> · </span>
              {topic.entryCount} entry
            </p>
          </li>
        );
      })}
    </ol>
  );
}
