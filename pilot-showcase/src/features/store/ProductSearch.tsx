import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { Check, Plus, Search, X } from "lucide-react";
import type { Market, Product } from "../../domain/types";
import { SEARCH_SUGGESTIONS, searchProducts } from "../../data";

export interface ProductSearchProps {
  market: Market;
  selectedProductId: string | null;
  onSelect: (productId: string | null) => void;
  has: (productId: string) => boolean;
  onAdd: (productId: string) => void;
  onRemove: (productId: string) => void;
  shelfText: (product: Product) => string;
  /** Products of the shelf clicked on the map (shown while the query is empty). */
  shelfProducts?: { title: string; products: Product[] } | null;
  onClearShelf?: () => void;
}

const eur = new Intl.NumberFormat("de-AT", { style: "currency", currency: "EUR" });

export function ProductSearch({ market, selectedProductId, onSelect, has, onAdd, onRemove, shelfText, shelfProducts, onClearShelf }: ProductSearchProps) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listId = useId();

  // a different market has a different assortment
  useEffect(() => {
    setQuery("");
    setActive(0);
  }, [market.code]);

  const results = useMemo(() => searchProducts(market, query, 8), [market, query]);
  const suggestions = useMemo(
    () => SEARCH_SUGGESTIONS.filter((s) => searchProducts(market, s, 1).length > 0).slice(0, 5),
    [market]
  );
  const trimmed = query.trim();
  const showShelf = !trimmed && shelfProducts && shelfProducts.products.length > 0;
  const rows: Product[] = trimmed ? results.map((r) => r.product) : showShelf ? shelfProducts!.products : [];
  const safeActive = Math.min(active, Math.max(0, rows.length - 1));

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!rows.length) return;
      const next = (safeActive + (e.key === "ArrowDown" ? 1 : -1) + rows.length) % rows.length;
      setActive(next);
      onSelect(rows[next].id);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const p = rows[safeActive];
      if (!p) return;
      if (e.shiftKey) {
        has(p.id) ? onRemove(p.id) : onAdd(p.id);
      }
      onSelect(p.id);
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (query) {
        setQuery("");
        setActive(0);
      } else {
        onSelect(null);
        onClearShelf?.();
        inputRef.current?.blur();
      }
    }
  };

  const pick = (term: string) => {
    setQuery(term);
    setActive(0);
    const first = searchProducts(market, term, 1)[0];
    if (first) onSelect(first.product.id);
    inputRef.current?.focus();
  };

  return (
    <div className="flex min-h-0 flex-col">
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-ink-300" />
        <input
          ref={inputRef}
          data-testid="search-input"
          type="search"
          role="combobox"
          aria-expanded={rows.length > 0}
          aria-controls={listId}
          aria-activedescendant={rows[safeActive] ? `${listId}-${rows[safeActive].id}` : undefined}
          aria-label={`Produkt suchen in ${market.name}`}
          autoComplete="off"
          spellCheck={false}
          value={query}
          placeholder="Produkt suchen, z. B. Paradeiser"
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          className="h-12 w-full rounded-2xl border border-white/10 bg-ink-950/70 pl-11 pr-11 text-[15px] text-white placeholder:text-ink-300 transition focus:border-mint/50 focus:bg-ink-950 focus:outline-none focus:ring-4 focus:ring-mint/10 [&::-webkit-search-cancel-button]:hidden"
        />
        {query && (
          <button
            type="button"
            aria-label="Suche leeren"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            className="absolute right-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full text-ink-300 transition hover:bg-white/8 hover:text-white"
          >
            <X className="size-4" aria-hidden />
          </button>
        )}
      </div>

      <div className="mt-3 min-h-0 flex-1" aria-live="polite">
        {rows.length > 0 ? (
          <>
            {showShelf && (
              <div className="mb-2 flex items-center justify-between px-1 text-xs text-ink-200">
                <span className="font-semibold text-white">{shelfProducts!.title}</span>
                <button type="button" onClick={onClearShelf} className="rounded px-1.5 py-1 text-ink-300 hover:text-white">
                  Schließen
                </button>
              </div>
            )}
            <ul id={listId} role="listbox" aria-label="Suchergebnisse" className="flex flex-col gap-1.5">
              {rows.map((p, i) => {
                const onList = has(p.id);
                const isActive = i === safeActive;
                const isSelected = p.id === selectedProductId;
                return (
                  <li
                    key={p.id}
                    id={`${listId}-${p.id}`}
                    role="option"
                    aria-selected={isActive}
                    data-testid="search-result"
                    data-product-id={p.id}
                    onMouseEnter={() => setActive(i)}
                    className={`group flex items-center gap-3 rounded-2xl border px-3 py-2.5 transition-colors ${
                      isSelected ? "border-amber/50 bg-amber/10" : isActive ? "border-white/12 bg-white/6" : "border-transparent bg-white/[0.03] hover:bg-white/6"
                    }`}
                  >
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => onSelect(p.id)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      aria-label={`${p.name} auf der Karte zeigen`}
                    >
                      <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl bg-ink-950/70 text-xl ring-1 ring-white/8">
                        {p.emoji}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                          <span className="truncate text-[14px] font-semibold text-white">{p.name}</span>
                          <span className="shrink-0 text-xs tabular-nums text-ink-200">{eur.format(p.price)}</span>
                        </span>
                        <span className="block truncate text-xs text-ink-300">
                          {[p.brand, p.unit].filter(Boolean).join(" · ")}
                        </span>
                        <span className="mt-0.5 block text-xs font-medium leading-snug text-mint/90">{shelfText(p)}</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      tabIndex={-1}
                      data-testid="add-button"
                      aria-pressed={onList}
                      aria-label={onList ? `${p.name} von der Liste entfernen` : `${p.name} zur Liste hinzufügen`}
                      onClick={() => (onList ? onRemove(p.id) : onAdd(p.id))}
                      className={`inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold transition ${
                        onList ? "bg-mint/15 text-mint ring-1 ring-mint/30 hover:bg-mint/20" : "bg-mint text-ink-950 hover:bg-mint-soft"
                      }`}
                    >
                      {onList ? <Check className="size-4" aria-hidden /> : <Plus className="size-4" aria-hidden />}
                      {onList ? "Auf Liste" : "Liste"}
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 hidden px-1 text-[11px] leading-relaxed text-ink-300 sm:block">
              Pfeiltasten wählen · Enter zeigt das Produkt auf dem Plan · Umschalt + Enter setzt es auf die Liste · Esc leert die Suche
            </p>
          </>
        ) : trimmed ? (
          <div data-testid="search-empty" className="rounded-2xl border border-dashed border-white/12 px-4 py-6 text-center">
            <p className="text-sm font-semibold text-white">Keine Treffer in „{market.name}“</p>
            <p className="mt-1 text-xs text-ink-200">Das Sortiment ist je Markt getrennt – manche Produkte gibt es nur in einem der beiden Demomärkte.</p>
            <Suggestions items={suggestions} onPick={pick} className="mt-4 justify-center" />
          </div>
        ) : (
          <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-5">
            <p className="text-sm font-semibold text-white">Was suchen Sie?</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-200">
              Geben Sie ein Produkt ein oder tippen Sie auf ein Regal im Plan. Die Suche kennt österreichische Begriffe und verzeiht Tippfehler.
            </p>
            <Suggestions items={suggestions} onPick={pick} className="mt-4" />
          </div>
        )}
      </div>
    </div>
  );
}

function Suggestions({ items, onPick, className = "" }: { items: string[]; onPick: (term: string) => void; className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <span className="text-xs text-ink-300">Probieren Sie:</span>
      {items.map((s) => (
        <button
          key={s}
          type="button"
          data-testid="search-suggestion"
          onClick={() => onPick(s)}
          className="h-8 rounded-full border border-white/12 bg-white/5 px-3 text-xs font-medium text-ink-100 transition hover:border-mint/40 hover:bg-mint/10 hover:text-mint"
        >
          {s}
        </button>
      ))}
    </div>
  );
}
