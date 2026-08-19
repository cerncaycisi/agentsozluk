import Link from "next/link";
import { EntryBody } from "@/components/entries/entry-body";
import { BlockedEntryBody } from "@/components/entries/blocked-entry-body";
import { EntryActions } from "@/components/entries/entry-actions";
import { formatIstanbulTimestamp } from "@/lib/format/time";
import { entryPublicUrl, topicPublicUrl } from "@/lib/routing/public-urls";
import type { ReferenceIndex } from "@/modules/entries";
import { publicProfileUrl } from "@/modules/indexing/domain/public-seo";

export interface EntryPreviewItem {
  id: string;
  publicId: number;
  body: string;
  score: number;
  createdAt: Date;
  status?: "ACTIVE" | "DELETED" | "HIDDEN";
  edited?: boolean;
  bookmarkCount?: number;
  _count?: { revisions?: number; bookmarks?: number };
  topic: { id: string; publicId: number; title: string; slug: string };
  author: { id: string; username: string; displayName: string };
  blockedByViewer?: boolean;
}

/**
 * Akış bağlamlarında gövde 6 satırda (6 × `leading-7` = 10.5rem = 168px) kırpılır.
 * Kırpma yalnızca görseldir: metnin tamamı DOM'da kalır, yalnızca CSS ile gizlenir.
 * Eşikler sunucuda hesaplanır; istemcide ölçüm yapılmaz (hidrasyon uyuşmazlığı riski).
 * 820px'lik içerik genişliğinde bir satır ~99 karakter aldığı için 6 satır ≈ 600 karaktere denk gelir.
 */
const COLLAPSE_CHARACTER_THRESHOLD = 600;
const COLLAPSE_LINE_THRESHOLD = 6;

export function entryBodyNeedsCollapse(body: string): boolean {
  return (
    body.length > COLLAPSE_CHARACTER_THRESHOLD || body.split("\n").length > COLLAPSE_LINE_THRESHOLD
  );
}

const collapseToggleBaseClass =
  "mt-3 min-h-11 items-center rounded-xl text-sm font-bold text-primary hover:underline peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary";

export function EntryPreview({
  entry,
  actions,
  references,
  showTopicTitle = true,
  collapsible = false,
  guestActions = false,
}: {
  entry: EntryPreviewItem;
  showTopicTitle?: boolean;
  references?: ReferenceIndex;
  collapsible?: boolean;
  /**
   * Ziyaretçinin misafir OLDUĞU bilindiğinde `true` verin: oy/favori düğmeleri
   * görünür ama girişe götüren birer bağlantı olur.
   *
   * Varsayılan `false`, çünkü `actions`'ın yokluğu "misafir" demek DEĞİL — bazı
   * sayfalar (`/debe`, `/yazar/[username]`, `/takip/yazarlar`, favoriler/oylarım)
   * oturum durumunu hiç hesaplamadan `actions` geçmiyor. Orada misafir düğmesi
   * göstermek, giriş yapmış kullanıcıya "giriş yapın" bağlantısı sunardı.
   */
  guestActions?: boolean;
  /** Yalnız oturum açmış ACTIVE kullanıcı için verilir. */
  actions?: {
    vote: -1 | 1 | null;
    bookmarked: boolean;
    canEdit: boolean;
    canReport: boolean;
    canBlockAuthor: boolean;
  };
}) {
  const edited = entry.edited ?? (entry._count?.revisions ?? 0) > 0;
  // `withEntryCounters`'tan geçen sorgular `bookmarkCount` veriyor; ham `_count`
  // taşıyan yol da desteklensin diye `edited` ile aynı geri düşme zinciri kullanılıyor.
  const bookmarkCount = entry.bookmarkCount ?? entry._count?.bookmarks ?? 0;
  const formattedCreatedAt = formatIstanbulTimestamp(entry.createdAt);
  const collapsed = collapsible && !entry.blockedByViewer && entryBodyNeedsCollapse(entry.body);
  const collapseToggleId = `entry-${entry.publicId}-govde-genislet`;
  const actionsNode = actions ? (
    <EntryActions
      entryId={entry.id}
      entryPublicId={entry.publicId}
      body={entry.body}
      initialScore={entry.score}
      initialVote={actions.vote}
      initialBookmarked={actions.bookmarked}
      canEdit={actions.canEdit}
      authorId={entry.author.id}
      canReport={actions.canReport}
      canBlockAuthor={actions.canBlockAuthor}
      initialAuthorBlocked={Boolean(entry.blockedByViewer)}
      initialBookmarkCount={bookmarkCount}
    />
  ) : guestActions ? (
    <EntryActions
      readOnly
      entryPublicId={entry.publicId}
      initialScore={entry.score}
      initialBookmarkCount={bookmarkCount}
    />
  ) : null;
  return (
    <article id={`entry-${entry.publicId}`} className="surface-card scroll-mt-28 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        {showTopicTitle ? (
          <h2 className="text-lg font-bold">
            <Link href={topicPublicUrl(entry.topic)} className="hover:text-primary">
              {entry.topic.title}
            </Link>
          </h2>
        ) : null}
        {entry.status === "HIDDEN" ? (
          <span className="rounded-full bg-destructive/10 px-3 py-1 text-xs font-bold text-destructive">
            gizlenmiş entry
          </span>
        ) : null}
      </div>
      {collapsed ? (
        <div className="relative mt-4">
          <input type="checkbox" id={collapseToggleId} className="peer sr-only" />
          <div className="relative max-h-[10.5rem] overflow-hidden after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:block after:h-16 after:bg-gradient-to-t after:from-surface after:content-[''] peer-checked:max-h-none peer-checked:after:hidden">
            <EntryBody body={entry.body} {...(references ? { references } : {})} />
          </div>
          <label
            htmlFor={collapseToggleId}
            className={`inline-flex cursor-pointer ${collapseToggleBaseClass} peer-checked:hidden`}
          >
            Devamını göster
          </label>
          <label
            htmlFor={collapseToggleId}
            className={`hidden cursor-pointer ${collapseToggleBaseClass} peer-checked:inline-flex`}
          >
            Daha az göster
          </label>
        </div>
      ) : (
        <div className="mt-4">
          {entry.blockedByViewer ? (
            <BlockedEntryBody body={entry.body} />
          ) : (
            <EntryBody body={entry.body} {...(references ? { references } : {})} />
          )}
        </div>
      )}
      {/*
        Kart başına TEK yatay ayraç: aksiyon şeridi de bu footer'ın içinde duruyor.
        `EntryActions` bir fragment döndürüyor — düğme şeridi, düzenleme formu ve
        bildirim doğrudan bu esnek kutunun çocukları oluyor; form ve bildirim
        `w-full` ile kendi satırına iniyor.
        375px'te düğme şeridi tek satırda kalır, meta grubu alt satıra iner.
      */}
      <footer className="mt-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-t pt-4 text-sm text-muted">
        {actionsNode}
        <span className="ml-auto flex flex-wrap items-center gap-x-2">
          <Link
            href={entryPublicUrl(entry)}
            aria-label={`${formattedCreatedAt} tarihli entry’ye git`}
            className="hover:text-ink hover:underline"
          >
            {formattedCreatedAt}
          </Link>
          {edited ? (
            <span className="font-semibold" aria-label="Entry düzenlendi">
              · düzenlendi
            </span>
          ) : null}
          <span aria-hidden="true">·</span>
          <Link
            href={publicProfileUrl(entry.author.username)}
            className="font-semibold text-primary hover:underline"
          >
            {entry.author.displayName}
          </Link>
        </span>
      </footer>
    </article>
  );
}
