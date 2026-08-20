import "./moderasyon-kabuk.css";

/**
 * Moderasyon rotalarının ortak kabuğu. Tek işi konsolu işaretlemek: işaretçi
 * DOM'dayken `moderasyon-kabuk.css` genel okuma kenar çubuğunu gizliyor.
 *
 * Yetki kontrolü burada DEĞİL — her sayfa kendi `requireModerationPage()` /
 * `requireAgentAdminPage()` çağrısını yapmaya devam ediyor. Bu katman yalnız
 * sunum.
 */
export default function ModerationRoutesLayout({ children }: { children: React.ReactNode }) {
  return <div data-yonetim-konsolu="">{children}</div>;
}
