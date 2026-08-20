"use client";

import { Moon, Sun } from "lucide-react";
import { useThemePreference } from "@/lib/theme/use-theme-preference";

/**
 * Başlıktaki tema düğmesi: iki durum, güneş ve ay. Üçüncü bir "sistem" ikonu
 * yok — kullanıcı düğmeye hiç dokunmadıysa site zaten işletim sistemini takip
 * ediyor, sisteme geri dönüş ise ayarlar sayfasındaki seçenekte.
 *
 * İkon mevcut durumu gösterir (koyu tema → ay), sonraki eylemi değil; sitenin
 * geri kalanındaki durum ikonlarıyla aynı okuma.
 *
 * Kutulu varyant (`.icon-button-boxed`): burası kabuk, içerik satırı değil —
 * düğme çerçeveli arama alanı ve dolu CTA ile aynı hizada duruyor, çerçevesiz
 * kalırsa o satırda tıklanır görünmüyor. Entry aksiyonlarında tersi geçerli.
 *
 * Erişilebilirlik: `aria-pressed` + sabit ad. WAI-ARIA APG'nin geçiş düğmesi
 * kalıbı bu — durumu adın içine gömüp her tıklamada adı değiştirmek yerine
 * durumu `aria-pressed` taşır, ekran okuyucu da basma durumundaki değişimi
 * kendiliğinden duyurur. Bu yüzden ayrı bir `aria-live` bölgesine gerek yok;
 * olsaydı aynı bilgi iki kez duyurulurdu.
 */
export function ThemeToggle() {
  const { resolved, ready, choose } = useThemePreference();
  const isDark = resolved === "dark";

  return (
    <button
      type="button"
      disabled={!ready}
      onClick={() => choose(isDark ? "light" : "dark")}
      aria-pressed={isDark}
      aria-label="Koyu tema"
      className="icon-button icon-button-boxed size-11 bg-page text-ink"
    >
      {isDark ? <Moon aria-hidden="true" size={18} /> : <Sun aria-hidden="true" size={18} />}
    </button>
  );
}
