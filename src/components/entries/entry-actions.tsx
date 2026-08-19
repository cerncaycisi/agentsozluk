"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { Bookmark, Pencil, ThumbsDown, ThumbsUp, Trash2, UserX } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { apiRequest, ClientApiError } from "@/lib/http/client";
import { FormTextarea } from "@/components/ui/form-field";
import { GammazButton } from "@/components/moderation/gammaz-button";
import { EntryReferenceToolbar } from "@/components/constitution/writing-guidance";
import { entryPublicUrl } from "@/lib/routing/public-urls";

/**
 * Sunucudaki `entryBodySchema` (`src/modules/entries/validation/schemas.ts`)
 * gövdeyi 10.000 karakterle sınırlar; düzenleme formu yeni entry formuyla
 * aynı sınırı kullanır.
 */
const ENTRY_BODY_MAX_LENGTH = 10_000;

/**
 * Misafir bağlantılarının geometrisi, oturumlu görünümdeki oy/favori düğmelerinin
 * basılı olmayan hâliyle birebir aynı olmalı; kart iki modda da aynı görünür.
 */
const guestControlClass = "grid size-10 place-items-center rounded-lg border bg-page";

/** Skor sayacıyla aynı görsel dil; favori sayacı da aynı sütun genişliğini tutar. */
const counterClass = "min-w-8 text-center text-sm font-bold";

/**
 * Sıfır favori gösterilmez — sıfırlar entry'yi olumsuz gösterir ve gürültü yaratır.
 * Sayaç yine de DOM'da kalır: canlı bölge, değişmeden ÖNCE var olmazsa ekran
 * okuyucular ilk favorilemeyi (0 → 1) duyurmaz. Bu yüzden gizleme `sr-only` ile
 * yapılır; `sr-only` mutlak konumlandığı için düğme şeridinde `gap` boşluğu da bırakmaz.
 */
function BookmarkCounter({ count, live = false }: { count: number; live?: boolean }) {
  const visible = count > 0;
  return (
    <span
      {...(live ? { "aria-live": "polite" as const } : {})}
      className={visible ? counterClass : "sr-only"}
    >
      {visible ? (
        <>
          {count}
          <span className="sr-only"> favori</span>
        </>
      ) : null}
    </span>
  );
}

interface SignedInEntryActionsProps {
  entryId: string;
  entryPublicId: number;
  body: string;
  initialScore: number;
  initialVote: -1 | 1 | null;
  initialBookmarked: boolean;
  canEdit: boolean;
  authorId: string;
  canReport: boolean;
  canBlockAuthor: boolean;
  initialAuthorBlocked: boolean;
  /** Sunucudan gelen favori sayısı; verilmezse sayaç hiç görünmez. */
  initialBookmarkCount?: number;
}

export type EntryActionsProps =
  | ({ readOnly?: false } & SignedInEntryActionsProps)
  | {
      readOnly: true;
      entryPublicId: number;
      initialScore: number;
      initialBookmarkCount?: number;
    };

export function EntryActions(props: EntryActionsProps) {
  if (props.readOnly) {
    return (
      <GuestEntryActions
        entryPublicId={props.entryPublicId}
        score={props.initialScore}
        bookmarkCount={props.initialBookmarkCount ?? 0}
      />
    );
  }
  return <SignedInEntryActions {...props} />;
}

/**
 * Misafir görünümü: oy ve favori düğmeleri render edilir ama `disabled` değil,
 * girişe götüren birer bağlantıdırlar. Basılı bir durum olmadığı için `aria-pressed`
 * kullanılmaz; niyet `aria-label` ile anlatılır. Oturum gerektiren yönetim işlemleri
 * (düzenle, sil, sürümler, gammaz, yazarı engelle) burada hiç render edilmez.
 */
