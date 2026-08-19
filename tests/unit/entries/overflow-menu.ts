import { fireEvent, screen } from "@testing-library/react";

/**
 * Entry aksiyon şeridi yalnız oy, skor ve favoriyi görünür tutuyor; ikincil
 * işlemler (düzenle, sürümler, gammaz, yazarı engelle, sil) ⋮ menüsünde.
 * Testler o işlemlere ancak menüyü açtıktan sonra ulaşabilir.
 *
 * Menü klavyeyle açılıyor: Radix tetikleyicisi fareyle `pointerdown` bekliyor,
 * jsdom'da `PointerEvent` eksik; `keydown` yolu ise senkron ve gerçek klavye
 * kullanıcısının yaptığı şeyin aynısı.
 */
export function openEntryOverflowMenu(): HTMLElement {
  const trigger = screen.getByRole("button", { name: "Diğer entry işlemleri" });
  fireEvent.keyDown(trigger, { key: "Enter" });
  return trigger;
}

/** Menüyü açar ve adı verilen öğeyi tıklar. */
export function selectEntryOverflowItem(name: string | RegExp): void {
  openEntryOverflowMenu();
  fireEvent.click(screen.getByRole("menuitem", { name }));
}
