"use client";

import {
  useRef,
  useState,
  type ChangeEvent,
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
  type TextareaHTMLAttributes,
} from "react";

const characterFormatter = new Intl.NumberFormat("tr-TR");

/**
 * Sayaç, sınırın son %10'una girildiğinde uyarı durumuna geçer.
 * Ekran okuyucu duyurusu da yalnız bu eşik geçildiğinde (ve sınıra ulaşıldığında)
 * değişir; aradaki her tuş vuruşunda metin sabit kaldığı için `aria-live`
 * bölgesi yeniden duyurmaz.
 */
const COUNTER_WARNING_RATIO = 0.1;

/**
 * `FormTextarea`'nın `toolbar` render prop'una verdiği düzenleme yüzeyi.
 * Araç çubuğu textarea'nın DOM düğümünü hiç görmez; yalnız bu API'yi çağırır.
 */
export interface TextareaToolbarApi {
  /**
   * Seçili metni `before`/`after` ile sarar. Seçim yoksa `before + after`
   * şablonunu imleç konumuna ekleyip imleci ikisinin arasına koyar.
   * Her iki durumda da odak textarea'ya döner.
   */
  wrapSelection: (before: string, after: string) => void;
}

export function FormField({
  label,
  error,
  hint,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
}) {
  const errorId = `${props.id}-error`;
  const hintId = `${props.id}-hint`;
  return (
    <div>
      <label htmlFor={props.id} className="mb-2 block text-sm font-bold">
        {label}
      </label>
      <input
        {...props}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        className="min-h-11 w-full rounded-xl border field-border bg-page px-3.5 text-ink placeholder:text-muted disabled:cursor-not-allowed disabled:opacity-60"
      />
      {error ? (
        <p id={errorId} className="mt-1.5 text-sm text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="mt-1.5 text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function FormTextarea({
  label,
  error,
  hint,
  onChange,
  toolbar,
  ref: forwardedRef,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
  toolbar?: ((api: TextareaToolbarApi) => ReactNode) | undefined;
  ref?: Ref<HTMLTextAreaElement> | undefined;
}) {
  const errorId = `${props.id}-error`;
  const hintId = `${props.id}-hint`;
  const counterId = `${props.id}-counter`;
  const { maxLength, value, defaultValue } = props;
  const [typedLength, setTypedLength] = useState(() =>
    typeof defaultValue === "string" ? defaultValue.length : 0,
  );
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  // Kontrollü kullanımda uzunluk doğrudan `value`'dan gelir; kontrolsüz
  // kullanımda son `change` olayından hatırlanır.
  const length = typeof value === "string" ? value.length : typedLength;
  const showCounter = typeof maxLength === "number" && maxLength > 0;
  const nearLimit =
    showCounter && length >= maxLength - Math.floor(maxLength * COUNTER_WARNING_RATIO);
  const atLimit = showCounter && length >= maxLength;
  const liveMessage = atLimit
    ? `${characterFormatter.format(maxLength)} karakterlik sınıra ulaştınız.`
    : nearLimit
      ? `Karakter sınırının son yüzde onundasınız. Sınır ${characterFormatter.format(maxLength)} karakter.`
      : "";
  const describedBy = [
    error ? errorId : hint ? hintId : undefined,
    showCounter ? counterId : undefined,
  ]
    .filter(Boolean)
    .join(" ");
  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setTypedLength(event.target.value.length);
    onChange?.(event);
  };
  // `register()` kendi `ref`'ini prop olarak geçirir (React 19'da `ref` sıradan
  // bir prop). Araç çubuğunun düğüme erişebilmesi için iki ref'i birleştiriyoruz.
  const attachTextarea = (node: HTMLTextAreaElement | null) => {
    textareaRef.current = node;
    if (typeof forwardedRef === "function") forwardedRef(node);
    else if (forwardedRef) forwardedRef.current = node;
  };
  const wrapSelection = (before: string, after: string) => {
    const node = textareaRef.current;
    if (!node || node.disabled || node.readOnly) return;
    const start = node.selectionStart ?? node.value.length;
    const end = node.selectionEnd ?? start;
    // `setRangeText` `maxLength`'i dinlemez; sınırı burada elle koruyoruz.
    if (
      typeof maxLength === "number" &&
      node.value.length + before.length + after.length > maxLength
    )
      return;
    const selected = node.value.slice(start, end);
    const caret = start + before.length;
    node.focus();
    node.setRangeText(`${before}${selected}${after}`, start, end, "end");
    node.setSelectionRange(caret, caret + selected.length);
    // `setRangeText` DOM değerini doğrudan yazar; React'in değer izleyicisi
    // bayatladığı için `input` olayını elle tetiklemek `onChange`'i (dolayısıyla
    // react-hook-form'un kaydını ve kontrollü `value`'yu) uyandırır. Bu satır
    // olmadan buton yalnız DOM'u değiştirir, form değeri eski metinde kalır.
    node.dispatchEvent(new Event("input", { bubbles: true }));
  };
  return (
    <div>
      <label htmlFor={props.id} className="mb-2 block text-sm font-bold">
        {label}
      </label>
      {toolbar ? toolbar({ wrapSelection }) : null}
      <textarea
        {...props}
        ref={attachTextarea}
        onChange={handleChange}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy || undefined}
        className="min-h-32 w-full resize-y rounded-xl border field-border bg-page px-3.5 py-3 text-ink placeholder:text-muted disabled:cursor-not-allowed disabled:opacity-60"
      />
      {error ? (
        <p id={errorId} className="mt-1.5 text-sm text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="mt-1.5 text-sm text-muted">
          {hint}
        </p>
      ) : null}
      {showCounter ? (
        <>
          <p
            id={counterId}
            className={`mt-1.5 text-right text-xs ${nearLimit ? "text-destructive" : "text-muted"}`}
          >
            {characterFormatter.format(length)} / {characterFormatter.format(maxLength)}
          </p>
          <span aria-live="polite" className="sr-only">
            {liveMessage}
          </span>
        </>
      ) : null}
    </div>
  );
}
