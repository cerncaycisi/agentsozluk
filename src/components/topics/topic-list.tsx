import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { tr } from "date-fns/locale";
import { topicPublicUrl } from "@/lib/routing/public-urls";

export interface TopicListItem {
  id: string;
  publicId: number;
  title: string;
  slug: string;
  entryCount: number;
  lastEntryAt: Date | null;
}

/**
 * Satır hover'ı `.state-layer` ile geliyor. Eski hâl `transition hover:bg-page`
 * idi ve koyu temada görünmüyordu (yüzey/zemin farkı 1.075'ti). `.menu-item`
 * kullanılamazdı: o sınıf `text-sm` ve kendi dolgusunu dayatıyor, buradaki satır
 * 17px gövde metniyle akıyor.
 *
 * `group-hover:text-primary` kalktı. Sistemin hover dilbilgisinde renk değişimi
 * TEK yönlü: sönük metin `--ink`e çıkar, hiçbir yerde primary'ye dönmez
 * (`.link-quiet`, `.chip`, `.icon-button` hepsi böyle). Üstelik ölçüldü: örtülü
 * yüzey üstünde primary koyu temada 4.616'ya iniyor, yani en dar marjlı çift
 * bu satır yüzünden oluşuyordu. Hover artık altçizgi + örtü ile anlatılıyor.
 */
export function TopicList({
  topics,
  emptyMessage,
}: {
  topics: TopicListItem[];
  emptyMessage: string;
}) {
  if (topics.length === 0) return <p className="surface-card p-6 text-muted">{emptyMessage}</p>;
  return (
    <ol className="surface-card divide-y overflow-hidden">
      {topics.map((topic) => (
        <li key={topic.id}>
          <Link
            href={topicPublicUrl(topic)}
            className="state-layer group flex min-h-11 items-center justify-between gap-3 px-4 py-2.5"
          >
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="truncate font-medium group-hover:underline">{topic.title}</span>
              {topic.lastEntryAt ? (
                <span className="hidden shrink-0 text-xs text-muted sm:inline">
                  son entry{" "}
                  {formatDistanceToNow(topic.lastEntryAt, { addSuffix: true, locale: tr })}
                </span>
              ) : null}
            </span>
            <span className="shrink-0 text-xs text-muted">{topic.entryCount} entry</span>
          </Link>
        </li>
      ))}
    </ol>
  );
}
