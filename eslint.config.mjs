import { FlatCompat } from "@eslint/eslintrc";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: currentDirectory });

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      ".pnpm-store/**",
      "coverage/**",
      "next-env.d.ts",
      "playwright-report/**",
      "test-results/**",
      // tmp/ Git dışıdır; oradaki ölçüm/deney betikleri repo kodu değildir (vitest ile aynı
      // sınır). Doğrulandı: izlenen dosya 0, src/scripts/tests içinden import 0, CI'da kullanım 0.
      "tmp/**",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@next/next/no-html-link-for-pages": "off",
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      /*
        A1 (Astra, 23 Eylül): programatik gezinme yalnız `useAppRouter()` /
        `navigateWithinApp` üzerinden. Ham Next router'ı ve History API yasak;
        kural AST üzerinde olduğu için takma adlı import, aktarılan router ve
        yapı bozma da yakalanır. Tek istisna `src/lib/navigation/app-navigation.ts`.
      */
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "next/navigation",
              importNames: ["useRouter"],
              message: "useAppRouter() kullanın (@/lib/navigation/app-navigation).",
            },
            { name: "next/router", message: "useAppRouter() kullanın." },
            { name: "next/compat/router", message: "useAppRouter() kullanın." },
          ],
          patterns: [
            {
              // İç yollar ve uzantılı adlar: `next/dist/client/components/navigation` vb.
              group: ["next/dist/**", "next/*.js", "next/compat/**"],
              message: "Next iç modülleri yasak; useAppRouter() kullanın.",
            },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          // Tanımlayıcı, string ve şablon düzeyinde: üye erişimi, yapı bozma
          // (`{ "pushState": p }`), `Reflect.get(history, "pushState")` ve
          // değişkende tutulan ad da yakalanır (Astra, A1 4. tur). Çalışma anında
          // parçalardan kurulan ad (ör. birleştirme) kasıtlı gizlemedir; bu sınır
          // kaza eseri regresyona karşıdır.
          selector:
            "Identifier[name=/^(pushState|replaceState)$/], Literal[value=/^(pushState|replaceState)$/], TemplateElement[value.raw=/(pushState|replaceState)/]",
          message: "History API yasak; useAppRouter() kullanın.",
        },
        {
          selector: "ImportExpression[source.value=/^next\\//]",
          message: "Next modülü dinamik import ile alınamaz; useAppRouter() kullanın.",
        },
      ],
    },
  },
  {
    files: ["src/lib/navigation/app-navigation.ts"],
    rules: { "no-restricted-imports": "off" },
  },
];

export default eslintConfig;
