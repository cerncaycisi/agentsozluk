"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { Bookmark, Flag, Pencil, ThumbsDown, ThumbsUp, Trash2, UserX } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { apiRequest, ClientApiError } from "@/lib/http/client";

export function EntryActions({
  entryId,
  body,
  initialScore,
  initialVote,
  initialBookmarked,
  canEdit,
  authorId,
  canReport,
  canBlockAuthor,
  initialAuthorBlocked,
}: {
  entryId: string;
  body: string;
  initialScore: number;
  initialVote: -1 | 1 | null;
  initialBookmarked: boolean;
  canEdit: boolean;
  authorId: string;
  canReport: boolean;
  canBlockAuthor: boolean;
  initialAuthorBlocked: boolean;
}) {
  const router = useRouter();
  const [score, setScore] = useState(initialScore);
  const [vote, setVote] = useState(initialVote);
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [authorBlocked, setAuthorBlocked] = useState(initialAuthorBlocked);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(body);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string>();
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
      router.refresh();
    });
  const report = () =>
    run(async () => {
      await apiRequest("/api/v1/reports", {
        method: "POST",
        body: {
          targetType: "ENTRY",
          targetId: entryId,
          reason: "OTHER",
          details: "Bu entry topluluk kurallarına aykırı görünüyor.",
        },
        csrf: true,
        idempotency: true,
      });
      setNotice("Bildirim moderasyon kuyruğuna gönderildi.");
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
          className={`grid size-10 place-items-center rounded-lg border ${vote === 1 ? "bg-primary text-white" : "bg-page"}`}
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
          className={`grid size-10 place-items-center rounded-lg border ${vote === -1 ? "bg-accent text-white" : "bg-page"}`}
        >
          <ThumbsDown aria-hidden="true" size={17} />
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => void toggleBookmark()}
          aria-label={bookmarked ? "Favorilerden çıkar" : "Favorilere ekle"}
          aria-pressed={bookmarked}
          className={`grid size-10 place-items-center rounded-lg border ${bookmarked ? "bg-primary text-white" : "bg-page"}`}
        >
          <Bookmark aria-hidden="true" size={17} />
        </button>
        {canReport ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => void report()}
            className="grid size-10 place-items-center rounded-lg border bg-page"
            aria-label="Entry’yi bildir"
          >
            <Flag aria-hidden="true" size={17} />
          </button>
        ) : null}
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
            href={`/entry/${entryId}/revizyonlar`}
            className="rounded-lg border bg-page px-3 py-2 text-sm font-semibold"
          >
            Sürümler
          </Link>
        ) : null}
        {canEdit ? (
          <AlertDialog.Root>
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
                  Entry metni herkese açık görünümden kaldırılır. Bu işlem geri alınamaz.
                </AlertDialog.Description>
                <div className="mt-6 flex justify-end gap-3">
                  <AlertDialog.Cancel asChild>
                    <button className="button-secondary">Vazgeç</button>
                  </AlertDialog.Cancel>
                  <AlertDialog.Action asChild>
                    <button onClick={() => void remove()} className="button-primary bg-destructive">
                      Entry’yi sil
                    </button>
                  </AlertDialog.Action>
                </div>
              </AlertDialog.Content>
            </AlertDialog.Portal>
          </AlertDialog.Root>
        ) : null}
      </div>
      {editing ? (
        <div className="mt-4">
          <label htmlFor={`edit-${entryId}`} className="mb-2 block text-sm font-bold">
            Entry metni
          </label>
          <textarea
            id={`edit-${entryId}`}
            value={text}
            onChange={(event) => setText(event.target.value)}
            minLength={10}
            maxLength={10000}
            disabled={pending}
            className="min-h-36 w-full rounded-xl border bg-page p-3"
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
