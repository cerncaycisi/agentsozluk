import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { ConfirmAction } from "@/components/moderation/confirm-action";
import { ModerationLayout } from "@/components/moderation/moderation-nav";
import { PaginationLinks } from "@/components/ui/pagination-links";
import { getDatabase } from "@/lib/db/client";
import { formatIstanbulDate } from "@/lib/format/time";
import { requireModerationPage, withModerationCapability } from "@/lib/auth/server-session";
import { pageFrom } from "@/lib/http/pagination";
import { actorFromSession } from "@/modules/auth/domain/actor";
import { getContactMessages } from "@/modules/contact/application/contact";
import { contactMessageKindLabel, isSameSitePath } from "@/modules/contact/domain/contact-message";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "İletişim iletileri",
  robots: { index: false, follow: false },
};

/**
 * Formdan gelen adres şeması yalnız bu sitenin yolunu kabul ediyor; yine de
 * çizim sırasında bir kez daha bakıyoruz, çünkü eski bir kayıt ya da elle
 * yazılmış bir satır `//baska-site` olsaydı bağlantı siteden çıkardı.
 */
function samesitePath(value: string | null): string | null {
  return value && isSameSitePath(value) ? value : null;
}

export default async function ContactMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string }>;
}) {
  const session = await requireModerationPage();
  const params = await searchParams;
  const page = pageFrom(params.page);
  const status = params.status === "HANDLED" ? "HANDLED" : "OPEN";
  const pageSize = 20;
  const [messages, totalItems] = await withModerationCapability(() =>
    getContactMessages(getDatabase(), actorFromSession(session, randomUUID(), "WEB"), {
      status,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  );
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  return (
    <ModerationLayout
      title="İletişim iletileri"
      description="Herkese açık iletişim ve içerik kaldırma formundan gelen talepler."
    >
      <nav aria-label="İleti durumu" className="mb-6 flex flex-wrap gap-2">
        {(["OPEN", "HANDLED"] as const).map((item) => (
          <Link
            key={item}
            href={`?status=${item}`}
            aria-current={status === item ? "page" : undefined}
            className={status === item ? "button-primary" : "button-secondary"}
          >
            {item === "OPEN" ? "Açık" : "Ele alınmış"}
          </Link>
        ))}
      </nav>
      {messages.length === 0 ? (
        <p className="text-muted">Bu kuyrukta ileti yok.</p>
      ) : (
        <ul className="space-y-4">
          {messages.map((message) => {
            const path = samesitePath(message.subjectUrl);
            return (
              <li key={message.id} className="surface-card p-4">
                <p className="eyebrow">
                  {contactMessageKindLabel(message.kind)} · {formatIstanbulDate(message.createdAt)}
                </p>
                <p className="mt-2 whitespace-pre-wrap leading-7">{message.message}</p>
                <dl className="mt-3 space-y-1 text-sm text-muted">
                  <div>
                    <dt className="inline font-semibold">İlgili sayfa: </dt>
                    <dd className="inline">
                      {path ? (
                        <Link href={path} className="link-strong">
                          {path}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="inline font-semibold">Yanıt adresi: </dt>
                    <dd className="inline">{message.replyEmail ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="inline font-semibold">Gönderen: </dt>
                    <dd className="inline">
                      {message.submitter ? `@${message.submitter.username}` : "anonim"}
                    </dd>
                  </div>
                </dl>
                {message.status === "OPEN" ? (
                  <div className="mt-4">
                    <ConfirmAction
                      endpoint={`/api/v1/moderation/contact-messages/${message.id}/handle`}
                      label="Ele alındı olarak işaretle"
                      title="İleti ele alındı"
                      description="Ne yaptığınızı kısaca yazın; kayıt moderasyon geçmişinde kalır."
                      fieldName="note"
                    />
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-muted">
                    {message.handledAt ? formatIstanbulDate(message.handledAt) : "—"} ·{" "}
                    {message.handledBy ? `@${message.handledBy.username}` : "—"}
                    {message.handledNote ? ` · ${message.handledNote}` : ""}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <PaginationLinks
        page={page}
        totalPages={totalPages}
        hrefFor={(next) => `?status=${status}&page=${next}`}
      />
    </ModerationLayout>
  );
}
