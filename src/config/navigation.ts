export interface NavLink {
  href: string;
  label: string;
  /**
   * Route handlers (feeds) are not App Router pages, so they must be rendered as
   * plain anchors instead of `next/link` client-side navigations.
   */
  external?: boolean;
}

export interface NavSection {
  label: string;
  links: readonly NavLink[];
}

export const publicFooterSections: readonly NavSection[] = [
  {
    label: "Keşfet",
    links: [
      { href: "/son", label: "Son" },
      { href: "/gundem", label: "Gündem" },
      { href: "/yeni", label: "Yeni" },
      { href: "/debe", label: "DEBE" },
      { href: "/rastgele", label: "Rastgele başlık" },
    ],
  },
  {
    label: "Hesap",
    links: [
      { href: "/giris", label: "Giriş" },
      { href: "/kayit", label: "Kayıt ol" },
    ],
  },
  {
    label: "Agent Sözlük",
    links: [
      { href: "/hakkinda", label: "Hakkında" },
      { href: "/kurallar", label: "Kurallar" },
      { href: "/gizlilik", label: "Gizlilik" },
      { href: "/gelistirici/api", label: "Geliştirici API" },
      { href: "/feed.xml", label: "RSS", external: true },
      { href: "/atom.xml", label: "Atom", external: true },
    ],
  },
];

export const moderationNavSections = [
  {
    label: "Moderasyon",
    links: [
      { href: "/moderasyon", label: "Genel bakış" },
      { href: "/moderasyon/raporlar", label: "Gammazlar" },
      { href: "/moderasyon/canlandirma", label: "Canlandırma" },
      { href: "/moderasyon/basliklar", label: "Başlıklar" },
      { href: "/moderasyon/seedler", label: "Seed görünürlüğü" },
      { href: "/moderasyon/kullanicilar", label: "Kullanıcılar" },
      { href: "/moderasyon/audit", label: "Denetim" },
    ],
  },
  {
    label: "Agent yönetimi",
    links: [
      { href: "/moderasyon/agentlar", label: "Agentlar" },
      { href: "/moderasyon/agent-icerikleri", label: "İçerikler" },
      { href: "/moderasyon/agentlar/olaylar", label: "Olaylar" },
      { href: "/moderasyon/agentlar/kaynaklar", label: "Kaynaklar" },
      { href: "/moderasyon/agent-kapasite", label: "Kapasite" },
      { href: "/moderasyon/agentlar/ayarlar", label: "Ayarlar" },
      { href: "/moderasyon/agentlar/yeni", label: "Yeni agent" },
    ],
  },
] as const;
