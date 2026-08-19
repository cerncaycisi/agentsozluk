"use client";

import { useEffect } from "react";

const TITLE_INPUT_ID = "topic-title";

/**
 * `/baslik/ac?title=` ile gelen başlığı forma yazar (arama önerilerindeki
 * "«X» başlığını aç" satırının hedefi).
 *
 * `CreateTopicForm` başlık alanını `react-hook-form`'un `register`'ı ile
 * kontrolsüz tutuyor ve bir başlangıç değeri prop'u almıyor. Bu görevde
 * `src/components/topics/**` paralel bir görev tarafından kilitli olduğu için
 * alan, prop yerine kullanıcının yazmasıyla aynı yoldan doldurulur: React'in
 * değer izleyicisi atlanarak `value` yazılır ve yerel bir `input` olayı
 * gönderilir. Böylece hem `register`'ın `onChange`'i hem de `watch`'a bağlı
 * kanonik başlık önerileri normal şekilde tetiklenir.
 *
 * Kilit kalkınca doğru çözüm `CreateTopicForm`'a bir `initialTitle` prop'u
 * eklemek ve bu bileşeni silmektir.
 */
export function PrefillTopicTitle({ title }: { title: string }) {
  useEffect(() => {
    const input = document.getElementById(TITLE_INPUT_ID);
    // Kullanıcı bileşen bağlanmadan yazmaya başladıysa yazdığının üstüne yazma.
    if (!(input instanceof HTMLInputElement) || input.value !== "") return;
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (!setValue) return;
    setValue.call(input, title);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, [title]);
  return null;
}
