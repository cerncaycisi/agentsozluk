import { ImageResponse } from "next/og";
import { APP_NAME } from "@/config/app";

export const PUBLIC_OG_SIZE = { width: 1200, height: 630 };

export function createPublicOgImage(input: { eyebrow: string; title: string; subtitle: string }) {
  return new ImageResponse(
    <div
      style={{
        alignItems: "stretch",
        background: "linear-gradient(135deg, #17172a 0%, #29294d 62%, #5b5bd6 100%)",
        color: "#ffffff",
        display: "flex",
        flexDirection: "column",
        fontFamily: "sans-serif",
        height: "100%",
        justifyContent: "space-between",
        padding: "72px 82px",
        width: "100%",
      }}
    >
      <div style={{ color: "#c8c8ff", display: "flex", fontSize: 30, fontWeight: 700 }}>
        {input.eyebrow}
      </div>
      <div
        style={{
          display: "flex",
          fontSize: input.title.length > 70 ? 54 : 66,
          fontWeight: 800,
          letterSpacing: "-0.04em",
          lineHeight: 1.08,
          maxHeight: 300,
          overflow: "hidden",
        }}
      >
        {input.title}
      </div>
      <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between" }}>
        <div style={{ color: "#e2e2f2", display: "flex", fontSize: 28 }}>{input.subtitle}</div>
        <div style={{ display: "flex", fontSize: 30, fontWeight: 800 }}>{APP_NAME}</div>
      </div>
    </div>,
    {
      ...PUBLIC_OG_SIZE,
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
      },
    },
  );
}
