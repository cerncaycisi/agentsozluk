import Link from "next/link";
import { UkteActions } from "@/components/uktes/ukte-actions";

export function UkteList({
  items,
  nextCursor,
  basePath = "/ukteler",
  admin = false,
  signedIn = false,
}: {
  items: Array<{
    id: string;
    title: string;
    status: string;
    version: number;
    createdAt: string;
    canWithdraw: boolean;
    writeUrl: string;
  }>;
  nextCursor: string | null;
  basePath?: string;
  admin?: boolean;
  signedIn?: boolean;
}) {
  return (
    <>
      {items.length ? (
        <ul className="space-y-4">
          {items.map((item) => (
            <li key={item.id} className="surface-card p-5">
              <h2 className="text-lg font-semibold">{item.title}</h2>
              <time dateTime={item.createdAt} className="mt-1 block text-sm text-muted">
                {new Intl.DateTimeFormat("tr-TR", {
                  dateStyle: "medium",
                  timeZone: "Europe/Istanbul",
                }).format(new Date(item.createdAt))}
              </time>
              {item.status === "OPEN" && (
                <p className="mt-3">
                  <Link
                    href={
                      signedIn ? item.writeUrl : `/giris?next=${encodeURIComponent(item.writeUrl)}`
                    }
                    className="link-strong"
                  >
                    İlk entry’yi yaz
                  </Link>
                </p>
              )}
              {(item.canWithdraw || admin) && (
                <UkteActions
                  id={item.id}
                  version={item.version}
                  status={item.status}
                  canWithdraw={item.canWithdraw}
                  admin={admin}
                />
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="surface-card p-6 text-muted">Burada henüz ukte yok.</p>
      )}
      {nextCursor && (
        <p className="mt-6">
          <Link
            className="link-strong"
            href={`${basePath}${basePath.includes("?") ? "&" : "?"}before=${nextCursor}`}
          >
            Daha eski ukteler
          </Link>
        </p>
      )}
    </>
  );
}
