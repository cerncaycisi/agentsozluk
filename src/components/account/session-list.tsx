"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest, ClientApiError } from "@/lib/http/client";

interface ActiveSession {
  id: string;
  userAgent: string | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  current: boolean;
}

export function SessionList() {
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [notice, setNotice] = useState<string>();
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiRequest<{ sessions: ActiveSession[] }>("/api/v1/me/sessions");
      setSessions(data.sessions);
    } catch (error) {
      setNotice(error instanceof ClientApiError ? error.message : "Oturumlar yüklenemedi.");
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const revoke = async (sessionId: string) => {
    setBusy(true);
    setNotice(undefined);
    try {
      const result = await apiRequest<{ currentSession: boolean }>(
        `/api/v1/me/sessions/${sessionId}`,
        { method: "DELETE", csrf: true },
      );
      if (result.currentSession) {
        window.location.assign("/");
        return;
      }
      await load();
      setNotice("Oturum kapatıldı.");
    } catch (error) {
      setNotice(error instanceof ClientApiError ? error.message : "Oturum kapatılamadı.");
    } finally {
      setBusy(false);
    }
  };

  const revokeOthers = async () => {
    setBusy(true);
    setNotice(undefined);
    try {
      await apiRequest("/api/v1/me/sessions", { method: "DELETE", csrf: true });
      await load();
      setNotice("Diğer bütün oturumlar kapatıldı.");
    } catch (error) {
      setNotice(error instanceof ClientApiError ? error.message : "Oturumlar kapatılamadı.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="surface-card p-6" aria-labelledby="active-sessions">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="active-sessions" className="text-xl font-black">
            Aktif oturumlar
          </h2>
          <p className="mt-1 text-sm text-muted">
            Tanımadığınız cihazların erişimini hemen kaldırın.
          </p>
        </div>
        <button type="button" onClick={revokeOthers} disabled={busy} className="button-secondary">
          Diğerlerini kapat
        </button>
      </div>
      {notice ? (
        <p role="status" className="mt-5 rounded-xl bg-primary/10 px-4 py-3 text-sm">
          {notice}
        </p>
      ) : null}
      <ul className="mt-5 divide-y">
        {sessions.map((session) => (
          <li
            key={session.id}
            className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p className="font-bold">
                {session.userAgent || "Bilinmeyen cihaz"}{" "}
                {session.current ? (
                  <span className="ml-2 rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">
                    bu oturum
                  </span>
                ) : null}
              </p>
              <p className="mt-1 text-sm text-muted">
                Oluşturuldu: {new Date(session.createdAt).toLocaleString("tr-TR")} · Son kullanım:{" "}
                {new Date(session.lastUsedAt).toLocaleString("tr-TR")}
              </p>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => void revoke(session.id)}
              className="text-left text-sm font-semibold text-destructive hover:underline"
            >
              {session.current ? "Bu oturumu kapat" : "Erişimi kaldır"}
            </button>
          </li>
        ))}
      </ul>
      {sessions.length === 0 && !notice ? (
        <p className="mt-5 text-muted">Aktif oturum bulunamadı.</p>
      ) : null}
    </section>
  );
}
