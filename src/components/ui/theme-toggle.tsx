"use client";

import { MonitorSmartphone, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

type ThemePreference = "system" | "light" | "dark";

const THEME_STORAGE_KEY = "ajan_theme";
const THEME_COOKIE_MAX_AGE = 31_536_000;

const NEXT_PREFERENCE: Record<ThemePreference, ThemePreference> = {
  system: "light",
  light: "dark",
  dark: "system",
};

const PREFERENCE_NAME: Record<ThemePreference, string> = {
  system: "sistem",
  light: "açık",
  dark: "koyu",
};

// İkon mevcut durumu gösterir; etiket hem mevcut durumu hem sonraki eylemi söyler ki
// ekran okuyucu kullanıcısı da gören kullanıcının ikondan aldığı bilgiye erişsin.
function preferenceLabel(preference: ThemePreference): string {
  const next = NEXT_PREFERENCE[preference];
  return `Tema: ${PREFERENCE_NAME[preference]}. ${PREFERENCE_NAME[next]} temaya geçmek için etkinleştirin.`;
}

function isThemePreference(value: string | null | undefined): value is "light" | "dark" {
  return value === "light" || value === "dark";
}

function currentPreference(): ThemePreference {
  const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (isThemePreference(saved)) return saved;
  // Sunucu cookie'den `data-theme` yazdıysa localStorage boş olsa da onu esas al.
  const rendered = document.documentElement.dataset.theme;
  if (isThemePreference(rendered)) return rendered;
  return "system";
}

function applyPreference(preference: ThemePreference) {
  if (preference === "system") {
    document.documentElement.removeAttribute("data-theme");
    window.localStorage.removeItem(THEME_STORAGE_KEY);
    document.cookie = `${THEME_STORAGE_KEY}=; Path=/; Max-Age=0; SameSite=Lax`;
    return;
  }

  document.documentElement.dataset.theme = preference;
  window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  document.cookie = `${THEME_STORAGE_KEY}=${preference}; Path=/; Max-Age=${THEME_COOKIE_MAX_AGE}; SameSite=Lax`;
}

export function ThemeToggle() {
  const [preference, setPreference] = useState<ThemePreference>("system");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setPreference(currentPreference());
    setReady(true);
  }, []);

  const cyclePreference = () => {
    const next = NEXT_PREFERENCE[preference];
    applyPreference(next);
    setPreference(next);
  };

  return (
    <button
      type="button"
      disabled={!ready}
      onClick={cyclePreference}
      className="grid size-11 shrink-0 place-items-center rounded-xl border bg-page text-ink transition hover:border-primary hover:text-primary"
      aria-label={preferenceLabel(preference)}
    >
      {preference === "system" ? (
        <MonitorSmartphone aria-hidden="true" size={18} />
      ) : preference === "dark" ? (
        <Moon aria-hidden="true" size={18} />
      ) : (
        <Sun aria-hidden="true" size={18} />
      )}
    </button>
  );
}
