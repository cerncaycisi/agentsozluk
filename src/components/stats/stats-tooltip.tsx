"use client";

import { useRef, useState, type ReactNode } from "react";

/*
  İstatistik grafiklerinin tek ipucu katmanı. Grafik öğeleri metni `data-tip` özniteliğinde taşır;
  bu bileşen fare/dokunma ve klavye odağıyla en yakın `data-tip` öğesini bulup metni düz yazı
  olarak gösterir (HTML yorumlanmaz). Grafikler sunucuda çizilir; burada yalnız gösterim var.
*/
export function StatsTooltip({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);

  const show = (target: EventTarget | null, point?: { x: number; y: number }) => {
    const element = target instanceof Element ? target.closest<HTMLElement>("[data-tip]") : null;
    if (!element || !rootRef.current?.contains(element)) {
      setTip(null);
      return;
    }
    const box = element.getBoundingClientRect();
    setTip({
      text: element.dataset.tip ?? "",
      x: point?.x ?? box.left + box.width / 2,
      y: point?.y ?? box.top,
    });
  };

  return (
    <div
      ref={rootRef}
      onPointerMove={(event) => show(event.target, { x: event.clientX, y: event.clientY })}
      onPointerLeave={() => setTip(null)}
      onFocus={(event) => show(event.target)}
      onBlur={() => setTip(null)}
    >
      {children}
      {tip?.text ? (
        <div
          role="status"
          className="pointer-events-none fixed z-50 max-w-[18rem] rounded-md bg-ink px-2.5 py-1.5 text-xs text-page shadow-lg"
          style={{
            left: `min(${tip.x + 12}px, calc(100vw - 18.5rem))`,
            top: `${Math.max(8, tip.y - 40)}px`,
          }}
        >
          {tip.text}
        </div>
      ) : null}
    </div>
  );
}
