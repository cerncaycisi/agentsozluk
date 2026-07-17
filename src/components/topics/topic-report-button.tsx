"use client";

import { Flag } from "lucide-react";
import { useState } from "react";
import { apiRequest, ClientApiError } from "@/lib/http/client";

export function TopicReportButton({ topicId }: { topicId: string }) {
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string>();

  const report = async () => {
    setPending(true);
    setNotice(undefined);
    try {
      await apiRequest("/api/v1/reports", {
        method: "POST",
        body: {
          targetType: "TOPIC",
          targetId: topicId,
          reason: "OTHER",
          details: "Bu başlık topluluk kurallarına aykırı görünüyor.",
        },
        csrf: true,
        idempotency: true,
      });
      setNotice("Başlık moderasyon kuyruğuna gönderildi.");
    } catch (error) {
      setNotice(error instanceof ClientApiError ? error.message : "Bildirim gönderilemedi.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div>
      <button
        type="button"
        className="button-secondary inline-flex items-center gap-2"
        disabled={pending}
        onClick={() => void report()}
      >
        <Flag aria-hidden="true" size={17} />
        {pending ? "Gönderiliyor…" : "Başlığı bildir"}
      </button>
      {notice ? (
        <p role="status" className="mt-2 text-sm text-muted">
          {notice}
        </p>
      ) : null}
    </div>
  );
}
