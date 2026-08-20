"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import {
  EntryComposerField,
  ENTRY_BODY_MAX_LENGTH,
} from "@/components/entries/entry-composer-field";
import { apiRequest, ClientApiError } from "@/lib/http/client";
import { EntryWritingGuidance } from "@/components/constitution/writing-guidance";

/**
 * Taslak anahtarı başlık başına ayrılır: kullanıcı iki sekmede iki başlığa
 * paralel yazabilsin diye. Önek `ajan_` — `ajan_theme` ile aynı ad alanı.
 */
const DRAFT_KEY_PREFIX = "ajan_draft:";

/** Her tuş vuruşunda değil, yazma durduktan bu kadar sonra kaydedilir. */
const DRAFT_SAVE_DEBOUNCE_MS = 500;

/**
 * Bundan eski taslak yüklenmez ve anahtarı silinir — yoksa terk edilmiş
 * başlıkların taslakları `localStorage`'da birikir.
 */
const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

interface StoredDraft {
  body: string;
  savedAt: number;
}

/**
 * Taslak saklama bir kolaylık, kritik yol değil: özel modda `localStorage`
 * erişimi *okumada bile* fırlatabilir, kota dolduğunda `setItem` fırlatır.
 * Üç yardımcı da sessizce düşer; form her hâlükârda çalışmaya devam eder.
 */
function clearDraft(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Depolama yoksa silinecek bir şey de yok.
  }
}

function readDraft(key: string): string | null {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(key);
  } catch {
    return null;
  }
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Elle kurcalanmış ya da eski biçimli kayıt: at, bir daha uğraşma.
    clearDraft(key);
    return null;
  }
  const draft = parsed as Partial<StoredDraft> | null;
  if (!draft || typeof draft.body !== "string" || typeof draft.savedAt !== "number") {
    clearDraft(key);
    return null;
  }
  if (!draft.body.trim()) {
    clearDraft(key);
    return null;
  }
  // İleri tarihli `savedAt` (saat kayması) bayat sayılmaz: fark negatif kalır.
  if (Date.now() - draft.savedAt > DRAFT_MAX_AGE_MS) {
    clearDraft(key);
    return null;
  }
  return draft.body;
}

function writeDraft(key: string, body: string): void {
  const draft: StoredDraft = { body, savedAt: Date.now() };
  try {
    window.localStorage.setItem(key, JSON.stringify(draft));
  } catch {
    // Kota dolu ya da depolama kapalı: taslak yok, form yine çalışıyor.
  }
}

export function CreateEntryForm({ topicId }: { topicId: string }) {
  const router = useRouter();
  const [notice, setNotice] = useState<string>();
  const {
    register,
    reset,
    watch,
    setValue,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<{ body: string }>();
  const body = watch("body") ?? "";
  const draftKey = `${DRAFT_KEY_PREFIX}${topicId}`;
  // İlk render'da `false`; `localStorage` yalnız aşağıdaki efektte okunuyor, bu
  // yüzden sunucu ve istemci ilk çıktıda birebir aynı — hidrasyon uyuşmazlığı
  // olmuyor. (`site-shell.tsx`'teki `hydrated` bayrağının aynı deseni.)
  const [draftRestored, setDraftRestored] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);
  // Depolamadaki metnin kopyası: aynı gövdeyi ikinci kez yazmayalım. Taslağı
  // geri yükledikten sonra gereksiz bir `setItem` atmamızı da bu engelliyor —
  // yoksa sayfa her açıldığında `savedAt` tazelenir ve taslak hiç bayatlamazdı.
  const persistedBody = useRef("");

  useEffect(() => {
    const stored = readDraft(draftKey);
    persistedBody.current = stored ?? "";
    if (stored) {
      setValue("body", stored);
      setDraftRestored(true);
    }
    setDraftLoaded(true);
  }, [draftKey, setValue]);

  useEffect(() => {
    // Yükleme bitmeden kaydetmeyelim: ilk render'ın boş gövdesi depodaki
    // taslağın üstüne yazardı.
    if (!draftLoaded) return;
    if (body === persistedBody.current) return;
    const timer = setTimeout(() => {
      persistedBody.current = body;
      if (body.trim()) {
        writeDraft(draftKey, body);
      } else {
        clearDraft(draftKey);
        setDraftRestored(false);
      }
    }, DRAFT_SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [body, draftKey, draftLoaded]);

  const forgetDraft = () => {
    clearDraft(draftKey);
    persistedBody.current = "";
    setDraftRestored(false);
  };

  const discardDraft = () => {
    forgetDraft();
    setValue("body", "");
  };

  const submit = async (input: { body: string }) => {
    setNotice(undefined);
    try {
      await apiRequest(`/api/v1/topics/${topicId}/entries`, {
        method: "POST",
        body: input,
        csrf: true,
        idempotency: true,
      });
      reset();
      forgetDraft();
      setNotice("Entry eklendi.");
      router.refresh();
    } catch (error) {
      setNotice(error instanceof ClientApiError ? error.message : "Entry eklenemedi.");
    }
  };
  const bodyFieldId = `entry-body-${topicId}`;
  return (
    // Kap dili: `surface-card` DEĞİL. Composer, üstündeki entry listesinin son
    // satırı — o liste ritmini `EntryPreview`'un `border-t`'siyle kuruyor
    // (bkz. `baslik/[topic]/page.tsx`: “Ritmi boşluk değil ayraç kuruyor”).
    // Kenarlıklı kart aynı sütunda ikinci bir kap dili açıyordu. Kartın gittiği
    // yerde okunabilirlik kaybı yok: textarea ve seçili sekme `field-border`
    // (`--border-strong`) taşıyor, iki temada da zemine karşı ≥3:1.
    <form onSubmit={handleSubmit(submit)} className="mt-8 space-y-4 border-t pt-8" noValidate>
      {draftRestored ? (
        // `role="status"` bilerek yok: bu satır sayfa yüklenirken zaten görünüyor,
        // bir eyleme yanıt değil. Canlı bölge yapmak, gönderim sonucunu duyuran
        // aşağıdaki `notice` ile yarışırdı (ve e2e'de iki `status` çakışıyordu).
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
          <span>Kaydedilmemiş taslağınız geri yüklendi.</span>
          <button type="button" onClick={discardDraft} className="link-strong font-semibold">
            Taslağı sil
          </button>
        </p>
      ) : null}
      <EntryComposerField
        id={bodyFieldId}
        label="Yeni entry"
        disabled={isSubmitting}
        error={errors.body?.message}
        value={body}
        {...register("body", {
          required: "Entry metni zorunludur.",
          minLength: { value: 10, message: "En az 10 karakter girin." },
          maxLength: {
            value: ENTRY_BODY_MAX_LENGTH,
            message: "En fazla 10.000 karakter girin.",
          },
        })}
      />
      <EntryWritingGuidance />
      {notice ? (
        <p role="status" className="text-sm text-muted">
          {notice}
        </p>
      ) : null}
      <button type="submit" disabled={isSubmitting} className="button-primary">
        {isSubmitting ? "Ekleniyor…" : "Entry ekle"}
      </button>
    </form>
  );
}
