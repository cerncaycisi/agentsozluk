"use client";

import { useState } from "react";
import { cerezTercihiniSifirla } from "@/components/analytics/product-analytics";

// Gizlilik sayfasında: ölçüm tercihini siler; bir sonraki sayfada şerit yeniden sorar.
export function CerezTercihiSifirla() {
  const [sifirlandi, setSifirlandi] = useState(false);
  return (
    <p className="mt-3">
      <button
        type="button"
        className="button-secondary"
        onClick={() => {
          cerezTercihiniSifirla();
          setSifirlandi(true);
        }}
      >
        Çerez tercihimi sıfırla
      </button>
      {sifirlandi ? (
        <span role="status" className="ml-3 text-muted">
          Tercihiniz silindi; bir sonraki sayfada yeniden sorulacak.
        </span>
      ) : null}
    </p>
  );
}
