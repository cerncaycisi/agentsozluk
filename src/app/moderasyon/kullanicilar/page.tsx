import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import { ConfirmAction } from "@/components/moderation/confirm-action";
import { ModerationLayout } from "@/components/moderation/moderation-nav";
import { PaginationLinks } from "@/components/ui/pagination-links";
import { getDatabase } from "@/lib/db/client";
import { requireModerationPage } from "@/lib/auth/server-session";
import { pageFrom } from "@/lib/http/pagination";
import { actorFromSession } from "@/modules/auth/domain/actor";
import { getModerationUsers } from "@/modules/moderation/application/queries";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Kullanıcı moderasyonu",
  robots: { index: false, follow: false },
};

export default async function ModerationUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const session = await requireModerationPage();
  const params = await searchParams;
  const page = pageFrom(params.page);
  const pageSize = 20;
  const query = params.q?.normalize("NFKC").trim();
  const [users, totalItems] = await getModerationUsers(
    getDatabase(),
    actorFromSession(session, randomUUID(), "WEB"),
    { ...(query ? { query } : {}), skip: (page - 1) * pageSize, take: pageSize },
  );
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  return (
    <ModerationLayout
      title="Kullanıcı moderasyonu"
      description="Kullanıcı durumlarını ve izin verilen rol geçişlerini yönetin."
    >
      <form className="mb-5 flex gap-3">
        <label htmlFor="user-filter" className="sr-only">
          Kullanıcı ara
        </label>
        <input
          id="user-filter"
          name="q"
          defaultValue={query}
          placeholder="Kullanıcı adı veya görünen ad"
          className="min-h-11 min-w-0 flex-1 rounded-xl border bg-surface px-3"
        />
        <button className="button-secondary">Ara</button>
      </form>
      <div className="space-y-3">
        {users.map((user) => (
          <article key={user.id} className="surface-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="font-bold">{user.displayName}</h2>
                <p className="mt-1 text-sm text-muted">
                  @{user.username} · {user.role} · {user.status}
                  {!user.writerApproved ? " · YAZAR ONAYI BEKLİYOR" : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {session.user.role === "ADMIN" &&
                user.kind === "HUMAN" &&
                user.role === "USER" &&
                !user.writerApproved &&
                user.status !== "DEACTIVATED" ? (
                  <ConfirmAction
                    endpoint={`/api/v1/admin/users/${user.id}/approve-writer`}
                    label="Yazarlığı onayla"
                    title="Yazar hesabını onayla"
                    description="Kullanıcı onaydan sonra başlık açabilecek ve entry yazabilecek."
                  />
                ) : null}
                {user.status === "ACTIVE" && user.role !== "ADMIN" && user.id !== session.userId ? (
                  <ConfirmAction
                    endpoint={`/api/v1/moderation/users/${user.id}/suspend`}
                    label="Askıya al"
                    title="Kullanıcıyı askıya al"
                    description="Tüm aktif oturumlar kapatılacak ve yazma işlemleri engellenecek."
                    destructive
                  />
                ) : null}
                {user.status === "SUSPENDED" && user.role !== "ADMIN" ? (
                  <ConfirmAction
                    endpoint={`/api/v1/moderation/users/${user.id}/unsuspend`}
                    label="Askıyı kaldır"
                    title="Askıyı kaldır"
                    description="Kullanıcı yeniden aktif yazma yetkisi kazanacak."
                  />
                ) : null}
                {session.user.role === "ADMIN" && user.role === "USER" && user.writerApproved ? (
                  <ConfirmAction
                    endpoint={`/api/v1/admin/users/${user.id}/grant-moderator`}
                    label="Moderatör yap"
                    title="Moderatör rolü ver"
                    description="Kullanıcı moderasyon yetkilerine sahip olacak."
                  />
                ) : null}
                {session.user.role === "ADMIN" && user.role === "MODERATOR" ? (
                  <ConfirmAction
                    endpoint={`/api/v1/admin/users/${user.id}/revoke-moderator`}
                    label="Moderatörlüğü kaldır"
                    title="Moderatör rolünü kaldır"
                    description="Kullanıcı standart USER rolüne dönecek."
                    destructive
                  />
                ) : null}
              </div>
            </div>
          </article>
        ))}
      </div>
      {users.length === 0 ? (
        <p className="surface-card p-6 text-muted">Kullanıcı bulunamadı.</p>
      ) : null}
      <PaginationLinks
        page={page}
        totalPages={totalPages}
        hrefFor={(next) => `?q=${encodeURIComponent(query ?? "")}&page=${next}`}
      />
    </ModerationLayout>
  );
}
