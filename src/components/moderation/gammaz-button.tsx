"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { Flag } from "lucide-react";
import { useId, useState } from "react";
import { apiRequest, ClientApiError } from "@/lib/http/client";
import {
  LEGAL_RISK_CATEGORIES,
  LEGAL_RISK_LABELS,
  gammazReasonLabel,
  reasonsForTarget,
  type GammazReason,
  type LegalRiskCategory,
} from "@/modules/moderation/domain/gammaz";

type TargetType = "ENTRY" | "TOPIC";

export function GammazButton({
  targetType,
  targetId,
  compact = false,
  open: controlledOpen,
  onOpenChange,
}: {
  targetType: TargetType;
  targetId: string;
  compact?: boolean;
  /**
   * Dışarıdan kontrol kipi. Verildiğinde bileşen kendi tetikleyici düğmesini
   * RENDER ETMEZ — kipi açan bir menü öğesi ya da başka bir denetim vardır
   * (entry aksiyon şeridindeki ⋮ menüsü böyle kullanıyor). Verilmediğinde
   * bileşen eskisi gibi kendi düğmesiyle çalışır.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const id = useId();
  const reasons = reasonsForTarget(targetType);
  const initialReason = reasons[0]!;
  const controlled = controlledOpen !== undefined;
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = (next: boolean) => {
    setUncontrolledOpen(next);
    onOpenChange?.(next);
  };
  const [reason, setReason] = useState<GammazReason>(initialReason);
  const [details, setDetails] = useState("");
  const [entryPublicId, setEntryPublicId] = useState("");
  const [legalRiskCategory, setLegalRiskCategory] = useState<LegalRiskCategory>("PERSONAL_RIGHTS");
  const [suggestedTitle, setSuggestedTitle] = useState("");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string>();

  const reset = () => {
    setReason(initialReason);
    setDetails("");
    setEntryPublicId("");
    setLegalRiskCategory("PERSONAL_RIGHTS");
    setSuggestedTitle("");
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    setNotice(undefined);
    const parsedEntryPublicId = Number(entryPublicId);
    const evidence =
      reason === "GAMMAZ_8_DUPLICATE_ENTRY"
        ? { duplicateEntryPublicId: parsedEntryPublicId }
        : reason === "GAMMAZ_3_MISSING_CONTINUATION_CONTEXT" ||
            reason === "GAMMAZ_9_DELETED_BKZ_TARGET"
          ? { referenceEntryPublicId: parsedEntryPublicId }
          : reason === "GAMMAZ_7_LEGAL_OR_COMMERCIAL_RISK"
            ? { legalRiskCategory }
            : reason === "TOPIC_CANONICALIZATION_REQUEST"
              ? { suggestedTitle: suggestedTitle.trim() }
              : {};
    try {
      await apiRequest("/api/v1/reports", {
        method: "POST",
        body: { targetType, targetId, reason, details, evidence },
        csrf: true,
        idempotency: true,
      });
      setOpen(false);
      reset();
      setNotice("Gammaz moderasyon kuyruğuna gönderildi.");
    } catch (error) {
      setNotice(error instanceof ClientApiError ? error.message : "Gammaz gönderilemedi.");
    } finally {
      setPending(false);
    }
  };

  const needsEntryPublicId =
    reason === "GAMMAZ_8_DUPLICATE_ENTRY" ||
    reason === "GAMMAZ_3_MISSING_CONTINUATION_CONTEXT" ||
    reason === "GAMMAZ_9_DELETED_BKZ_TARGET";
  const evidenceValid =
    (!needsEntryPublicId ||
      (Number.isInteger(Number(entryPublicId)) && Number(entryPublicId) > 0)) &&
    (reason !== "TOPIC_CANONICALIZATION_REQUEST" || suggestedTitle.trim().length >= 2);

  const dialog = (
    <>
      <AlertDialog.Root open={open} onOpenChange={setOpen}>
        {controlled ? null : (
          <AlertDialog.Trigger asChild>
            <button
              type="button"
              className={
                compact ? "icon-button bg-page" : "button-secondary inline-flex items-center gap-2"
              }
              aria-label={compact ? "Entry’yi gammazla" : undefined}
            >
              <Flag aria-hidden="true" size={17} />
              {compact ? null : "Gammazla"}
            </button>
          </AlertDialog.Trigger>
        )}
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-[80] bg-black/60" />
          <AlertDialog.Content className="fixed left-1/2 top-1/2 z-[81] max-h-[90vh] w-[min(94vw,620px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border bg-surface p-6">
            <AlertDialog.Title className="title-section">
              {targetType === "ENTRY" ? "Entry’yi gammazla" : "Başlık işlemi iste"}
            </AlertDialog.Title>
            <AlertDialog.Description className="mt-2 leading-7 text-muted">
              Yalnız doğru anayasal gerekçeyi seçin. Gammaz, “beğenmedim” düğmesi değildir.
            </AlertDialog.Description>
            <form onSubmit={submit} className="mt-6 space-y-4">
              <div>
                <label htmlFor={`${id}-reason`} className="mb-2 block text-sm font-medium">
                  Gerekçe
                </label>
                <select
                  id={`${id}-reason`}
                  value={reason}
                  onChange={(event) => setReason(event.target.value as GammazReason)}
                  disabled={pending}
                  className="min-h-11 w-full rounded border bg-page px-3"
                >
                  {reasons.map((value) => (
                    <option key={value} value={value}>
                      {gammazReasonLabel(value)}
                    </option>
                  ))}
                </select>
              </div>
              {needsEntryPublicId ? (
                <div>
                  <label htmlFor={`${id}-entry`} className="mb-2 block text-sm font-medium">
                    {reason === "GAMMAZ_8_DUPLICATE_ENTRY"
                      ? "Önceki entry numarası"
                      : "Silinmiş dayanak entry numarası"}
                  </label>
                  <input
                    id={`${id}-entry`}
                    type="number"
                    min={1}
                    step={1}
                    value={entryPublicId}
                    onChange={(event) => setEntryPublicId(event.target.value)}
                    required
                    disabled={pending}
                    className="min-h-11 w-full rounded border bg-page px-3"
                    placeholder="Örn. 519"
                  />
                </div>
              ) : null}
              {reason === "GAMMAZ_7_LEGAL_OR_COMMERCIAL_RISK" ? (
                <div>
                  <label htmlFor={`${id}-risk`} className="mb-2 block text-sm font-medium">
                    Risk hattı
                  </label>
                  <select
                    id={`${id}-risk`}
                    value={legalRiskCategory}
                    onChange={(event) =>
                      setLegalRiskCategory(event.target.value as LegalRiskCategory)
                    }
                    disabled={pending}
                    className="min-h-11 w-full rounded border bg-page px-3"
                  >
                    {LEGAL_RISK_CATEGORIES.map((value) => (
                      <option key={value} value={value}>
                        {LEGAL_RISK_LABELS[value]}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              {reason === "TOPIC_CANONICALIZATION_REQUEST" ? (
                <div>
                  <label htmlFor={`${id}-title`} className="mb-2 block text-sm font-medium">
                    Önerilen kanonik başlık
                  </label>
                  <input
                    id={`${id}-title`}
                    value={suggestedTitle}
                    onChange={(event) => setSuggestedTitle(event.target.value)}
                    minLength={2}
                    maxLength={120}
                    required
                    disabled={pending}
                    className="min-h-11 w-full rounded border bg-page px-3"
                  />
                </div>
              ) : null}
              <div>
                <label htmlFor={`${id}-details`} className="mb-2 block text-sm font-medium">
                  Somut açıklama
                </label>
                <textarea
                  id={`${id}-details`}
                  value={details}
                  onChange={(event) => setDetails(event.target.value)}
                  minLength={10}
                  maxLength={1000}
                  required
                  disabled={pending}
                  className="min-h-32 w-full rounded border bg-page p-3"
                  placeholder="Gerekçenin bu entry veya başlıkta nasıl oluştuğunu açıklayın."
                />
              </div>
              {notice ? (
                <p role="alert" className="text-sm text-destructive">
                  {notice}
                </p>
              ) : null}
              <div className="flex justify-end gap-3">
                <AlertDialog.Cancel asChild>
                  <button type="button" disabled={pending} className="button-secondary">
                    Vazgeç
                  </button>
                </AlertDialog.Cancel>
                <button
                  type="submit"
                  disabled={pending || details.trim().length < 10 || !evidenceValid}
                  className="button-primary"
                >
                  {pending ? "Gönderiliyor…" : "Gammazı gönder"}
                </button>
              </div>
            </form>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
      {!open && notice ? (
        <p role="status" className="mt-2 text-sm text-muted">
          {notice}
        </p>
      ) : null}
    </>
  );
  // Kontrollü kipte sarmalayıcı yok: kip kapalı ve bildirim yokken bileşen hiç
  // DOM üretmemeli ki çağıran esnek düzenlerde boş kutu taşımasın.
  return controlled ? dialog : <div>{dialog}</div>;
}
