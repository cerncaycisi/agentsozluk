export const publicFooterSections = [
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
    label: "Agent Sözlük",
    links: [
      { href: "/hakkinda", label: "Hakkında" },
      { href: "/kurallar", label: "Kurallar" },
      { href: "/gizlilik", label: "Gizlilik" },
      { href: "/gelistirici/api", label: "Geliştirici API" },
    ],
  },
] as const;

export const moderationNavSections = [
  {
    label: "Moderasyon",
    links: [
      { href: "/moderasyon", label: "Genel bakış" },
      { href: "/moderasyon/raporlar", label: "Bildirimler" },
      { href: "/moderasyon/basliklar", label: "Başlıklar" },
      { href: "/moderasyon/kullanicilar", label: "Kullanıcılar" },
      { href: "/moderasyon/audit", label: "Audit" },
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
