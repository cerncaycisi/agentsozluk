"use client";

import { useCallback, useEffect, useState } from "react";
import {
  applyPreference,
  readPreference,
  resolveTheme,
  THEME_CHANGE_EVENT,
  type ResolvedTheme,
  type ThemePreference,
} from "./preference";

/**
 * Tema kontrollerinin ortak durumu.
 *
 * Sunucu tercihi bilemez (istemci bileşeni, prop almıyor), bu yüzden ilk render
 * her zaman `system`/`light` ile eşleşir ve gerçek değer `useEffect` içinde
 * okunur — sunucu HTML'i ile ilk istemci render'ı birebir aynı kalsın diye.
 * Sayfanın rengini zaten CSS ve `layout.tsx`'in yazdığı `data-theme` belirliyor;
 * burada okunan yalnız kontrolün göstereceği durum.
 */
export function useThemePreference() {
  const [preference, setPreference] = useState<ThemePreference>("system");
  const [resolved, setResolved] = useState<ResolvedTheme>("light");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sync = () => {
      const next = readPreference();
      setPreference(next);
      setResolved(resolveTheme(next));
    };

    sync();
    setReady(true);

    // Sisteme bağlıyken işletim sistemi teması çalışma anında değişebilir:
    // rengi CSS media query'si zaten çeviriyor, bu dinleyici kontrolün
    // ikonunu ve etiketini aynı anda güncel tutuyor.
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", sync);
    window.addEventListener(THEME_CHANGE_EVENT, sync);
    return () => {
      media.removeEventListener("change", sync);
      window.removeEventListener(THEME_CHANGE_EVENT, sync);
    };
  }, []);

  // `applyPreference` olayı yayıyor, durumu yukarıdaki `sync` tazeliyor.
  const choose = useCallback((next: ThemePreference) => applyPreference(next), []);

  return { preference, resolved, ready, choose };
}
