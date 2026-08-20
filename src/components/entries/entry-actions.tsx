"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  Bookmark,
  EllipsisVertical,
  Flag,
  History,
  Link2,
  Pencil,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  UserX,
} from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { apiRequest, ClientApiError } from "@/lib/http/client";
import { FormTextarea } from "@/components/ui/form-field";
import { GammazButton } from "@/components/moderation/gammaz-button";
import { EntryReferenceToolbar } from "@/components/constitution/writing-guidance";
import { entryPublicUrl } from "@/lib/routing/public-urls";

/**
 * Sunucudaki `entryBodySchema` (`src/modules/entries/validation/schemas.ts`)
 * gövdeyi 10.000 karakterle sınırlar; düzenleme formu yeni entry formuyla
 * aynı sınırı kullanır.
 */
const ENTRY_BODY_MAX_LENGTH = 10_000;

/**
 * Aksiyon şeridinin basılı OLMAYAN kontrolü: çıplak `.icon-button`, kutu yok.
 *
 * `bg-page` da kalktı ve bu bir sadeleştirme değil, bir düzeltme: entry akan
 * listede SAYFA zemininde duruyor (`entry-preview.tsx` — "kutu değil, akan
 * liste"), yani `bg-page` düğmeye tam olarak arkasındaki rengi boyuyordu.
 * Kenarlık kalkınca geriye hiçbir şey çizmeyen bir dolgu kalırdı.
 *
 * Ad bilerek nötr: aynı sınıfı hem misafirin giriş bağlantıları hem oturumlu
 * görünümün basılı olmayan düğmeleri kullanıyor — şerit iki modda da birebir
 * aynı görünmek zorunda. Durum dilini `.icon-button` getiriyor (hover örtüsü,
 * ikonun `--ink`e çıkması, klavye odağı); misafirde öğe bağlantı olduğu için
 * `disabled` dalı hiç devreye girmiyor.
 */
const restingControlClass = "icon-button";

/**
 * Basılı oy/favori. Kutu kalktığı için DOLGU artık kontrolün tek sınırı; sayfa
 * zeminine karşı ölçüldü (açık/koyu): primary 5.741 / 6.903, accent 7.332 /
 * 6.974 — SC 1.4.11 eşiği 3.0. Dolgunun üstündeki ikon: 6.374 / 6.903 ve
 * 8.141 / 6.974.
 */
const pressedPrimaryClass = "icon-button bg-primary text-on-primary";
const pressedAccentClass = "icon-button bg-accent text-on-accent";

/** Skor sayacıyla aynı görsel dil; favori sayacı da aynı sütun genişliğini tutar. */
const counterClass = "min-w-8 text-center text-sm font-medium";

/**
 * ⋮ menüsündeki öğelerin ortak görünümü — artık `globals.css`teki `.menu-item`.
 * Vurgu `data-highlighted` ile (Radix hem fare hem klavye gezinmesinde veriyor),
 * odak halkası yalnız `:focus-visible` ile geliyor. Eski hâl `hover:bg-page
 * focus:bg-page` idi: koyu temada `--page`/`--surface` farkı 1.075 olduğu için
 * vurgu görünmüyordu, ayrıca `outline-none` odak halkasını da siliyordu.
 */
const overflowItemClass = "menu-item";

/**
 * Aksiyon şeridinin "diğer" menüsü. Şerit yalnız oy, skor ve favoriyi görünür
 * tutar; kalabalık yapan ikincil işlemler buraya iner (375px'te şerit tek satırda
 * kalsın diye). Öğeleri çağıran belirler — yeni bir işlem eklemek için buraya
 * `DropdownMenu.Item` geçmek yeterli.
 *
 * Menü hiç öğesi yokken render EDİLMEMELİ; boş bir ⋮ kullanıcıyı yanıltır.
 * "Linki kopyala" oturum gerektirmediği için menü artık her iki görünümde de
 * en az bir öğe taşıyor; yine de doluluk kararı çağırana ait.
 */
