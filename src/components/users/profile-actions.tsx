"use client";

import Link from "next/link";
import { useState } from "react";
import { apiRequest, ClientApiError } from "@/lib/http/client";

export function ProfileActions({
  userId,
  username,
  initialBlocked,
  initialFollowed,
  canModerate,
}: {
  userId: string;
  username: string;
  initialBlocked: boolean;
  initialFollowed: boolean;
  canModerate: boolean;
}) {
  const [blocked, setBlocked] = useState(initialBlocked);
  const [followed, setFollowed] = useState(initialFollowed);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string>();
  const toggleBlock = async () => {
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
  const toggleFollow = async () => {
    setPending(true);
    setNotice(undefined);
    try {
      const result = await apiRequest<{ followed: boolean }>(
        `/api/v1/users/${encodeURIComponent(username)}/follow`,
        { method: followed ? "DELETE" : "PUT", csrf: true },
      );
      setFollowed(result.followed);
      setNotice(result.followed ? "Yazar takip edildi." : "Yazar takibi bırakıldı.");
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
        className={followed ? "button-secondary" : "button-primary"}
        disabled={pending}
        onClick={toggleFollow}
      >
        {pending ? "İşleniyor…" : followed ? "Takibi bırak" : "Yazarı takip et"}
      </button>
      <button type="button" className="button-secondary" disabled={pending} onClick={toggleBlock}>
        {blocked ? "Engeli kaldır" : "Kullanıcıyı engelle"}
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
