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
          className="min-h-11 min-w-0 flex-1 rounded border bg-surface px-3"
        />
        <button className="button-secondary">Ara</button>
      </form>
      <div className="space-y-3">
        {users.map((user) => {
          const hasGammaz = user.moderationCapabilities.some(
            ({ capability }) => capability === "GAMMAZ",
          );
          const hasFormatModeration = user.moderationCapabilities.some(
            ({ capability }) => capability === "FORMAT_MODERATOR",
          );
          const hasLegalReview = user.moderationCapabilities.some(
            ({ capability }) => capability === "LEGAL_REVIEWER",
          );
          const canGrantSelfCapability =
            session.user.role === "ADMIN" &&
            user.kind === "HUMAN" &&
            user.role === "ADMIN" &&
            user.id === session.userId &&
            user.status === "ACTIVE";
          return (
            <article key={user.id} className="surface-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="title-item">{user.displayName}</h2>
                  <p className="mt-1 text-sm text-muted">
                    @{user.username} · {user.role} · {user.status}
                    {!user.writerApproved ? " · YAZAR ONAYI BEKLİYOR" : ""}
                    {hasGammaz ? " · GAMMAZ" : ""}
                    {hasFormatModeration ? " · FORMAT MODERATÖRÜ" : ""}
                    {hasLegalReview ? " · HUKUK İNCELEYİCİSİ" : ""}
                  </p>
                  {user._count.reportsCreated > 0 ? (
                    <p className="mt-1 text-xs font-semibold text-destructive">
                      Reddedilen gammaz: {user._count.reportsCreated}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {canGrantSelfCapability && !hasGammaz ? (
                    <ConfirmAction
                      endpoint={`/api/v1/admin/users/${user.id}/grant-gammaz`}
                      label="Gammaz yetkisi ver"
                      title="GAMMAZ capability’si ver"
                      description="Bu hesap anayasal gerekçelerle gammaz oluşturabilecek. Yetki rol ve admin sayısından bağımsızdır."
                    />
                  ) : null}
                  {canGrantSelfCapability && !hasFormatModeration ? (
                    <ConfirmAction
                      endpoint={`/api/v1/admin/users/${user.id}/moderation-capabilities/FORMAT_MODERATOR/grant`}
                      label="Format yetkisi ver"
                      title="FORMAT_MODERATOR capability’si ver"
                      description="Bu hesap format kuyruğunda anayasal karar verebilecek ve doğru içerik işlemini uygulayabilecek."
                    />
                  ) : null}
                  {session.user.role === "ADMIN" &&
                  user.kind === "HUMAN" &&
                  user.status === "ACTIVE" &&
                  hasFormatModeration ? (
                    <ConfirmAction
                      endpoint={`/api/v1/admin/users/${user.id}/moderation-capabilities/FORMAT_MODERATOR/revoke`}
                      label="Format yetkisini al"
                      title="FORMAT_MODERATOR capability’sini geri al"
                      description="Yeni format kararı ve işlemi kapanır; geçmiş kayıtlar korunur."
                      destructive
                    />
                  ) : null}
                  {canGrantSelfCapability && !hasLegalReview ? (
                    <ConfirmAction
                      endpoint={`/api/v1/admin/users/${user.id}/moderation-capabilities/LEGAL_REVIEWER/grant`}
                      label="Hukuk yetkisi ver"
                      title="LEGAL_REVIEWER capability’si ver"
                      description="Bu hesap hukuk/ticari risk kuyruğunda anayasal karar verebilecek."
                    />
                  ) : null}
                  {session.user.role === "ADMIN" &&
                  user.kind === "HUMAN" &&
                  user.status === "ACTIVE" &&
                  hasLegalReview ? (
                    <ConfirmAction
                      endpoint={`/api/v1/admin/users/${user.id}/moderation-capabilities/LEGAL_REVIEWER/revoke`}
                      label="Hukuk yetkisini al"
                      title="LEGAL_REVIEWER capability’sini geri al"
                      description="Yeni hukuk inceleme kararı kapanır; geçmiş kayıtlar korunur."
                      destructive
                    />
                  ) : null}
                  {session.user.role === "ADMIN" &&
                  user.kind === "HUMAN" &&
                  user.status === "ACTIVE" &&
                  hasGammaz ? (
                    <ConfirmAction
                      endpoint={`/api/v1/admin/users/${user.id}/revoke-gammaz`}
                      label="Gammaz yetkisini al"
                      title="GAMMAZ capability’sini geri al"
                      description="Yeni gammaz oluşturma yetkisi kapanır; geçmiş kayıtlar korunur."
                      destructive
                    />
                  ) : null}
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
                  {user.status === "ACTIVE" &&
                  user.role !== "ADMIN" &&
                  user.id !== session.userId ? (
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
          );
        })}
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
