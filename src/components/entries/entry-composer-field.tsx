"use client";

import type { ComponentProps } from "react";
import { EntryBody } from "@/components/entries/entry-body";
import { FormTextarea } from "@/components/ui/form-field";
import { EntryReferenceToolbar } from "@/components/constitution/writing-guidance";

/**
 * Entry gövdesi yazılan **her** yüzeyin ortak yazma katmanı: bkz şeridi,
 * Yaz/Önizle sekmeleri, karakter sayacı ve önizleme notu. İki çağıran var —
 * başlık içindeki `CreateEntryForm` ve `/baslik/ac`'daki başlık formunun
 * “İlk entry” alanı — ve ikisi de aynı sözdizimini aynı sunucu şemasına
 * gönderiyor, bu yüzden yazma yardımı da aynı olmak zorunda.
 *
 * Sınır bilinçli: burada **yalnız yazma yüzeyi** var. Gönderim, doğrulama
 * kuralları, taslak saklama ve yönlendirme her formun kendi işi — ikisi
 * birbirinden gerçekten farklı (biri başlık+entry oluşturur, diğeri mevcut
 * başlığa entry ekler), ortak bir kaba sıkıştırılmaları yanlış olurdu.
 */

/**
 * Sunucudaki `entryBodySchema` (`src/modules/entries/validation/schemas.ts`)
 * gövdeyi 10.000 karakterle sınırlar. İstemci yalnız o sınıra hizalanır;
 * değer değişirse `tests/unit/entries/composer-character-counter.test.tsx`
 * bu kopyayı yakalar.
 */
export const ENTRY_BODY_MAX_LENGTH = 10_000;

/**
 * Önizleme `EntryBody`'yi `references` **vermeden** çağırır: istemcide referans
 * indeksi yok. `tokenizeEntryBody` bu durumda yalnız gizli bkz'i (`[[…]]`)
 * bağlantıya çevirir — hedefi bilinmediği için başlık aramasına — geri kalan üç
 * sözdizimini düz metin bırakır. Yani önizleme yayımlanan hâle göre *eksik*
 * bağlantı gösterir, fazla değil. Aşağıdaki not tam olarak bunu söylüyor ve
 * `EntryWritingGuidance`'taki cümleyle aynı sözcükleri kullanıyor.
 */
const PREVIEW_REFERENCE_NOTE =
  "Önizleme hedefleri denetlemez: gizli bkz burada her zaman başlık aramasına gider, " +
  "görünür bkz, entry ve yazar referansları ise düz metin kalır. Yayımlandığında " +
  "mevcut ve görünür hedefler bağlantıya dönüşür.";

function ComposerPreview({ body }: { body: string }) {
  return (
    <div>
      {body.trim() ? (
        <EntryBody body={body} />
      ) : (
        <p className="text-sm text-muted">Önizlenecek bir şey yok.</p>
      )}
      <p className="mt-3 border-t field-border pt-3 text-xs text-muted">{PREVIEW_REFERENCE_NOTE}</p>
    </div>
  );
}

/**
 * `id` ve `value` zorunlu: `id` olmadan araç çubuğu `aria-controls` ile
 * textarea'ya bağlanamaz, `value` olmadan da sayaç ve önizleme yazılan metni
 * göremez. `maxLength`, `toolbar` ve `preview` dışarıdan verilemez — bu üçü
 * bileşenin var olma sebebi.
 */
type EntryComposerFieldProps = Omit<
  ComponentProps<typeof FormTextarea>,
  "id" | "value" | "maxLength" | "toolbar" | "preview"
> & {
  id: string;
  value: string;
};

export function EntryComposerField({ id, value, ...props }: EntryComposerFieldProps) {
  return (
    <FormTextarea
      {...props}
      id={id}
      value={value}
      maxLength={ENTRY_BODY_MAX_LENGTH}
      toolbar={(api) => <EntryReferenceToolbar api={api} textareaId={id} />}
      preview={<ComposerPreview body={value} />}
    />
  );
}
