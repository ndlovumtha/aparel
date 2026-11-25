import { ALL_GARMENT_SIZES, GarmentSize, Product } from '../types/store';

export const DEFAULT_STOCK_FLOOR = 10;
export const DEFAULT_STOCK_CEILING = 80;

export function getEffectiveStockMap(product: Product): Partial<Record<GarmentSize, number>> {
  const sizes: GarmentSize[] =
    product.sizes && product.sizes.length > 0 ? product.sizes : ['M'];

  if (product.stockBySize && Object.keys(product.stockBySize).length > 0) {
    const result: Partial<Record<GarmentSize, number>> = {};
    for (const sz of sizes) {
      result[sz] = Math.max(0, Math.floor(Number(product.stockBySize[sz] ?? 0)));
    }
    return result;
  }

  // Deterministic distribution fallback for legacy products without stockBySize
  const total = Math.max(0, Math.floor(Number(product.inventoryQuantity ?? 0)));
  const base = Math.floor(total / sizes.length);
  let remainder = total % sizes.length;
  const result: Partial<Record<GarmentSize, number>> = {};
  for (const sz of sizes) {
    const extra = remainder > 0 ? 1 : 0;
    if (remainder > 0) remainder -= 1;
    result[sz] = base + extra;
  }
  return result;
}

export function getProductSizeStock(product: Product, size: string): number {
  const castSize = size as GarmentSize;
  if (!ALL_GARMENT_SIZES.includes(castSize)) return 0;
  const map = getEffectiveStockMap(product);
  return Math.max(0, Math.floor(Number(map[castSize] ?? 0)));
}

export function getTotalFromStockMap(
  sizes: GarmentSize[],
  stockBySize: Partial<Record<GarmentSize, number>>
): number {
  return sizes.reduce(
    (sum, sz) => sum + Math.max(0, Math.floor(Number(stockBySize[sz] ?? 0))),
    0
  );
}

export function getProductFloor(product: Product): number {
  return typeof product.stockFloor === 'number' && product.stockFloor >= 0
    ? Math.floor(product.stockFloor)
    : DEFAULT_STOCK_FLOOR;
}

export function getProductCeiling(product: Product): number {
  const floor = getProductFloor(product);
  const raw =
    typeof product.stockCeiling === 'number' && product.stockCeiling >= 1
      ? Math.floor(product.stockCeiling)
      : DEFAULT_STOCK_CEILING;
  return Math.max(floor, raw);
}

export type StockHealthState = 'OUT_OF_STOCK' | 'BELOW_FLOOR' | 'ABOVE_CEILING' | 'OPTIMAL';

export function evaluateProductStockHealth(product: Product): {
  state: StockHealthState;
  totalStock: number;
  floor: number;
  ceiling: number;
  lowSizes: GarmentSize[];
  emptySizes: GarmentSize[];
} {
  const stockMap = getEffectiveStockMap(product);
  const totalStock = getTotalFromStockMap(product.sizes, stockMap);
  const floor = getProductFloor(product);
  const ceiling = getProductCeiling(product);

  const emptySizes = product.sizes.filter((sz) => (stockMap[sz] ?? 0) === 0);
  const lowSizes = product.sizes.filter((sz) => {
    const qty = stockMap[sz] ?? 0;
    return qty > 0 && qty <= Math.max(1, Math.floor(floor / Math.max(1, product.sizes.length)));
  });

  let state: StockHealthState = 'OPTIMAL';
  if (totalStock === 0) {
    state = 'OUT_OF_STOCK';
  } else if (totalStock <= floor) {
    state = 'BELOW_FLOOR';
  } else if (totalStock >= ceiling) {
    state = 'ABOVE_CEILING';
  }

  return { state, totalStock, floor, ceiling, lowSizes, emptySizes };
}
