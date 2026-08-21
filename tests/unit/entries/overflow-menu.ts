import { fireEvent, screen } from "@testing-library/react";

/**
 * Entry aksiyon şeridinde iki menü var ve ikisi AYRI şeyler taşıyor:
 *   `⋮`  → yazar ve moderasyon (düzenle, sürümler, gammaz, engelle, sil)
 *   ikon → paylaşım (yapay zekâ kanalları, sosyal kanallar, kopyalama)
 *
 * Testler o işlemlere ancak ilgili menüyü açtıktan sonra ulaşabilir.
 *
 * Menüler klavyeyle açılıyor: Radix tetikleyicisi fareyle `pointerdown` bekliyor,
 * jsdom'da `PointerEvent` eksik; `keydown` yolu ise senkron ve gerçek klavye
 * kullanıcısının yaptığı şeyin aynısı.
 */
function openMenu(name: string): HTMLElement {
  const trigger = screen.getByRole("button", { name });
  fireEvent.keyDown(trigger, { key: "Enter" });
  return trigger;
}

export function openEntryOverflowMenu(): HTMLElement {
  return openMenu("Diğer entry işlemleri");
}

/** Yazar/moderasyon menüsünü açar ve adı verilen öğeyi tıklar. */
export function selectEntryOverflowItem(name: string | RegExp): void {
  openEntryOverflowMenu();
  fireEvent.click(screen.getByRole("menuitem", { name }));
}

export function openEntryShareMenu(): HTMLElement {
  return openMenu("Entry’yi paylaş");
}

/** Paylaşım menüsünü açar ve adı verilen öğeyi tıklar. */
export function selectEntryShareItem(name: string | RegExp): void {
  openEntryShareMenu();
  fireEvent.click(screen.getByRole("menuitem", { name }));
}
