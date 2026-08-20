"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useRef } from "react";

export interface TopicWindowOption {
  value: string;
  label: string;
  href: string;
  current: boolean;
}

/**
 * Zaman penceresi seçici.
 *
 * Beş kademe eskiden beş `chip`'ten oluşan ayrı bir satırdı; başlıkla ilk entry
 * arasındaki altı satırın biri buydu. Artık tek bir açılır menü, ve
 * **tetikleyicinin etiketi seçili değerin kendisi** ("son 24 saat") — böylece
 * satır kazanılırken bilginin kendisi kaybolmuyor.
 *
 * Radix `DropdownMenu` DEĞİL, düz `<details>`: pencere değiştirmek bir gezinme
 * eylemi ve JS kapalıyken de çalışmak zorunda. `<details>`/`<summary>` yerel
 * olarak odaklanılabilir, Enter/Boşluk ile açılır, içindeki öğeler düz
 * `<a href>` olarak Tab'lanır. JS varken üstüne yalnız iki davranış ekleniyor:
 * Esc ile kapanma ve dışarı tıklayınca kapanma. İkisi de yoksa menü yine
 * çalışır, sadece elle kapatılır.
 */
export function TopicWindowMenu({
  triggerLabel,
  filtered,
  options,
}: {
  triggerLabel: string;
  /** Varsayılan dışında bir pencere seçiliyse tetikleyici filtreli görünür. */
  filtered: boolean;
  options: readonly TopicWindowOption[];
}) {
  const details = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const node = details.current;
    if (!node) return;
    const close = () => {
      node.open = false;
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!node.open) return;
      if (event.target instanceof Node && node.contains(event.target)) return;
      close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !node.open) return;
      close();
      // Odak menünün içindeyse tetikleyiciye geri dönmeli; dışarıdaysa dokunma.
      if (document.activeElement instanceof HTMLElement && node.contains(document.activeElement))
        node.querySelector("summary")?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);
  return (
    <details ref={details} className="relative">
      <summary
        className={`chip cursor-pointer list-none gap-1 [&::-webkit-details-marker]:hidden ${
          filtered ? "chip-active" : "text-ink"
        }`}
      >
        <span className="sr-only">Zaman penceresi: </span>
        {triggerLabel}
        <ChevronDown aria-hidden="true" size={15} className="text-muted" />
      </summary>
      <div className="absolute right-0 top-full z-[60] mt-2 min-w-44 rounded-lg border bg-surface p-2">
        {options.map((option) => (
          <a
            key={option.value}
            href={option.href}
            aria-current={option.current ? "page" : undefined}
            className={`menu-item ${option.current ? "font-medium text-primary" : "text-ink"}`}
          >
            {option.label}
          </a>
        ))}
      </div>
    </details>
  );
}
