"use client";

import { useState } from "react";
import type { SiteStatsDay } from "@/modules/feeds/domain/site-stats";
import { formatStatsDay, formatStatsNumber, shortStatsDay } from "@/components/stats/format";

/*
  "Sözlük nasıl büyüdü": üstte toplam (kümülatif) entry, altta günlük entry. İki ayrı ölçü iki
  ayrı grafikte durur, tek eksen paylaşmaz. Çizim yüzde koordinatlarla yapılır: SVG yalnız çizgi
  ve alanı taşır (`preserveAspectRatio="none"`, kalınlık ölçeklenmez), yazılar HTML'dir; böylece
  telefonda da yazı küçülmez. Yayında entry'si olmayan gün sıfır değil, gri boşluktur.
*/

type Range = "30" | "all";

const CHART_HEIGHT = 160;

function niceStep(span: number): number {
  const raw = span / 4;
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(raw, 1)));
  const normalized = raw / magnitude;
  return (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;
}

export function GrowthPanel({ days, windowDays }: { days: SiteStatsDay[]; windowDays: number }) {
  const [range, setRange] = useState<Range>("30");
  const cumulative = new Map<string, number>();
  let running = 0;
  for (const day of days) {
    running += day.entries ?? 0;
    cumulative.set(day.date, running);
  }
  const rows = range === "30" ? days.slice(-windowDays) : days;
  const values = rows.map((day) => cumulative.get(day.date) ?? 0);
  const first = values[0] ?? 0;
  const last = values.at(-1) ?? 0;
  const step = niceStep(range === "30" ? Math.max(1, last - first) : Math.max(1, last));
  const low = range === "30" ? Math.floor(first / step) * step : 0;
  const high = Math.max(low + step, Math.ceil(last / step) * step);
  const ticks: number[] = [];
  for (let tick = low; tick <= high; tick += step) ticks.push(tick);
  const x = (index: number) => ((index + 0.5) / rows.length) * 100;
  const y = (value: number) => (1 - (value - low) / (high - low)) * 100;
  const line = values.map((value, index) => `${x(index) * 10},${y(value) * 1.6}`).join(" ");
  const area = `${x(0) * 10},${CHART_HEIGHT} ${line} ${x(rows.length - 1) * 10},${CHART_HEIGHT}`;
  const dailyMax = Math.max(1, ...rows.map((day) => day.entries ?? 0));
  const total = rows.reduce((sum, day) => sum + (day.entries ?? 0), 0);
  const closedDays = days.filter((day) => day.entries === null).length;
  const labels =
    range === "30"
      ? rows.flatMap((day, index) => ((rows.length - 1 - index) % 7 === 0 ? [{ day, index }] : []))
      : rows.flatMap((day, index) => (day.date.endsWith("-01") ? [{ day, index }] : []));

  return (
    <div>
      <p className="mb-3 max-w-[44em] text-sm text-muted">
        {range === "30"
          ? `Son ${rows.length} günde ${formatStatsNumber(total)} entry yazıldı. Üstte toplam, altta günlük sayı.`
          : `${formatStatsDay(days[0]?.date ?? "")}’dan bu yana. ${closedDays} günde yayında entry yok (gri sütunlar). Ağustos başındaki sıçrama, ilk yazar dalgasının hacmidir; okur ilgisi değildir.`}
      </p>
      <div
        role="group"
        aria-label="Zaman aralığı"
        className="mb-3 inline-flex rounded-full border bg-surface p-[3px]"
      >
        {(
          [
            ["30", `son ${windowDays} gün`],
            ["all", "tüm dönem"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={range === value}
            onClick={() => setRange(value)}
            className={`rounded-full px-3 py-1 text-xs ${
              range === value ? "bg-primary font-semibold text-on-primary" : "text-muted"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="surface-card p-4">
        <div className="relative ml-11 mr-2" style={{ height: CHART_HEIGHT }}>
          {ticks.map((tick) => (
            <div
              key={tick}
              className="absolute inset-x-0 border-t border-border/70"
              style={{ top: `${y(tick)}%` }}
            >
              <span className="absolute -left-11 -top-2 w-9 text-right text-[11px] text-muted">
                {formatStatsNumber(tick / 1000, 1)} bin
              </span>
            </div>
          ))}
          <svg
            viewBox={`0 0 1000 ${CHART_HEIGHT}`}
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full overflow-visible"
            aria-hidden="true"
          >
            <polygon points={area} className="fill-primary/10" />
            <polyline
              points={line}
              fill="none"
              className="stroke-primary"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <span
            className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-2 ring-surface"
            style={{ left: `${x(rows.length - 1)}%`, top: `${y(last)}%` }}
          />
          <span
            className="absolute -translate-x-full -translate-y-1/2 pr-3 text-xs font-bold"
            style={{ left: `${x(rows.length - 1)}%`, top: `${y(last)}%` }}
          >
            {formatStatsNumber(last)}
          </span>
        </div>
        <div className="relative ml-11 mr-2 mt-7 flex h-[90px] items-end gap-px border-b">
          <span className="absolute -left-11 top-0 w-9 text-right text-[11px] text-muted">
            {formatStatsNumber(dailyMax)}
          </span>
          {rows.map((day) => {
            const tip =
              day.entries === null
                ? `${formatStatsDay(day.date)} · yayında entry yok`
                : `${formatStatsDay(day.date)} · ${formatStatsNumber(day.entries)} entry · ${formatStatsNumber(day.newTopics ?? 0)} yeni başlık · toplam ${formatStatsNumber(cumulative.get(day.date) ?? 0)}`;
            return (
              <div
                key={day.date}
                data-tip={tip}
                aria-label={range === "30" ? tip : undefined}
                tabIndex={range === "30" ? 0 : undefined}
                className="flex h-full min-w-0 flex-1 items-end justify-center"
              >
                <div
                  className={
                    day.entries === null
                      ? "h-full w-full max-w-[14px] rounded-t-sm bg-border/60"
                      : "w-full max-w-[14px] rounded-t-[3px] bg-primary/85"
                  }
                  style={
                    day.entries === null
                      ? undefined
                      : { height: `${(day.entries / dailyMax) * 100}%` }
                  }
                />
              </div>
            );
          })}
        </div>
        <div className="relative ml-11 mr-2 h-5 text-[11px] text-muted" aria-hidden="true">
          {labels.map(({ day, index }) => (
            <span
              key={day.date}
              className="absolute top-1 -translate-x-1/2 whitespace-nowrap"
              style={{ left: `${x(index)}%` }}
            >
              {shortStatsDay(day.date)}
            </span>
          ))}
        </div>
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-muted">veriyi tablo olarak gör</summary>
          <table className="mt-2 w-full text-xs">
            <thead>
              <tr className="border-b text-left">
                <th className="py-1 pr-2 font-semibold">gün</th>
                <th className="py-1 pr-2 text-right font-semibold">entry</th>
                <th className="py-1 pr-2 text-right font-semibold">yeni başlık</th>
                <th className="py-1 text-right font-semibold">toplam</th>
              </tr>
            </thead>
            <tbody>
              {[...rows].reverse().map((day) => (
                <tr key={day.date} className="border-b border-border/60">
                  <td className="py-1 pr-2">{formatStatsDay(day.date)}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">
                    {day.entries === null ? "—" : formatStatsNumber(day.entries)}
                  </td>
                  <td className="py-1 pr-2 text-right tabular-nums">
                    {day.newTopics === null ? "—" : formatStatsNumber(day.newTopics)}
                  </td>
                  <td className="py-1 text-right tabular-nums">
                    {formatStatsNumber(cumulative.get(day.date) ?? 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </div>
    </div>
  );
}
