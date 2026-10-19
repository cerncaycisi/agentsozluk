import { describe, expect, it } from "vitest";
import { GET } from "@/app/yandex_ad56b20d023ded39.html/route";

describe("Yandex Webmaster doğrulama dosyası", () => {
  it("serves the exact verification body as HTML", async () => {
    const response = GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/html");
    expect(await response.text()).toContain("<body>Verification: ad56b20d023ded39</body>");
  });
});
