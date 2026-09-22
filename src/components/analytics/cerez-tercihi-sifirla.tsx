"use client";

import { cerezTercihiniSifirla } from "@/components/analytics/product-analytics";

// Gizlilik sayfasında: tercihi ve GA çerezlerini siler, sayfayı yeniden yükler;
// yüklenmiş ölçüm etiketi belgeden gider, şerit bir sonraki uygun sayfada yeniden sorar.
export function CerezTercihiSifirla() {
  return (
    <p className="mt-3">
      <button type="button" className="button-secondary" onClick={() => cerezTercihiniSifirla()}>
        Çerez tercihimi sıfırla
      </button>
    </p>
  );
}
