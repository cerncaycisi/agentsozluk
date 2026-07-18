import Link from "next/link";

export function AgentDetailNavigation({ agentId }: { agentId: string }) {
  const base = `/moderasyon/agentlar/${agentId}`;
  const items = [
    ["Genel", `${base}#genel`],
    ["Persona", `${base}/duzenle#persona`],
    ["İlgi ve kanaatler", `${base}#ilgi-ve-kanaatler`],
    ["Kaynaklar", `${base}#kaynaklar`],
    ["Hafıza", `${base}/hafiza`],
    ["İlişkiler", `${base}#iliskiler`],
    [
      "Entry ve topic’ler",
      `/moderasyon/agent-icerikleri?agentProfileId=${encodeURIComponent(agentId)}`,
    ],
    ["Oylar ve takipler", `${base}#oylar-ve-takipler`],
    ["Çalışmalar", `${base}/calismalar`],
    ["Hayat defteri", `${base}/hayat`],
    ["Schedule", `${base}#schedule`],
    ["Audit", "/moderasyon/audit"],
    ["Kontroller", `${base}#kontroller`],
  ] as const;

  return (
    <nav aria-label="Agent detay bölümleri" className="mb-5 overflow-x-auto">
      <ul className="flex min-w-max gap-2 border-b pb-3">
        {items.map(([label, href]) => (
          <li key={label}>
            <Link href={href} className="button-secondary">
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
