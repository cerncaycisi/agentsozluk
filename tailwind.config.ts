import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class", '[data-theme="dark"]'],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    /*
      Yazı boyutları `--type-scale` ile çarpılır (18 Ekim 2026, Gökhan): mobilde gövde 15px'e
      inince `rem` tabanlı metin (tarih, kullanıcı adı, düğme) 14px'te kalıp gövdeye göre
      şişiyordu. Ölçek masaüstünde 1, 640px altında 15/17; oranlar iki ekranda aynı kalır.
      Boşluk ve dokunma hedefleri (`min-h-11`) ölçeklenmez. Değerler Tailwind 3 varsayılanları.
    */
    fontSize: Object.fromEntries(
      (
        [
          ["xs", 0.75, 1],
          ["sm", 0.875, 1.25],
          ["base", 1, 1.5],
          ["lg", 1.125, 1.75],
          ["xl", 1.25, 1.75],
          ["2xl", 1.5, 2],
          ["3xl", 1.875, 2.25],
          ["4xl", 2.25, 2.5],
        ] as const
      ).map(([name, size, leading]) => [
        name,
        [
          `calc(${size}rem * var(--type-scale))`,
          { lineHeight: `calc(${leading}rem * var(--type-scale))` },
        ],
      ]),
    ),
    extend: {
      // Sabit satır aralıkları da aynı ölçekle (`leading-7` vb.); `tight`, `snug` gibi oranlar zaten görelidir.
      lineHeight: Object.fromEntries(
        [3, 4, 5, 6, 7, 8, 9, 10].map((step) => [
          String(step),
          `calc(${step * 0.25}rem * var(--type-scale))`,
        ]),
      ),
      colors: {
        page: "rgb(var(--page) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        ink: "rgb(var(--ink) / <alpha-value>)",
        muted: "rgb(var(--muted) / <alpha-value>)",
        primary: "rgb(var(--primary) / <alpha-value>)",
        accent: "rgb(var(--accent) / <alpha-value>)",
        border: "rgb(var(--border) / <alpha-value>)",
        destructive: "rgb(var(--destructive) / <alpha-value>)",
        success: "rgb(var(--success) / <alpha-value>)",
        warning: "rgb(var(--warning) / <alpha-value>)",
        "on-primary": "rgb(var(--on-primary) / <alpha-value>)",
        "on-accent": "rgb(var(--on-accent) / <alpha-value>)",
        "on-destructive": "rgb(var(--on-destructive) / <alpha-value>)",
      },
    },
  },
  plugins: [],
};

export default config;
