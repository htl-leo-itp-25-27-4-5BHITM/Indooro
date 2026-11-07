import { ListChecks, Minus, Plus, Trash2, X } from "lucide-react";
import type { Product } from "../../domain/types";
import type { ListItem } from "./useStoreDemo";

export interface ShoppingListProps {
  items: ListItem[];
  productById: (id: string) => Product | undefined;
  shelfText: (product: Product) => string;
  visitNumber: (productId: string) => number;
  /** True when a planned route defines the numbers (otherwise they are plain list positions). */
  routePlanned: boolean;
  selectedProductId: string | null;
  onSelect: (productId: string) => void;
  onRemove: (productId: string) => void;
  onQty: (productId: string, qty: number) => void;
  onClear: () => void;
  onLoadExample: () => void;
  onGoSearch: () => void;
}

export function ShoppingList({
  items,
  productById,
  shelfText,
  visitNumber,
  routePlanned,
  selectedProductId,
  onSelect,
  onRemove,
  onQty,
  onClear,
  onLoadExample,
  onGoSearch
}: ShoppingListProps) {
  const rows = items
    .map((item) => ({ item, product: productById(item.productId), n: visitNumber(item.productId) }))
    .filter((r): r is { item: ListItem; product: Product; n: number } => Boolean(r.product))
    .sort((a, b) => a.n - b.n);
  const total = items.reduce((n, i) => n + i.qty, 0);

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center rounded-2xl border border-dashed border-white/12 px-5 py-9 text-center" data-testid="list-empty">
        <span className="grid size-12 place-items-center rounded-2xl bg-white/5 text-mint ring-1 ring-white/10">
          <ListChecks className="size-6" aria-hidden />
        </span>
        <p className="mt-4 text-[15px] font-semibold text-white">Ihre Einkaufsliste ist leer</p>
        <p className="mt-1 max-w-[18rem] text-xs leading-relaxed text-ink-200">
          Fügen Sie Produkte aus der Suche hinzu. Indooro ordnet sie automatisch zu einem kurzen Weg durch den Markt.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            data-testid="load-example"
            onClick={onLoadExample}
            className="h-10 rounded-full bg-mint px-4 text-[13px] font-semibold text-ink-950 transition hover:bg-mint-soft"
          >
            Beispielliste laden
          </button>
          <button
            type="button"
            onClick={onGoSearch}
            className="h-10 rounded-full border border-white/14 px-4 text-[13px] font-semibold text-ink-100 transition hover:bg-white/6"
          >
            Produkt suchen
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-col">
      <div className="mb-3 flex items-center justify-between gap-2 px-1">
        <p className="text-sm text-ink-200" data-testid="list-count" aria-live="polite">
          <span className="font-semibold text-white">{rows.length}</span> {rows.length === 1 ? "Produkt" : "Produkte"}
          {total !== rows.length ? <span className="text-ink-300"> · {total} Stück</span> : null}
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            data-testid="load-example"
            onClick={onLoadExample}
            className="h-9 rounded-full px-3 text-xs font-semibold text-ink-200 transition hover:bg-white/6 hover:text-white"
          >
            Beispielliste
          </button>
          <button
            type="button"
            data-testid="clear-list"
            onClick={onClear}
            className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-ink-200 transition hover:bg-danger/10 hover:text-danger"
          >
            <Trash2 className="size-3.5" aria-hidden /> Leeren
          </button>
        </div>
      </div>
      <p className="mb-3 px-1 text-[11px] leading-relaxed text-ink-300">
        {routePlanned ? "Die Nummern zeigen die Reihenfolge der geplanten Route." : "Die Nummern zeigen die Reihenfolge der Liste."}
      </p>
      <ul className="flex flex-col gap-1.5">
        {rows.map(({ item, product, n }) => {
          const isSel = product.id === selectedProductId;
          return (
            <li
              key={product.id}
              data-testid="list-item"
              data-product-id={product.id}
              className={`rounded-2xl border px-3 py-2.5 transition-colors ${
                isSel ? "border-amber/50 bg-amber/10" : "border-transparent bg-white/[0.04] hover:bg-white/[0.07]"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span
                  aria-label={`Station ${n}`}
                  className="grid size-7 shrink-0 place-items-center rounded-full bg-ink-950 text-xs font-bold tabular-nums text-mint ring-1 ring-mint/50"
                >
                  {n}
                </span>
                <button type="button" onClick={() => onSelect(product.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-label={`${product.name} auf der Karte zeigen`}>
                  <span aria-hidden className="text-xl">
                    {product.emoji}
                  </span>
                  <span className="truncate text-[14px] font-semibold text-white">{product.name}</span>
                </button>
                <button
                  type="button"
                  aria-label={`${product.name} entfernen`}
                  data-testid="remove-item"
                  onClick={() => onRemove(product.id)}
                  className="-mr-1.5 grid size-10 shrink-0 place-items-center rounded-full text-ink-300 transition hover:bg-danger/10 hover:text-danger"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </div>
              <div className="mt-0.5 flex items-center justify-between gap-3 pl-[2.375rem]">
                <span className="min-w-0 text-xs leading-snug text-ink-300">{shelfText(product)}</span>
                <div className="flex shrink-0 items-center rounded-full bg-ink-950/70 ring-1 ring-white/10" role="group" aria-label={`Menge ${product.name}`}>
                  <button
                    type="button"
                    aria-label="Menge verringern"
                    data-testid="qty-minus"
                    onClick={() => onQty(product.id, item.qty - 1)}
                    className="grid size-10 place-items-center rounded-full text-ink-200 transition hover:bg-white/8 hover:text-white"
                  >
                    <Minus className="size-3.5" aria-hidden />
                  </button>
                  <span className="w-5 text-center text-[13px] font-semibold tabular-nums text-white" data-testid="qty-value">
                    {item.qty}
                  </span>
                  <button
                    type="button"
                    aria-label="Menge erhöhen"
                    data-testid="qty-plus"
                    onClick={() => onQty(product.id, item.qty + 1)}
                    className="grid size-10 place-items-center rounded-full text-ink-200 transition hover:bg-white/8 hover:text-white"
                  >
                    <Plus className="size-3.5" aria-hidden />
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