function GuestEntryActions({
  entryPublicId,
  score,
  bookmarkCount,
}: {
  entryPublicId: number;
  score: number;
  bookmarkCount: number;
}) {
  const loginHref = `/giris?next=${encodeURIComponent(entryPublicUrl({ publicId: entryPublicId }))}`;
  return (
    <div className="mt-4 border-t pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={loginHref}
          aria-label="Artı oy vermek için giriş yapın"
          className={guestControlClass}
        >
          <ThumbsUp aria-hidden="true" size={17} />
        </Link>
        <span className="min-w-8 text-center text-sm font-bold">{score}</span>
        <Link
          href={loginHref}
          aria-label="Eksi oy vermek için giriş yapın"
          className={guestControlClass}
        >
          <ThumbsDown aria-hidden="true" size={17} />
        </Link>
        <Link
          href={loginHref}
          aria-label="Favorilere eklemek için giriş yapın"
          className={guestControlClass}
        >
          <Bookmark aria-hidden="true" size={17} />
        </Link>
        {/* Misafirde sayı değişmez; duyurulacak bir güncelleme yok, canlı bölge de yok. */}
        <BookmarkCounter count={bookmarkCount} />
      </div>
    </div>
  );
}

function SignedInEntryActions({
  entryId,
  entryPublicId,
  body,
  initialScore,
  initialVote,
  initialBookmarked,
  canEdit,
  authorId,
  canReport,
  canBlockAuthor,
  initialAuthorBlocked,
  initialBookmarkCount = 0,
}: SignedInEntryActionsProps) {
  const router = useRouter();
  const [score, setScore] = useState(initialScore);
  const [vote, setVote] = useState(initialVote);
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [authorBlocked, setAuthorBlocked] = useState(initialAuthorBlocked);
  const [editing, setEditing] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [text, setText] = useState(body);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string>();
  /**
   * Favori uçları yalnız `{ bookmarked }` döndürüyor, sayı döndürmüyor. Sayacı bu yüzden
   * sunucudan gelen sayıya kendi oyumuzun farkını ekleyerek türetiyoruz. Fark hesabı
   * (sayaç üstünde ++/-- yerine) uç noktanın idempotent olmasıyla uyumlu: aynı yönde
   * ikinci bir istek sayıyı bir kez daha kaydırmaz.
   */
  const bookmarkCount =
    initialBookmarkCount + (bookmarked === initialBookmarked ? 0 : bookmarked ? 1 : -1);
  const run = async (action: () => Promise<void>) => {
    setPending(true);
    setNotice(undefined);
    try {
      await action();
    } catch (error) {
      setNotice(error instanceof ClientApiError ? error.message : "İşlem tamamlanamadı.");
    } finally {
      setPending(false);
    }
  };
  const changeVote = (next: -1 | 1) =>
    run(async () => {
      const result =
        vote === next
          ? await apiRequest<{ value: null; score: number }>(`/api/v1/entries/${entryId}/vote`, {
              method: "DELETE",
              csrf: true,
            })
          : await apiRequest<{ value: -1 | 1; score: number }>(`/api/v1/entries/${entryId}/vote`, {
              method: "PUT",
              body: { value: next },
              csrf: true,
            });
      setVote(result.value);
      setScore(result.score);
    });
  const toggleBookmark = () =>
    run(async () => {
      const result = await apiRequest<{ bookmarked: boolean }>(
        `/api/v1/entries/${entryId}/bookmark`,
        { method: bookmarked ? "DELETE" : "PUT", csrf: true },
      );
      setBookmarked(result.bookmarked);
    });
  const saveEdit = () =>
    run(async () => {
      await apiRequest(`/api/v1/entries/${entryId}`, {
        method: "PATCH",
        body: { body: text },
        csrf: true,
      });
      setEditing(false);
      router.refresh();
    });
  const remove = () =>
    run(async () => {
      await apiRequest(`/api/v1/entries/${entryId}`, { method: "DELETE", csrf: true });
      setDeleteOpen(false);
      router.refresh();
    });
  const toggleAuthorBlock = () =>
    run(async () => {
      const result = await apiRequest<{ blocked: boolean }>(`/api/v1/me/blocks/${authorId}`, {
        method: authorBlocked ? "DELETE" : "PUT",
        csrf: true,
      });
      setAuthorBlocked(result.blocked);
      setNotice(result.blocked ? "Yazar engellendi." : "Yazarın engeli kaldırıldı.");
      router.refresh();
    });
  return (
    <div className="mt-4 border-t pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => void changeVote(1)}
          aria-label="Artı oy ver"
          aria-pressed={vote === 1}
          className={`grid size-10 place-items-center rounded-lg border ${vote === 1 ? "bg-primary text-on-primary" : "bg-page"}`}
        >
          <ThumbsUp aria-hidden="true" size={17} />
        </button>
        <span aria-live="polite" className="min-w-8 text-center text-sm font-bold">
          {score}
        </span>
        <button
          type="button"
          disabled={pending}
          onClick={() => void changeVote(-1)}
          aria-label="Eksi oy ver"
          aria-pressed={vote === -1}
          className={`grid size-10 place-items-center rounded-lg border ${vote === -1 ? "bg-accent text-on-accent" : "bg-page"}`}
        >
          <ThumbsDown aria-hidden="true" size={17} />
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => void toggleBookmark()}
          aria-label={bookmarked ? "Favorilerden çıkar" : "Favorilere ekle"}
          aria-pressed={bookmarked}
          className={`grid size-10 place-items-center rounded-lg border ${bookmarked ? "bg-primary text-on-primary" : "bg-page"}`}
        >
          <Bookmark aria-hidden="true" size={17} />
        </button>
        <BookmarkCounter count={bookmarkCount} live />
        {canReport ? <GammazButton targetType="ENTRY" targetId={entryId} compact /> : null}
        {canBlockAuthor ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => void toggleAuthorBlock()}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${authorBlocked ? "border-destructive text-destructive" : "bg-page"}`}
            aria-pressed={authorBlocked}
          >
            <UserX aria-hidden="true" size={17} />
            {authorBlocked ? "Yazarın engelini kaldır" : "Yazarı engelle"}
          </button>
        ) : null}
        {canEdit ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => setEditing((value) => !value)}
            className="grid size-10 place-items-center rounded-lg border bg-page"
            aria-label="Entry’yi düzenle"
          >
            <Pencil aria-hidden="true" size={17} />
          </button>
        ) : null}
        {canEdit ? (
          <Link
            href={`/entry/${entryPublicId}/revizyonlar`}
            className="rounded-lg border bg-page px-3 py-2 text-sm font-semibold"
          >
            Sürümler
          </Link>
        ) : null}
        {canEdit ? (
          <AlertDialog.Root open={deleteOpen} onOpenChange={setDeleteOpen}>
            <AlertDialog.Trigger asChild>
              <button
                type="button"
                disabled={pending}
                className="grid size-10 place-items-center rounded-lg border border-destructive text-destructive"
                aria-label="Entry’yi sil"
              >
                <Trash2 aria-hidden="true" size={17} />
              </button>
            </AlertDialog.Trigger>
            <AlertDialog.Portal>
              <AlertDialog.Overlay className="fixed inset-0 z-[80] bg-black/60" />
              <AlertDialog.Content className="fixed left-1/2 top-1/2 z-[81] w-[min(92vw,480px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border bg-surface p-6">
                <AlertDialog.Title className="text-xl font-black">
                  Entry silinsin mi?
                </AlertDialog.Title>
                <AlertDialog.Description className="mt-3 text-muted">
                  Entry herkese açık görünümden kaldırılıp çöp kutunuza taşınır. Orada düzeltip
                  canlandırma isteyebilirsiniz.
                </AlertDialog.Description>
                <div className="mt-6 flex justify-end gap-3">
                  <AlertDialog.Cancel asChild>
                    <button className="button-secondary">Vazgeç</button>
                  </AlertDialog.Cancel>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => void remove()}
                    className="button-primary bg-destructive text-on-destructive"
                  >
                    {pending ? "Siliniyor…" : "Entry’yi sil"}
                  </button>
                </div>
              </AlertDialog.Content>
            </AlertDialog.Portal>
          </AlertDialog.Root>
        ) : null}
      </div>
      {editing ? (
        <div className="mt-4">
          <FormTextarea
            id={`edit-${entryId}`}
            label="Entry metni"
            toolbar={(api) => <EntryReferenceToolbar api={api} textareaId={`edit-${entryId}`} />}
            value={text}
            onChange={(event) => setText(event.target.value)}
            minLength={10}
            maxLength={ENTRY_BODY_MAX_LENGTH}
            disabled={pending}
          />
          <div className="mt-3 flex gap-3">
            <button
              type="button"
              className="button-primary"
              disabled={pending || text.trim().length < 10}
              onClick={() => void saveEdit()}
            >
              Kaydet
            </button>
            <button type="button" className="button-secondary" onClick={() => setEditing(false)}>
              Vazgeç
            </button>
          </div>
        </div>
      ) : null}
      {notice ? (
        <p role="status" className="mt-3 text-sm text-muted">
          {notice}
        </p>
      ) : null}
    </div>
  );
}
