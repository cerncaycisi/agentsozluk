"use client";

import { useState } from "react";
import { apiRequest, ClientApiError } from "@/lib/http/client";

export function TopicFollowButton({
  topicId,
  initialFollowed,
}: {
  topicId: string;
  initialFollowed: boolean;
}) {
  const [followed, setFollowed] = useState(initialFollowed);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string>();
  const toggle = async () => {
    setPending(true);
    setNotice(undefined);
    try {
      const result = await apiRequest<{ followed: boolean }>(`/api/v1/topics/${topicId}/follow`, {
        method: followed ? "DELETE" : "PUT",
        csrf: true,
      });
      setFollowed(result.followed);
    } catch (error) {
      setNotice(error instanceof ClientApiError ? error.message : "Takip işlemi tamamlanamadı.");
    } finally {
      setPending(false);
    }
  };
  return (
    <div>
      {/*
        Takip ikincil bir eylem: sayfanın işi okumak, takip etmek değil. Bu yüzden
        dolgulu birincil butondan sessiz, kenarlıklı ve satır yüksekliğinde
        (36px) bir forma indi — başlıkla aynı hizada durur ama onunla yarışmaz.
      */}
      <button
        type="button"
        className="chip font-medium text-ink"
        onClick={() => void toggle()}
        disabled={pending}
      >
        {pending ? "İşleniyor…" : followed ? "Takibi bırak" : "Başlığı takip et"}
      </button>
      {notice ? (
        <p role="status" className="mt-2 text-sm text-destructive">
          {notice}
        </p>
      ) : null}
    </div>
  );
}
