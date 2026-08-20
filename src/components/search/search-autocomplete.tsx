"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * `/api/v1/search/suggest` sözleşmesi (görev 26'da sabitlendi). Modül tipleri
 * yerine yerel arayüz: istemci yalnız okuduğu alanlara bağlı kalıyor.
 */
interface SuggestResponse {
  topics: { title: string; url: string }[];
  users: { username: string; url: string }[];
}

interface Option {
  id: string;
  label: string;
  url: string;
}

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 200;

function characterLength(value: string): number {
  return [...value].length;
}

/**
 * Header arama formu ve WAI-ARIA 1.2 combobox'ı.
 *
 * Form, JavaScript olmadan da çalışan `<form action="/ara">`'dır; öneri listesi
 * yalnız bir iyileştirme katmanıdır. Bileşen hem masaüstündeki satır içi formda
 * hem `<640px` açılır panelinde aynı örnekten kullanılır.
 *
 * Focus her zaman input'ta kalır; listedeki sanal focus `aria-activedescendant`
 * ile yönetilir.
 */
export function SearchAutocomplete({
  inputId,
  className,
  inputRef,
}: {
  inputId: string;
  className: string;
  inputRef?: React.Ref<HTMLInputElement>;
}) {
  const router = useRouter();
  // Combobox anlambilimi yalnız hidrasyondan sonra açılır: JavaScript çalışmayan
  // sayfada input, hiç açılmayacak bir listeyi işaret eden combobox olarak değil
  // sıradan bir arama alanı olarak duyurulur.
  const [enhanced, setEnhanced] = useState(false);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<SuggestResponse | null>(null);
  const [suggestedFor, setSuggestedFor] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputElement = useRef<HTMLInputElement | null>(null);
  const listElement = useRef<HTMLDivElement | null>(null);

  const listboxId = `${inputId}-oneriler`;

  useEffect(() => {
    setEnhanced(true);
  }, []);

  useEffect(() => {
    const term = query.trim();
    if (characterLength(term) < MIN_QUERY_LENGTH) {
      // 2 karakter altı: istek yok, açık liste varsa kapanır.
      setSuggestions(null);
      setSuggestedFor("");
      setOpen(false);
      setActiveIndex(-1);
      return;
    }
    // `site-shell.tsx`'teki indeks yükleme deseni: her yeni istekten önce
    // öncekini iptal et, `AbortError`'ı sessizce yut.
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetch(`/api/v1/search/suggest?q=${encodeURIComponent(term)}`, {
        signal: controller.signal,
      })
        .then(async (response) => {
          // 429 dâhil her başarısız yanıt aynı yola gider: öneri katmanı
          // sessizce kapanır, kullanıcıya hata basılmaz, form submit'i çalışır.
          if (!response.ok) throw new Error("SEARCH_SUGGEST_FAILED");
          return (await response.json()) as SuggestResponse;
        })
        .then((response) => {
          setSuggestions({ topics: response.topics ?? [], users: response.users ?? [] });
          setSuggestedFor(term);
          setActiveIndex(-1);
          // Sonuç gelene kadar focus başka yere gitmişse liste açılmaz.
          setOpen(inputElement.current === document.activeElement);
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          setSuggestions(null);
          setSuggestedFor("");
          setOpen(false);
          setActiveIndex(-1);
        });
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const topics = suggestions?.topics ?? [];
  const users = suggestions?.users ?? [];
  const noMatch = suggestions !== null && topics.length === 0 && users.length === 0;
  const topicOptions: Option[] = topics.map((topic, index) => ({
    id: `${inputId}-baslik-${index}`,
    label: topic.title,
    url: topic.url,
  }));
  const userOptions: Option[] = users.map((user, index) => ({
    id: `${inputId}-yazar-${index}`,
    label: user.username,
    url: user.url,
  }));
  // Eşleşme yoksa keşif çıkmaza girmesin: aramadan doğrudan başlık açmaya geçiş.
  const createOption: Option | null =
    noMatch && suggestedFor.length > 0
      ? {
          id: `${inputId}-baslik-ac`,
          label: `«${suggestedFor}» başlığını aç`,
          url: `/baslik/ac?title=${encodeURIComponent(suggestedFor)}`,
        }
      : null;
  const options: Option[] = [
    ...topicOptions,
    ...userOptions,
    ...(createOption ? [createOption] : []),
  ];
  const expanded = open && options.length > 0;
  const activeOption = expanded && activeIndex >= 0 ? options[activeIndex] : undefined;

  useEffect(() => {
    if (!activeOption) return;
    const option = document.getElementById(activeOption.id);
    // jsdom `scrollIntoView` tanımlamaz; öneri gezinmesi bu yüzden isteğe bağlı çağrılır.
    option?.scrollIntoView?.({ block: "nearest" });
  }, [activeOption]);

  const close = () => {
    setOpen(false);
    setActiveIndex(-1);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (options.length === 0) return;
      event.preventDefault();
      setOpen(true);
      // -1 "hiçbiri" konumudur; döngü input'a geri uğrar.
      setActiveIndex((current) =>
        event.key === "ArrowDown"
          ? current + 1 > options.length - 1
            ? -1
            : current + 1
          : current - 1 < -1
            ? options.length - 1
            : current - 1,
      );
      return;
    }
    if (event.key === "Escape") {
      // Liste kapalıyken Esc bize ait değil: mobil arama panelini kapatan
      // header dinleyicisine ulaşmalı.
      if (!expanded) return;
      event.preventDefault();
      event.stopPropagation();
      // Header dinleyicisi de `document` üzerinde olduğu için sentetik olayı
      // durdurmak yetmez; aynı düğümdeki sonraki dinleyiciler de susturulur.
      event.nativeEvent.stopImmediatePropagation();
      close();
      return;
    }
    if (event.key === "Enter") {
      // Sanal focus bir öneride değilse form normal şekilde `/ara`'ya gider.
      if (!activeOption) return;
      event.preventDefault();
      close();
      router.push(activeOption.url);
    }
  };

  const renderOption = (option: Option, index: number) => (
    <Link
      key={option.id}
      id={option.id}
      href={option.url}
      role="option"
      aria-selected={index === activeIndex}
      tabIndex={-1}
      onClick={close}
      className={`block truncate px-3 py-2 text-sm ${
        index === activeIndex ? "bg-primary text-on-primary" : "text-ink hover:bg-page"
      }`}
    >
      {option.label}
    </Link>
  );

  return (
    <form
      action="/ara"
      role="search"
      className={className}
      onSubmit={close}
      // Öneriye fare ile basıldığında focus input'tan çıkmasın; aksi hâlde
      // blur listeyi tıklama tamamlanmadan kaldırır.
      onMouseDown={(event) => {
        if (listElement.current?.contains(event.target as Node)) event.preventDefault();
      }}
    >
      <label htmlFor={inputId} className="sr-only">
        Sözlükte ara
      </label>
      <div className="relative">
        <Search
          aria-hidden="true"
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          size={17}
        />
        <input
          ref={(node) => {
            inputElement.current = node;
            if (typeof inputRef === "function") inputRef(node);
            else if (inputRef) inputRef.current = node;
          }}
          id={inputId}
          name="q"
          type="search"
          minLength={2}
          maxLength={100}
          autoComplete="off"
          placeholder="Başlık, entry veya yazar ara"
          {...(enhanced
            ? ({
                role: "combobox",
                "aria-expanded": expanded,
                "aria-controls": listboxId,
                "aria-autocomplete": "list",
              } as const)
            : {})}
          {...(activeOption ? { "aria-activedescendant": activeOption.id } : {})}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => {
            if (options.length > 0) setOpen(true);
          }}
          onBlur={close}
          className="min-h-10 w-full rounded-xl border field-border bg-page pl-10 pr-4 text-sm placeholder:text-muted"
        />
        {enhanced ? (
          <div
            ref={listElement}
            id={listboxId}
            role="listbox"
            aria-label="Arama önerileri"
            hidden={!expanded}
            className="absolute left-0 right-0 top-full z-50 mt-1 max-h-80 overflow-y-auto rounded-xl border bg-surface py-1 shadow-2xl"
          >
            {topicOptions.length > 0 ? (
              <div role="group" aria-label="Başlıklar">
                <p aria-hidden="true" className="eyebrow px-3 py-1 text-muted">
                  Başlıklar
                </p>
                {topicOptions.map((option, index) => renderOption(option, index))}
              </div>
            ) : null}
            {userOptions.length > 0 ? (
              <div role="group" aria-label="Yazarlar">
                <p aria-hidden="true" className="eyebrow px-3 py-1 text-muted">
                  Yazarlar
                </p>
                {userOptions.map((option, index) =>
                  renderOption(option, topicOptions.length + index),
                )}
              </div>
            ) : null}
            {createOption ? renderOption(createOption, options.length - 1) : null}
          </div>
        ) : null}
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {expanded
          ? createOption
            ? "Eşleşen başlık veya yazar yok; yeni başlık açabilirsiniz."
            : `${topicOptions.length} başlık, ${userOptions.length} yazar önerisi.`
          : ""}
      </p>
    </form>
  );
}
