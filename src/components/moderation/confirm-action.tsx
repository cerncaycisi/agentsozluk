"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { useEffect, useState } from "react";
import { apiRequest, ClientApiError } from "@/lib/http/client";
import { agentBehaviorReasonLabels } from "@/modules/agents/domain/behavior-feedback";
import type { AgentBehaviorReasonCode } from "@/modules/moderation/validation/schemas";
import { useAppRouter } from "@/lib/navigation/app-navigation";

/*
  TEK TIK (Gökhan, 12 Ekim 2026: "bütün moderasyon işlemleri tek tıkla çözülebiliyor olmalı").

  Sunucu kuralları değişmedi: gerekçe yine en az 10 karakter, denetim kaydı yine yazılıyor.
  Değişen, gerekçeyi operatörün elle yazmak zorunda olmaması: işlemden üretilen hazır gerekçe
  gönderilir. Üç biçim var:

  - Geri alınabilir işlem: düğmeye basınca doğrudan uygulanır.
  - Agent davranış dersi isteyen işlem: düğme sebep seçeneklerini açar; sebebe basmak işlemi
    bitirir. Sebep agent'ın kalıcı dersine dönüştüğü için seçim kaldırılmadı; ders metni
    sebebin kendisidir.
  - Geri alınamaz işlem: gerekçesi önceden dolu tek bir onay penceresi açılır.
*/
export function ConfirmAction({
  endpoint,
  label,
  title,
  description,
  fieldName = "reason",
  destructive = false,
  behaviorFeedback = false,
  irreversible = false,
  defaultReason,
}: {
  endpoint: string;
  label: string;
  title: string;
  description: string;
  fieldName?: "reason" | "resolutionNote" | "rationale" | "note";
  destructive?: boolean;
  behaviorFeedback?: boolean;
  irreversible?: boolean;
  defaultReason?: string;
}) {
  const router = useAppRouter();
  const initialReason = defaultReason ?? `${title}: yönetici kararı, panelden.`;
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(initialReason);
  /*
    Aynı bileşen yenilemeden sonra ters işleme dönebilir (gizle → geri aç). Gerekçe yeni işleme
    göre yeniden üretilir; önceki işlemin gerekçesi kayda geçmez (Astra, 12 Ekim).
  */
  useEffect(() => setReason(initialReason), [initialReason]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  /*
    Karakter (kod noktası) sayılır, UTF-16 birimi değil: iletişim kapatma notu
    sunucuda böyle sayılıyor ve "👍"×5 burada 10 görünüp sunucuda 5 sayılınca
    düğme açılıyor, gönderim ise genel bir hatayla düşüyordu (Sol, 22 Eylül).
    Bu sayım hiçbir uçtan gevşek değildir.
  */
  const reasonTooShort = Array.from(reason.trim()).length < 10;
  const send = async (behavior?: AgentBehaviorReasonCode) => {
    setPending(true);
    setError(undefined);
    try {
      await apiRequest(endpoint, {
        method: "POST",
        body: {
          [fieldName]: reason.trim(),
          ...(behavior
            ? { behaviorReasonCode: behavior, editorNote: agentBehaviorReasonLabels[behavior] }
            : {}),
        },
        csrf: true,
        idempotency: true,
      });
      setOpen(false);
      setReason(initialReason);
      router.refresh();
    } catch (submitError) {
      setError(
        submitError instanceof ClientApiError ? submitError.message : "İşlem tamamlanamadı.",
      );
    } finally {
      setPending(false);
    }
  };
  const buttonClass = destructive
    ? "inline-flex min-h-10 items-center rounded-lg border border-destructive px-3 py-2 text-sm font-medium text-destructive"
    : "button-secondary";

  if (!irreversible && !behaviorFeedback)
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => void send()}
          title={description}
          className={buttonClass}
        >
          {pending ? "İşleniyor…" : label}
        </button>
        {error ? (
          <span role="alert" className="text-sm text-destructive">
            {error}
          </span>
        ) : null}
      </span>
    );

  return (
    <AlertDialog.Root open={open} onOpenChange={setOpen}>
      <AlertDialog.Trigger asChild>
        <button type="button" className={buttonClass}>
          {label}
        </button>
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-[80] bg-black/60" />
        <AlertDialog.Content className="fixed left-1/2 top-1/2 z-[81] w-[min(92vw,520px)] -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-surface p-6">
          <AlertDialog.Title className="title-section">{title}</AlertDialog.Title>
          <AlertDialog.Description className="mt-2 leading-7 text-muted">
            {behaviorFeedback ? `${description} Sebebe basmak işlemi uygular.` : description}
          </AlertDialog.Description>
          {behaviorFeedback ? (
            <div className="mt-6 grid gap-2" role="group" aria-label="Sebep">
              {(
                Object.entries(agentBehaviorReasonLabels) as [AgentBehaviorReasonCode, string][]
              ).map(([code, text]) => (
                <button
                  key={code}
                  type="button"
                  disabled={pending}
                  onClick={() => void send(code)}
                  className="button-secondary justify-start text-left"
                >
                  {text}
                </button>
              ))}
            </div>
          ) : (
            <div className="mt-6">
              <label htmlFor={`moderation-${endpoint}`} className="mb-2 block text-sm font-medium">
                Gerekçe (hazır; istersen değiştir)
              </label>
              <textarea
                id={`moderation-${endpoint}`}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                minLength={10}
                maxLength={1000}
                required
                disabled={pending}
                aria-describedby={error ? `error-${endpoint}` : undefined}
                className="min-h-20 w-full rounded border bg-page p-3"
              />
            </div>
          )}
          {error ? (
            <p id={`error-${endpoint}`} role="alert" className="mt-4 text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <div className="mt-6 flex justify-end gap-3">
            <AlertDialog.Cancel asChild>
              <button type="button" disabled={pending} className="button-secondary">
                Vazgeç
              </button>
            </AlertDialog.Cancel>
            {behaviorFeedback ? null : (
              <button
                type="button"
                disabled={pending || reasonTooShort}
                onClick={() => void send()}
                className={
                  destructive
                    ? "button-primary bg-destructive text-on-destructive"
                    : "button-primary"
                }
              >
                {pending ? "İşleniyor…" : "Onayla"}
              </button>
            )}
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
