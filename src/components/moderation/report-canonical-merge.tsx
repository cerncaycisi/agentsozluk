"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { useState } from "react";
import { apiRequest, ClientApiError } from "@/lib/http/client";
import { useAppRouter } from "@/lib/navigation/app-navigation";

/*
  Kopya başlık raporunda tek tık birleştirme (Gökhan, 12 Ekim 2026).

  Hedef başlık rapordaki önerilen başlıktan sunucuda çözülür; operatör UUID yazmaz. Birleştirme
  geri alınamadığı için gerekçesi dolu tek bir onay penceresi açılır. Onay iki kaydı sırayla
  yazar: rapor açıksa önce gammaz gerekçesi kabul edilir, sonra o karara bağlı birleştirme
  yapılır. Sunucu kuralı aynı: birleştirme yalnız kabul edilmiş karara bağlanabilir. İkinci adım
  düşerse rapor kabul edilmiş kalır ve düğme yeniden denenebilir.
*/
export function ReportCanonicalMerge({
  reportId,
  reportOpen,
  sourceTopicId,
  sourceTitle,
  canonical,
}: {
  reportId: string;
  reportOpen: boolean;
  sourceTopicId: string;
  sourceTitle: string;
  canonical: { id: string; title: string; url: string };
}) {
  const router = useAppRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(
    `Kopya başlık: "${sourceTitle}" ile "${canonical.title}" aynı kavram; tek başlıkta toplandı.`,
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  /*
    Yeniden deneme (Astra, 12 Ekim): kabul adımı geçip birleştirme düşerse ikinci denemede kabul
    tekrar gönderilmez; iki adımın idempotency anahtarı da denemeler boyunca aynı kalır.
  */
  const [resolved, setResolved] = useState(!reportOpen);
  const [keys] = useState(() => ({ resolve: crypto.randomUUID(), merge: crypto.randomUUID() }));
  const reasonTooShort = Array.from(reason.trim()).length < 10;
  const merge = async () => {
    setPending(true);
    setError(undefined);
    try {
      if (!resolved) {
        await apiRequest(`/api/v1/moderation/reports/${reportId}/resolve`, {
          method: "POST",
          body: { resolutionNote: "Kopya başlık gammazı yerinde bulundu." },
          csrf: true,
          idempotency: keys.resolve,
        });
        setResolved(true);
      }
      await apiRequest(`/api/v1/moderation/topics/${sourceTopicId}/merge`, {
        method: "POST",
        body: { reason: reason.trim(), targetTopicId: canonical.id, sourceReportId: reportId },
        csrf: true,
        idempotency: keys.merge,
      });
      setOpen(false);
      router.refresh();
    } catch (submitError) {
      setError(
        submitError instanceof ClientApiError ? submitError.message : "Birleştirme tamamlanamadı.",
      );
      router.refresh();
    } finally {
      setPending(false);
    }
  };
  return (
    <AlertDialog.Root open={open} onOpenChange={setOpen}>
      <AlertDialog.Trigger asChild>
        <button type="button" className="button-primary">
          Birleştir → {canonical.title}
        </button>
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-[80] bg-black/60" />
        <AlertDialog.Content className="fixed left-1/2 top-1/2 z-[81] w-[min(92vw,520px)] -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-surface p-6">
          <AlertDialog.Title className="title-section">
            Başlıklar birleştirilsin mi?
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-2 leading-7 text-muted">
            “{sourceTitle}” başlığının entry’leri{" "}
            <a href={canonical.url} className="underline">
              {canonical.title}
            </a>{" "}
            başlığına taşınır; eski adres yeni başlığa yönlenir. Geri alınamaz.
          </AlertDialog.Description>
          <label htmlFor={`merge-${reportId}`} className="mb-2 mt-6 block text-sm font-medium">
            Gerekçe (hazır; istersen değiştir)
          </label>
          <textarea
            id={`merge-${reportId}`}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            minLength={10}
            maxLength={1000}
            disabled={pending}
            className="min-h-20 w-full rounded border bg-page p-3"
          />
          {error ? (
            <p role="alert" className="mt-4 text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <div className="mt-6 flex justify-end gap-3">
            <AlertDialog.Cancel asChild>
              <button type="button" disabled={pending} className="button-secondary">
                Vazgeç
              </button>
            </AlertDialog.Cancel>
            <button
              type="button"
              disabled={pending || reasonTooShort}
              onClick={() => void merge()}
              className="button-primary"
            >
              {pending ? "Birleştiriliyor…" : "Birleştir"}
            </button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
