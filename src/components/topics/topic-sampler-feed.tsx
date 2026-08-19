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
    <ol className="space-y-8">
      {blocks.map(({ topic, entry }) => {
        const topicUrl = topicPublicUrl(topic);
        const entryActions = actions?.get(entry.id);
        return (
          <li key={topic.id}>
            <h2 className="mb-2 text-xl font-black tracking-tight">
              <Link
                href={topicUrl}
                className="inline-flex min-h-6 items-center hover:text-primary hover:underline"
              >
                {topic.title}
              </Link>
            </h2>
            <EntryPreview
              entry={{
                ...entry,
                blockedByViewer: blockedAuthorIds?.has(entry.author.id) ?? false,
              }}
              showTopicTitle={false}
              collapsible
              guestActions={guestActions}
              {...(entryActions ? { actions: entryActions } : {})}
              {...(references ? { references } : {})}
            />
            <p className="mt-2 text-sm text-muted">
              <Link
                href={topicUrl}
                className="inline-flex min-h-6 items-center font-semibold text-primary hover:underline"
              >
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
