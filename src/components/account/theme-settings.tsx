"use client";

import { useId } from "react";
import type { ThemePreference } from "@/lib/theme/preference";
import { useThemePreference } from "@/lib/theme/use-theme-preference";

/**
 * Başlıktaki düğme yalnız açık ile koyu arasında gidip geliyor. İşletim
 * sistemine geri dönüş — yani "hiç seçim yapmamış" haline dönüş — burada.
 */
const OPTIONS: Array<{ value: ThemePreference; label: string; hint: string }> = [
  {
    value: "system",
    label: "Sistem temasını takip et",
    hint: "Cihazınız koyu moda geçtiğinde site de geçer. Varsayılan davranış budur.",
  },
  { value: "light", label: "Her zaman açık", hint: "Cihazınız koyu modda olsa bile açık kalır." },
  { value: "dark", label: "Her zaman koyu", hint: "Cihazınız açık modda olsa bile koyu kalır." },
];

export function ThemeSettings() {
  const groupId = useId();
  const { preference, resolved, ready, choose } = useThemePreference();

  return (
    <section className="surface-card p-6" aria-labelledby={`${groupId}-baslik`}>
      <h2 id={`${groupId}-baslik`} className="title-section">
        Tema
      </h2>
      <p className="mt-1 text-sm text-muted">
        Başlıktaki güneş/ay düğmesi açık ile koyu arasında geçiş yapar. Cihazınızın ayarına geri
        dönmek için buradan seçin.
      </p>

      <fieldset disabled={!ready} className="mt-4">
        <legend className="sr-only">Tema tercihi</legend>
        <div className="space-y-1">
          {OPTIONS.map((option) => {
            const inputId = `${groupId}-${option.value}`;
            return (
              <label
                key={option.value}
                htmlFor={inputId}
                className="flex min-h-11 cursor-pointer items-start gap-3 rounded px-2 py-2 hover:bg-page"
              >
                <input
                  id={inputId}
                  type="radio"
                  name={`${groupId}-tema`}
                  value={option.value}
                  checked={preference === option.value}
                  onChange={() => choose(option.value)}
                  className="mt-1 size-4 shrink-0 accent-primary"
                  aria-describedby={`${inputId}-aciklama`}
                />
                <span>
                  <span className="block font-medium text-ink">{option.label}</span>
                  <span id={`${inputId}-aciklama`} className="block text-sm text-muted">
                    {option.hint}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {/* Seçim değişince tek cümle değişir; her tuş vuruşunda değil, bu yüzden
          `polite` bölge gürültü yapmaz. Sisteme bağlıyken hangi temanın geçerli
          olduğunu da burası söyler — düğmenin ikonunu göremeyen kullanıcı için. */}
      <p role="status" className="mt-3 text-sm text-muted">
        {ready
          ? preference === "system"
            ? `Şu an sistem ayarı geçerli: ${resolved === "dark" ? "koyu" : "açık"} tema.`
            : `Şu an sizin seçiminiz geçerli: ${preference === "dark" ? "koyu" : "açık"} tema.`
          : "Tema tercihi yükleniyor…"}
      </p>
    </section>
  );
}
