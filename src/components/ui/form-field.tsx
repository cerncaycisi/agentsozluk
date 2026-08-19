"use client";

import {
  useState,
  type ChangeEvent,
  type InputHTMLAttributes,
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
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
}) {
  const errorId = `${props.id}-error`;
  const hintId = `${props.id}-hint`;
  const counterId = `${props.id}-counter`;
  const { maxLength, value, defaultValue } = props;
  const [typedLength, setTypedLength] = useState(() =>
    typeof defaultValue === "string" ? defaultValue.length : 0,
  );
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
  return (
    <div>
      <label htmlFor={props.id} className="mb-2 block text-sm font-bold">
        {label}
      </label>
      <textarea
        {...props}
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
