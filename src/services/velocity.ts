/**
 * Velocity service — computes sell-through rate and days-of-cover for each
 * product from the sales log. Pure functions + a memoized wrapper keyed on
 * (products.length, salesRecords.length). Cache invalidates whenever either
 * collection changes.
 */
import { Product } from '../core/schema';
import { SalesRecord, SalesService } from './sales';

export interface ProductVelocity {
    sku: string;
    sold7d: number;
    sold30d: number;
    sold90d: number;
    velocity: number;      // units/day over 30d window
    daysOfCover: number;   // Infinity when velocity==0
    trend: number;         // Δ velocity: (sold7d/7) / (sold30d/30) - 1
    lastSoldDate?: string; // ISO
    onHand: number;
    reorderSignal: 'critical' | 'warning' | 'ok' | 'dead';
}

const DAY = 24 * 60 * 60 * 1000;
function daysAgo(n: number): number { return Date.now() - n * DAY; }

function stockOf(p: Product): number {
    const obs = (p.observations?.stock?.[0]?.v as number);
    if (typeof obs === 'number' && obs >= 0) return obs;
    const comm = (p.commercial as any)?.stockQty;
    return typeof comm === 'number' ? comm : 0;
}

function skuOf(p: Product): string {
    return (p.identity.sku || p.identity.id || '').toString().trim().toLowerCase();
}

export function computeVelocity(products: Product[], sales: SalesRecord[]): Map<string, ProductVelocity> {
    // Index sales by normalized SKU for O(1) lookup per product
    const bySku = new Map<string, SalesRecord[]>();
    for (const s of sales) {
        const k = (s.sku || '').toLowerCase();
        if (!k) continue;
        const list = bySku.get(k);
        if (list) list.push(s); else bySku.set(k, [s]);
    }

    const t7  = daysAgo(7);
    const t30 = daysAgo(30);
    const t90 = daysAgo(90);

    const out = new Map<string, ProductVelocity>();
    for (const p of products) {
        const sku = skuOf(p);
        const onHand = stockOf(p);
        const records = bySku.get(sku) || [];

        let s7 = 0, s30 = 0, s90 = 0;
        let lastSold: string | undefined;
        let lastTs = 0;
        for (const r of records) {
            const ts = Date.parse(r.date);
            if (!Number.isFinite(ts)) continue;
            if (ts >= t90) s90 += r.qty;
            if (ts >= t30) s30 += r.qty;
            if (ts >= t7)  s7  += r.qty;
            if (ts > lastTs) { lastTs = ts; lastSold = r.date; }
        }

        const velocity = s30 / 30;
        const daysOfCover = velocity > 0 ? onHand / velocity : Infinity;
        const v7  = s7 / 7;
        const v30 = s30 / 30;
        const trend = v30 > 0 ? (v7 / v30) - 1 : 0;

        let reorderSignal: ProductVelocity['reorderSignal'] = 'ok';
        if (s90 === 0 && onHand > 10) reorderSignal = 'dead';
        else if (onHand === 0 && velocity > 0) reorderSignal = 'critical';
        else if (daysOfCover < 7 && velocity > 0) reorderSignal = 'critical';
        else if (daysOfCover < 21 && velocity > 0) reorderSignal = 'warning';

        out.set(p.identity.id, {
            sku, onHand,
            sold7d: s7, sold30d: s30, sold90d: s90,
            velocity, daysOfCover, trend,
            lastSoldDate: lastSold,
            reorderSignal,
        });
    }
    return out;
}

// ── Memoized API keyed on collection sizes + explicit force invalidation ──────────────
let _cacheKey = '';
let _forceKey = 0;
let _cache: Map<string, ProductVelocity> = new Map();

export function getVelocityMap(products: Product[]): Map<string, ProductVelocity> {
    const sales = SalesService.getCached();
    const key = `${products.length}:${sales.length}:${_forceKey}`;
    if (key === _cacheKey) return _cache;
    _cache = computeVelocity(products, sales);
    _cacheKey = key;
    return _cache;
}

export function invalidateVelocityCache() { _cacheKey = ''; _forceKey++; }

// Invalidate whenever sales change
SalesService.subscribe(() => invalidateVelocityCache());

// ── Reorder queue: products sorted by urgency ───────────────────────────────
export interface ReorderItem {
    product: Product;
    velocity: ProductVelocity;
}

export function getReorderQueue(products: Product[], limit = 10): ReorderItem[] {
    const map = getVelocityMap(products);
    const items: ReorderItem[] = [];
    for (const p of products) {
        const v = map.get(p.identity.id);
        if (!v) continue;
        if (v.reorderSignal === 'critical' || v.reorderSignal === 'warning') {
            items.push({ product: p, velocity: v });
        }
    }
    items.sort((a, b) => a.velocity.daysOfCover - b.velocity.daysOfCover);
    return items.slice(0, limit);
}

export function getDeadStock(products: Product[], limit = 10): ReorderItem[] {
    const map = getVelocityMap(products);
    const items: ReorderItem[] = [];
    for (const p of products) {
        const v = map.get(p.identity.id);
        if (v?.reorderSignal === 'dead') items.push({ product: p, velocity: v });
    }
    items.sort((a, b) => b.velocity.onHand - a.velocity.onHand);
    return items.slice(0, limit);
}
