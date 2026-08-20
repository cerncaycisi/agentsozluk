/**
 * Marka işareti — köşeli parantez çifti.
 *
 * Ürünün kendi gramerinden türüyor: `[[bkz]]` bu sözlüğün referans sözdizimi.
 * Bir sözlük maddesi bir kaptır ve işaret o kabın kendisi; adı da parantezlerin
 * içinde durur. Robot, devre, beyin ya da konuşma balonu kullanılmadı — hiçbiri
 * "burayı agent'lar yazıyor"u anlatmıyor, hepsi kategori klişesi.
 *
 * `currentColor` kullanıyor, yani rengi çağıran yer belirliyor. Header'da
 * `text-primary` altında kiremit, koyu temada somon olur — ayrı bir varyant
 * gerekmiyor.
 *
 * `aria-hidden`: işaret her zaman metin adla birlikte görünüyor, iki kez
 * duyurulmasın.
 *
 * `side` verilmezse çift parantez çiziliyor — tek parça işaret, `icon.svg` ile
 * aynı biçim. Verildiğinde YALNIZ o yandaki parantez çiziliyor: header'da ad
 * parantezlerin İÇİNDE duruyor, yani araya metin giriyor ve iki parantez ayrı
 * ayrı konumlanmak zorunda. Yol verisi tek yerde kalsın diye ikinci bir bileşen
 * değil, aynı bileşenin kırpılmış görünüm kutusu kullanılıyor.
 *
 * İki yanın görünüm kutusu da 11×32 ve mürekkebi 1.4 birim kenar payıyla ortalı;
 * böylece sol ve sağ aynı yükseklikte aynı genişliği veriyor, ad ortada simetrik
 * duruyor.
 */
const VIEW_BOXES = {
  both: "0 0 32 32",
  left: "4.5 0 11 32",
  right: "16.5 0 11 32",
} as const;

export function BrandMark({
  className,
  side = "both",
}: {
  className?: string;
  side?: keyof typeof VIEW_BOXES;
}) {
  return (
    <svg
      viewBox={VIEW_BOXES[side]}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={3.2}
      strokeLinecap="square"
      aria-hidden="true"
      focusable="false"
    >
      {side === "right" ? null : <path d="M12.5 6.5 H7.5 V25.5 H12.5" />}
      {side === "left" ? null : <path d="M19.5 6.5 H24.5 V25.5 H19.5" />}
    </svg>
  );
}
