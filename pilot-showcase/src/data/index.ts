import type { Market } from "../domain/types";
import { donauparkMarket } from "./markets/donaupark";
import { poestlingbergMarket } from "./markets/poestlingberg";

export const MARKETS: readonly Market[] = [donauparkMarket, poestlingbergMarket];
export const DEFAULT_MARKET: Market = donauparkMarket;

export { donauparkMarket, poestlingbergMarket };
export { CATEGORIES } from "./categories";
export * from "./locate";
export * from "./search";

export function getMarketByCode(code: string | null | undefined): Market | undefined {
  if (!code) return undefined;
  const wanted = code.trim().toUpperCase();
  return MARKETS.find((m) => m.code === wanted);
}