function EntryOverflowMenu({
  children,
  onCloseAutoFocus,
  triggerRef,
}: {
  children: ReactNode;
  /**
   * Menü kapanırken Radix odağı ⋮ tetikleyicisine geri döndürür — klavye
   * kullanıcısı için doğru varsayılan. Kapanışın açtığı bir alan varsa (pano
   * yedeği kutusu) çağıran bu geri dönüşü `preventDefault()` ile iptal eder.
   */
  onCloseAutoFocus?: (event: Event) => void;
  /**
   * Menüden AÇILAN bir kip kapandığında odağın döneceği yer de burasıdır; kip
   * kendi tetikleyicisini render etmediği için ref'e dışarıdan ihtiyaç var.
   */
  triggerRef?: React.Ref<HTMLButtonElement>;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          ref={triggerRef}
          type="button"
          aria-label="Diğer entry işlemleri"
          className="icon-button"
        >
          <EllipsisVertical aria-hidden="true" size={17} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-[75] min-w-56 rounded-lg border bg-surface p-2"
          {...(onCloseAutoFocus ? { onCloseAutoFocus } : {})}
        >
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/**
 * Paylaşılan adres MUTLAK olmalı — göreli bir `/entry/123` panodan başka bir
 * uygulamaya yapıştırıldığında hiçbir yere gitmez.
 *
 * Temel adres tarayıcıdan alınıyor: sunucudaki `APP_URL` istemci paketine
 * girmiyor (`NEXT_PUBLIC_` önekli değil, `getEnvironment()` yalnız sunucuda
 * çalışır). Kullanıcı zaten uygulamanın kökeninden geldiği için `window.location.origin`
 * pratikte `APP_URL` ile aynı değeri verir.
 */
function absoluteEntryUrl(entryPublicId: number): string {
  const path = entryPublicUrl({ publicId: entryPublicId });
  return typeof window === "undefined" ? path : new URL(path, window.location.origin).toString();
}

/**
 * "Linki kopyala" davranışı. Pano API'si yoksa (güvensiz bağlam, eski tarayıcı)
 * ya da izin reddedilirse tek bir çıkış yolu var: linki seçili bir kutuda göster.
 * `document.execCommand("copy")` bilerek kullanılmıyor — kullanımdan kalktı.
 *
 * Hiçbir dalda sessiz kalınmıyor; başarı da başarısızlık da toast ile duyuruluyor.
 */
function useEntryLinkCopy(entryPublicId: number) {
  const [fallbackUrl, setFallbackUrl] = useState<string>();
  /**
   * Yedek kutusu açıldığında odak oraya gitmeli, ⋮ tetikleyicisine değil: seçili
   * metin ancak odaklı bir kutuda kopyalanabilir. Pano API'si hiç yokken hata
   * menü kapanmadan önce (mikro görevde) biliniyor, bu yüzden Radix'in odak
   * iadesini bu bayrakla iptal ediyoruz. İzin reddi geç gelirse iade zaten
   * olup bitmiş olur; o durumda kutunun kendi `focus()` çağrısı yeterli.
   */
  const claimFocusForFallback = useRef(false);
  const copyLink = async () => {
    const url = absoluteEntryUrl(entryPublicId);
    try {
      const clipboard = typeof navigator === "undefined" ? undefined : navigator.clipboard;
      if (!clipboard?.writeText) throw new Error("Pano API'si kullanılamıyor.");
      await clipboard.writeText(url);
      setFallbackUrl(undefined);
      toast.success("Link kopyalandı.");
    } catch {
      claimFocusForFallback.current = true;
      setFallbackUrl(url);
      toast.error("Link panoya kopyalanamadı. Aşağıdaki kutudan elle kopyalayabilirsiniz.");
    }
  };
  const handleCloseAutoFocus = (event: Event) => {
    if (!claimFocusForFallback.current) return;
    claimFocusForFallback.current = false;
    event.preventDefault();
  };
  return { copyLink, fallbackUrl, handleCloseAutoFocus };
}

/** Menüdeki "Linki kopyala" öğesi; misafirde de oturumda da aynı. */
function CopyEntryLinkItem({ onSelect }: { onSelect: () => void }) {
  return (
    <DropdownMenu.Item onSelect={() => onSelect()} className={overflowItemClass}>
      <Link2 aria-hidden="true" size={16} />
      Linki kopyala
    </DropdownMenu.Item>
  );
}

/**
 * Pano yedeği: salt okunur, içeriği seçili bir kutu. Kullanıcı yalnız kopyalama
 * kısayoluna basar.
 *
 * Odak iki kez alınıyor: menü kapanırken Radix odağı ⋮ tetikleyicisine geri
 * döndürüyor, o geri dönüş bizim ilk odağımızdan sonraya düşebilir. Bir sonraki
 * karede tekrarlamak yarışı çözüyor; ilk çağrı da kalıyor ki `requestAnimationFrame`
 * hiç çalışmasa bile metin seçili olsun.
 */
function EntryLinkFallback({ entryPublicId, url }: { entryPublicId: number; url: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = `entry-${entryPublicId}-link-kopyala`;
  useEffect(() => {
    const node = inputRef.current;
    if (!node) return;
    node.focus();
    node.select();
    const frame = requestAnimationFrame(() => {
      node.focus();
      node.select();
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <div className="w-full">
      <label htmlFor={inputId} className="block text-sm text-muted">
        Pano kullanılamadı; linki buradan kopyalayın
      </label>
      <input
        ref={inputRef}
        id={inputId}
        type="text"
        readOnly
        value={url}
        onFocus={(event) => event.currentTarget.select()}
        className="field-border mt-1 w-full rounded-lg border bg-page px-3 py-2 text-sm"
      />
    </div>
  );
}

/**
 * Skor sayacı. Görünen metin yalnız sayı; birimi ("puan") yalnız ekran okuyucu
 * duyar — aksi hâlde `aria-live` bölgesi oy değişiminde çıplak bir sayı okurdu.
 * Kart genelinde puanın TEK kaynağı burası; footer'da ayrıca "N puan" yazmıyor.
 */
function ScoreCounter({ score, live = false }: { score: number; live?: boolean }) {
  return (
    <span {...(live ? { "aria-live": "polite" as const } : {})} className={counterClass}>
      {score}
      <span className="sr-only"> puan</span>
    </span>
  );
}

/**
 * Sıfır favori gösterilmez — sıfırlar entry'yi olumsuz gösterir ve gürültü yaratır.
 * Sayaç yine de DOM'da kalır: canlı bölge, değişmeden ÖNCE var olmazsa ekran
 * okuyucular ilk favorilemeyi (0 → 1) duyurmaz. Bu yüzden gizleme `sr-only` ile
 * yapılır; `sr-only` mutlak konumlandığı için düğme şeridinde `gap` boşluğu da bırakmaz.
 */
function BookmarkCounter({ count, live = false }: { count: number; live?: boolean }) {
  const visible = count > 0;
  return (
    <span
      {...(live ? { "aria-live": "polite" as const } : {})}
      className={visible ? counterClass : "sr-only"}
    >
      {visible ? (
        <>
          {count}
          <span className="sr-only"> favori</span>
        </>
      ) : null}
    </span>
  );
}

interface SignedInEntryActionsProps {
  entryId: string;
  entryPublicId: number;
  body: string;
  initialScore: number;
  initialVote: -1 | 1 | null;
  initialBookmarked: boolean;
  canEdit: boolean;
  authorId: string;
  canReport: boolean;
  canBlockAuthor: boolean;
  initialAuthorBlocked: boolean;
  /** Sunucudan gelen favori sayısı; verilmezse sayaç hiç görünmez. */
  initialBookmarkCount?: number;
}

export type EntryActionsProps =
  | ({ readOnly?: false } & SignedInEntryActionsProps)
  | {
      readOnly: true;
      entryPublicId: number;
      initialScore: number;
      initialBookmarkCount?: number;
    };

export function EntryActions(props: EntryActionsProps) {
  if (props.readOnly) {
    return (
      <GuestEntryActions
        entryPublicId={props.entryPublicId}
        score={props.initialScore}
        bookmarkCount={props.initialBookmarkCount ?? 0}
      />
    );
  }
  return <SignedInEntryActions {...props} />;
}

/**
 * Misafir görünümü: oy ve favori düğmeleri render edilir ama `disabled` değil,
 * girişe götüren birer bağlantıdırlar. Basılı bir durum olmadığı için `aria-pressed`
 * kullanılmaz; niyet `aria-label` ile anlatılır. Oturum gerektiren yönetim işlemleri
 * (düzenle, sil, sürümler, gammaz, yazarı engelle) burada hiç render edilmez.
 *
 * ⋮ menüsü misafirde de görünür: "Linki kopyala" oturum istemiyor ve menünün tek
 * misafir öğesi o.
 */
function GuestEntryActions({
  entryPublicId,
  score,
  bookmarkCount,
}: {
  entryPublicId: number;
  score: number;
  bookmarkCount: number;
}) {
  const loginHref = `/giris?next=${encodeURIComponent(entryPublicUrl({ publicId: entryPublicId }))}`;
  const { copyLink, fallbackUrl, handleCloseAutoFocus } = useEntryLinkCopy(entryPublicId);
  return (
    <>
      <div className="flex items-center gap-2">
        <Link
          href={loginHref}
          aria-label="Artı oy vermek için giriş yapın"
          className={restingControlClass}
        >
          <ThumbsUp aria-hidden="true" size={17} />
        </Link>
        <ScoreCounter score={score} />
        <Link
          href={loginHref}
          aria-label="Eksi oy vermek için giriş yapın"
          className={restingControlClass}
        >
          <ThumbsDown aria-hidden="true" size={17} />
        </Link>
        <Link
          href={loginHref}
          aria-label="Favorilere eklemek için giriş yapın"
          className={restingControlClass}
        >
          <Bookmark aria-hidden="true" size={17} />
        </Link>
        {/* Misafirde sayı değişmez; duyurulacak bir güncelleme yok, canlı bölge de yok. */}
        <BookmarkCounter count={bookmarkCount} />
        <EntryOverflowMenu onCloseAutoFocus={handleCloseAutoFocus}>
          <CopyEntryLinkItem onSelect={() => void copyLink()} />
        </EntryOverflowMenu>
      </div>
      {fallbackUrl ? <EntryLinkFallback entryPublicId={entryPublicId} url={fallbackUrl} /> : null}
    </>
  );
}

function SignedInEntryActions({
  entryId,
  entryPublicId,
  body,
  initialScore,
  initialVote,
  initialBookmarked,
  canEdit,
  authorId,
  canReport,
  canBlockAuthor,
  initialAuthorBlocked,
  initialBookmarkCount = 0,
}: SignedInEntryActionsProps) {
  const router = useRouter();
  const [score, setScore] = useState(initialScore);
  const [vote, setVote] = useState(initialVote);
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [authorBlocked, setAuthorBlocked] = useState(initialAuthorBlocked);
  const [editing, setEditing] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [gammazOpen, setGammazOpen] = useState(false);
  const [text, setText] = useState(body);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string>();
  /**
   * Favori uçları yalnız `{ bookmarked }` döndürüyor, sayı döndürmüyor. Sayacı bu yüzden
   * sunucudan gelen sayıya kendi oyumuzun farkını ekleyerek türetiyoruz. Fark hesabı
   * (sayaç üstünde ++/-- yerine) uç noktanın idempotent olmasıyla uyumlu: aynı yönde
   * ikinci bir istek sayıyı bir kez daha kaydırmaz.
   */
  const bookmarkCount =
    initialBookmarkCount + (bookmarked === initialBookmarked ? 0 : bookmarked ? 1 : -1);
  const run = async (action: () => Promise<void>) => {
    setPending(true);
    setNotice(undefined);
    try {
      await action();
    } catch (error) {
      setNotice(error instanceof ClientApiError ? error.message : "İşlem tamamlanamadı.");
    } finally {
      setPending(false);
    }
  };
  const changeVote = (next: -1 | 1) =>
    run(async () => {
      const result =
        vote === next
          ? await apiRequest<{ value: null; score: number }>(`/api/v1/entries/${entryId}/vote`, {
              method: "DELETE",
              csrf: true,
            })
          : await apiRequest<{ value: -1 | 1; score: number }>(`/api/v1/entries/${entryId}/vote`, {
              method: "PUT",
              body: { value: next },
              csrf: true,
            });
      setVote(result.value);
      setScore(result.score);
    });
  const toggleBookmark = () =>
    run(async () => {
      const result = await apiRequest<{ bookmarked: boolean }>(
        `/api/v1/entries/${entryId}/bookmark`,
        { method: bookmarked ? "DELETE" : "PUT", csrf: true },
      );
      setBookmarked(result.bookmarked);
    });
  const saveEdit = () =>
    run(async () => {
      await apiRequest(`/api/v1/entries/${entryId}`, {
        method: "PATCH",
        body: { body: text },
        csrf: true,
      });
      setEditing(false);
      router.refresh();
    });
  const remove = () =>
    run(async () => {
      await apiRequest(`/api/v1/entries/${entryId}`, { method: "DELETE", csrf: true });
      setDeleteOpen(false);
      router.refresh();
    });
  const toggleAuthorBlock = () =>
    run(async () => {
      const result = await apiRequest<{ blocked: boolean }>(`/api/v1/me/blocks/${authorId}`, {
        method: authorBlocked ? "DELETE" : "PUT",
        csrf: true,
      });
      setAuthorBlocked(result.blocked);
      setNotice(result.blocked ? "Yazar engellendi." : "Yazarın engeli kaldırıldı.");
      router.refresh();
    });
  const { copyLink, fallbackUrl, handleCloseAutoFocus } = useEntryLinkCopy(entryPublicId);
  /*
    Gammaz kipi ⋮ menüsünden açılıyor ve kontrollü kipte `GammazButton` kendi
    `AlertDialog.Trigger`ını render etmiyor; Radix'in kapanıştaki odak iadesi o
    yüzden boşa düşüyordu (Escape / "Vazgeç" / başarılı gönderim: odak `<body>`).
    Dönülecek yeri menüyü açan kontrol biliyor, ref buradan geçiyor.
  */
  const overflowTrigger = useRef<HTMLButtonElement>(null);
  /**
   * "Linki kopyala" her zaman var, dolayısıyla ⋮ artık koşulsuz render ediliyor.
   * Ayraç yalnız yetkiye bağlı öğeler varken anlamlı.
   */
  const hasPrivilegedItems = canEdit || canReport || canBlockAuthor;
  return (
    <>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => void changeVote(1)}
          aria-label="Artı oy ver"
          aria-pressed={vote === 1}
          className={vote === 1 ? pressedPrimaryClass : restingControlClass}
        >
          <ThumbsUp aria-hidden="true" size={17} />
        </button>
        <ScoreCounter score={score} live />
        <button
          type="button"
          disabled={pending}
          onClick={() => void changeVote(-1)}
          aria-label="Eksi oy ver"
          aria-pressed={vote === -1}
          className={vote === -1 ? pressedAccentClass : restingControlClass}
        >
          <ThumbsDown aria-hidden="true" size={17} />
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => void toggleBookmark()}
          aria-label={bookmarked ? "Favorilerden çıkar" : "Favorilere ekle"}
          aria-pressed={bookmarked}
          className={bookmarked ? pressedPrimaryClass : restingControlClass}
        >
          <Bookmark aria-hidden="true" size={17} />
        </button>
        <BookmarkCounter count={bookmarkCount} live />
        <EntryOverflowMenu onCloseAutoFocus={handleCloseAutoFocus} triggerRef={overflowTrigger}>
          <CopyEntryLinkItem onSelect={() => void copyLink()} />
          {hasPrivilegedItems ? <DropdownMenu.Separator className="my-1 border-t" /> : null}
          {canEdit ? (
            <DropdownMenu.Item
              disabled={pending}
              onSelect={() => setEditing((value) => !value)}
              className={overflowItemClass}
            >
              <Pencil aria-hidden="true" size={16} />
              {editing ? "Düzenlemeyi kapat" : "Entry’yi düzenle"}
            </DropdownMenu.Item>
          ) : null}
          {canEdit ? (
            <DropdownMenu.Item asChild>
              <Link href={`/entry/${entryPublicId}/revizyonlar`} className={overflowItemClass}>
                <History aria-hidden="true" size={16} />
                Sürümler
              </Link>
            </DropdownMenu.Item>
          ) : null}
          {canReport ? (
            <DropdownMenu.Item onSelect={() => setGammazOpen(true)} className={overflowItemClass}>
              <Flag aria-hidden="true" size={16} />
              Entry’yi gammazla
            </DropdownMenu.Item>
          ) : null}
          {canBlockAuthor ? (
            <DropdownMenu.Item
              disabled={pending}
              onSelect={() => void toggleAuthorBlock()}
              className={overflowItemClass}
            >
              <UserX aria-hidden="true" size={16} />
              {authorBlocked ? "Yazarın engelini kaldır" : "Yazarı engelle"}
            </DropdownMenu.Item>
          ) : null}
          {canEdit ? (
            <>
              <DropdownMenu.Separator className="my-1 border-t" />
              <DropdownMenu.Item
                disabled={pending}
                onSelect={() => setDeleteOpen(true)}
                className={`${overflowItemClass} text-destructive`}
              >
                <Trash2 aria-hidden="true" size={16} />
                Entry’yi sil
              </DropdownMenu.Item>
            </>
          ) : null}
        </EntryOverflowMenu>
      </div>
      {fallbackUrl ? <EntryLinkFallback entryPublicId={entryPublicId} url={fallbackUrl} /> : null}
      {/*
        Gammaz kipi menüden açılıyor: tetikleyici düğme yok, açıklık dışarıdan
        kontrol ediliyor. Kip kapalıyken bileşen hiç DOM üretmediği için sarmalayıcı
        `:empty` kalır ve gizlenir; yalnız sonuç bildirimi geldiğinde satır açılır.
      */}
      {canReport ? (
        <div className="w-full empty:hidden">
          <GammazButton
            targetType="ENTRY"
            targetId={entryId}
            open={gammazOpen}
            onOpenChange={setGammazOpen}
            returnFocusRef={overflowTrigger}
          />
        </div>
      ) : null}
      {canEdit ? (
        <AlertDialog.Root open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialog.Portal>
            <AlertDialog.Overlay className="fixed inset-0 z-[80] bg-black/60" />
            <AlertDialog.Content className="fixed left-1/2 top-1/2 z-[81] w-[min(92vw,480px)] -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-surface p-6">
              <AlertDialog.Title className="title-section">Entry silinsin mi?</AlertDialog.Title>
              <AlertDialog.Description className="mt-3 text-muted">
                Entry herkese açık görünümden kaldırılıp çöp kutunuza taşınır. Orada düzeltip
                canlandırma isteyebilirsiniz.
              </AlertDialog.Description>
              <div className="mt-6 flex justify-end gap-3">
                <AlertDialog.Cancel asChild>
                  <button type="button" className="button-secondary">
                    Vazgeç
                  </button>
                </AlertDialog.Cancel>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => void remove()}
                  className="button-primary bg-destructive text-on-destructive"
                >
                  {pending ? "Siliniyor…" : "Entry’yi sil"}
                </button>
              </div>
            </AlertDialog.Content>
          </AlertDialog.Portal>
        </AlertDialog.Root>
      ) : null}
      {editing ? (
        <div className="w-full">
          <FormTextarea
            id={`edit-${entryId}`}
            label="Entry metni"
            toolbar={(api) => <EntryReferenceToolbar api={api} textareaId={`edit-${entryId}`} />}
            value={text}
            onChange={(event) => setText(event.target.value)}
            minLength={10}
            maxLength={ENTRY_BODY_MAX_LENGTH}
            disabled={pending}
          />
          <div className="mt-3 flex gap-3">
            <button
              type="button"
              className="button-primary"
              disabled={pending || text.trim().length < 10}
              onClick={() => void saveEdit()}
            >
              Kaydet
            </button>
            <button type="button" className="button-secondary" onClick={() => setEditing(false)}>
              Vazgeç
            </button>
          </div>
        </div>
      ) : null}
      {notice ? (
        <p role="status" className="w-full text-sm text-muted">
          {notice}
        </p>
      ) : null}
    </>
  );
}
