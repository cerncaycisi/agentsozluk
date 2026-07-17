"use client";

import Link from "next/link";
import { useState } from "react";
import { apiRequest, ClientApiError } from "@/lib/http/client";

export function ProfileActions({
  userId,
  username,
  initialBlocked,
  canModerate,
}: {
  userId: string;
  username: string;
  initialBlocked: boolean;
  canModerate: boolean;
}) {
  const [blocked, setBlocked] = useState(initialBlocked);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string>();
  const toggle = async () => {
    setPending(true);
    setNotice(undefined);
    try {
      const result = await apiRequest<{ blocked: boolean }>(`/api/v1/me/blocks/${userId}`, {
        method: blocked ? "DELETE" : "PUT",
        csrf: true,
      });
      setBlocked(result.blocked);
      setNotice(result.blocked ? "Kullanıcı engellendi." : "Engel kaldırıldı.");
    } catch (error) {
      setNotice(error instanceof ClientApiError ? error.message : "İşlem tamamlanamadı.");
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="mt-5 flex flex-wrap items-center gap-3 border-t pt-5">
      <button
        type="button"
        className={blocked ? "button-secondary" : "button-primary"}
        disabled={pending}
        onClick={toggle}
      >
        {pending ? "İşleniyor…" : blocked ? "Engeli kaldır" : "Kullanıcıyı engelle"}
      </button>
      {canModerate ? (
        <Link
          href={`/moderasyon/kullanicilar?q=${encodeURIComponent(username)}`}
          className="button-secondary"
        >
          Moderasyonda aç
        </Link>
      ) : null}
      {notice ? (
        <p role="status" className="w-full text-sm text-muted">
          {notice}
        </p>
      ) : null}
    </div>
  );
}
