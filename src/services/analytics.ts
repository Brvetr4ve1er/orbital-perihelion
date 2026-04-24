/**
 * Analytics — derives BI metrics from the sales log:
 *   • ABC/Pareto classification (A = top 80% of revenue, B = next 15%, C = rest)
 *   • 30-day revenue, units, AOV, order count
 *   • Per-product daily series for sparklines
 *
 * All functions are pure and memoized on (products.length, sales.length).
 */
import { Product } from '../core/schema';
import { SalesRecord, SalesService } from './sales';
import { ProductAdapter } from '../core/product-adapter';

export type ABCTier = 'A' | 'B' | 'C' | 'none';

export interface ProductAnalytics {
    productId: string;
    sku: string;
    revenue30d: number;
    units30d: number;
    revenueShare: number;    // fraction of total revenue [0..1]
    cumulativeShare: number; // running total share after Pareto sort
    tier: ABCTier;
    daily30: number[];       // units per day, oldest → newest (length 30)
}

export interface SalesKPIs {
    revenue30d: number;
    units30d: number;
    orders30d: number;
    aov: number;                // average order value
    revenue7d: number;
    topSeller?: { name: string; units: number };
    salesCount: number;
    trendPct: number;           // (v7 / (v30-v7/23)) - 1 roughly; see impl
}

const DAY = 24 * 60 * 60 * 1000;
const TODAY_END = () => {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d.getTime();
};

function priceOf(p: Product): number {
    const lp = ProductAdapter.toLegacy(p);
    return lp.commercial.retailPrice || p.commercial?.priceRange?.typical || 0;
}

function skuOf(p: Product): string {
    return (p.identity.sku || p.identity.id || '').toString().trim().toLowerCase();
}

export function computeAnalytics(products: Product[], sales: SalesRecord[]): Map<string, ProductAnalytics> {
    // Index sales by normalized SKU
    const bySku = new Map<string, SalesRecord[]>();
    for (const s of sales) {
        const k = (s.sku || '').toLowerCase();
        if (!k) continue;
        const list = bySku.get(k);
        if (list) list.push(s); else bySku.set(k, [s]);
    }

    const endOfToday = TODAY_END();
    const t30 = endOfToday - 30 * DAY;

    // First pass — compute per-product revenue and daily bins
    interface Bucket {
        productId: string;
        sku: string;
        revenue: number;
        units: number;
        daily: number[];
    }
    const buckets: Bucket[] = [];

    for (const p of products) {
        const sku = skuOf(p);
        const records = bySku.get(sku) || [];
        const price = priceOf(p);
        const daily = new Array(30).fill(0);
        let revenue = 0;
        let units = 0;
        for (const r of records) {
            const ts = Date.parse(r.date);
            if (!Number.isFinite(ts) || ts < t30 || ts > endOfToday) continue;
            const dayIdx = 29 - Math.floor((endOfToday - ts) / DAY);
            if (dayIdx < 0 || dayIdx > 29) continue;
            daily[dayIdx] += r.qty;
            units += r.qty;
            revenue += (r.unitPrice || price) * r.qty;
        }
        buckets.push({ productId: p.identity.id, sku, revenue, units, daily });
    }

    const totalRevenue = buckets.reduce((s, b) => s + b.revenue, 0);

    // Pareto sort — highest revenue first, then assign tiers based on cumulative share
    const sorted = [...buckets].sort((a, b) => b.revenue - a.revenue);
    let running = 0;
    const out = new Map<string, ProductAnalytics>();
    for (const b of sorted) {
        const share = totalRevenue > 0 ? b.revenue / totalRevenue : 0;
        running += share;
        let tier: ABCTier = 'none';
        if (b.revenue === 0) tier = 'none';
        else if (running <= 0.80) tier = 'A';
        else if (running <= 0.95) tier = 'B';
        else tier = 'C';

        out.set(b.productId, {
            productId: b.productId,
            sku: b.sku,
            revenue30d: b.revenue,
            units30d: b.units,
            revenueShare: share,
            cumulativeShare: running,
            tier,
            daily30: b.daily,
        });
    }
    return out;
}

export function computeSalesKPIs(products: Product[], sales: SalesRecord[]): SalesKPIs {
    const endOfToday = TODAY_END();
    const t30 = endOfToday - 30 * DAY;
    const t7  = endOfToday - 7  * DAY;

    // Price lookup
    const priceMap = new Map<string, number>();
    for (const p of products) priceMap.set(skuOf(p), priceOf(p));

    let revenue30d = 0, revenue7d = 0;
    let units30d = 0;
    const ordersByDate = new Set<string>(); // date string = one "order" approximation
    const salesByProduct = new Map<string, number>();

    for (const s of sales) {
        const ts = Date.parse(s.date);
        if (!Number.isFinite(ts) || ts < t30 || ts > endOfToday) continue;
        const sku = (s.sku || '').toLowerCase();
        const unit = s.unitPrice ?? priceMap.get(sku) ?? 0;
        const rev = unit * s.qty;
        revenue30d += rev;
        units30d  += s.qty;
        if (ts >= t7) revenue7d += rev;
        ordersByDate.add(`${s.date}|${s.channel || ''}`);
        salesByProduct.set(sku, (salesByProduct.get(sku) || 0) + s.qty);
    }

    const orders30d = ordersByDate.size || 1;
    const aov = orders30d > 0 ? revenue30d / orders30d : 0;

    // Top seller by units
    let topSku = '', topUnits = 0;
    for (const [sku, units] of salesByProduct) {
        if (units > topUnits) { topSku = sku; topUnits = units; }
    }
    const topProduct = topSku ? products.find(p => skuOf(p) === topSku) : null;

    // 7d vs 30d trend
    const rev7Daily  = revenue7d / 7;
    const rev23Daily = (revenue30d - revenue7d) / 23;
    const trendPct = rev23Daily > 0 ? (rev7Daily / rev23Daily) - 1 : 0;

    return {
        revenue30d, units30d, orders30d,
        aov, revenue7d,
        topSeller: topProduct ? { name: topProduct.identity.name, units: topUnits } : undefined,
        salesCount: sales.length,
        trendPct,
    };
}

// ── Memoized cache (keyed on collection sizes) ──────────────────────────────
let _cacheKey = '';
let _cacheAnalytics: Map<string, ProductAnalytics> = new Map();
let _cacheKPIs: SalesKPIs | null = null;

function refreshIfStale(products: Product[]) {
    const sales = SalesService.getCached();
    const key = `${products.length}:${sales.length}`;
    if (key === _cacheKey && _cacheKPIs) return;
    _cacheAnalytics = computeAnalytics(products, sales);
    _cacheKPIs = computeSalesKPIs(products, sales);
    _cacheKey = key;
}

export function getAnalyticsMap(products: Product[]): Map<string, ProductAnalytics> {
    refreshIfStale(products);
    return _cacheAnalytics;
}

export function getSalesKPIs(products: Product[]): SalesKPIs {
    refreshIfStale(products);
    return _cacheKPIs!;
}

export function invalidateAnalyticsCache() { _cacheKey = ''; _cacheKPIs = null; }

SalesService.subscribe(() => invalidateAnalyticsCache());

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard-level aggregates
// ─────────────────────────────────────────────────────────────────────────────

/** Revenue time series over the last N days, oldest → newest. */
export function getRevenueTimeSeries(products: Product[], days = 60): number[] {
    const sales = SalesService.getCached();
    const priceMap = new Map<string, number>();
    for (const p of products) priceMap.set(skuOf(p), priceOf(p));

    const endOfToday = TODAY_END();
    const start = endOfToday - days * DAY;
    const series = new Array(days).fill(0);
    for (const s of sales) {
        const ts = Date.parse(s.date);
        if (!Number.isFinite(ts) || ts < start || ts > endOfToday) continue;
        const dayIdx = days - 1 - Math.floor((endOfToday - ts) / DAY);
        if (dayIdx < 0 || dayIdx >= days) continue;
        const unit = s.unitPrice ?? priceMap.get((s.sku || '').toLowerCase()) ?? 0;
        series[dayIdx] += unit * s.qty;
    }
    return series;
}

export interface CategoryPerformance {
    category: string;
    label: string;
    revenue30d: number;
    units30d: number;
    productCount: number;
    trendPct: number;
    daily: number[];
}

/** Aggregates revenue by category over the last 30 days, sorted by revenue desc. */
export function getCategoryPerformance(products: Product[]): CategoryPerformance[] {
    const analytics = getAnalyticsMap(products);
    const sales = SalesService.getCached();
    const priceMap = new Map<string, number>();
    const productByCategory = new Map<string, Product[]>();
    for (const p of products) {
        priceMap.set(skuOf(p), priceOf(p));
        const cat = p.identity.category || 'Unknown';
        const list = productByCategory.get(cat);
        if (list) list.push(p); else productByCategory.set(cat, [p]);
    }

    const endOfToday = TODAY_END();
    const t30 = endOfToday - 30 * DAY;
    const t7  = endOfToday - 7  * DAY;
    const t14 = endOfToday - 14 * DAY;

    const catStats = new Map<string, { rev30: number; units: number; rev7: number; rev14: number; daily: number[] }>();

    // SKU → category map for fast lookup during sales iteration
    const skuToCat = new Map<string, string>();
    for (const p of products) skuToCat.set(skuOf(p), p.identity.category || 'Unknown');

    for (const s of sales) {
        const ts = Date.parse(s.date);
        if (!Number.isFinite(ts) || ts < t30 || ts > endOfToday) continue;
        const sku = (s.sku || '').toLowerCase();
        const cat = skuToCat.get(sku);
        if (!cat) continue;
        const unit = s.unitPrice ?? priceMap.get(sku) ?? 0;
        const rev = unit * s.qty;

        let bucket = catStats.get(cat);
        if (!bucket) {
            bucket = { rev30: 0, units: 0, rev7: 0, rev14: 0, daily: new Array(30).fill(0) };
            catStats.set(cat, bucket);
        }
        bucket.rev30 += rev;
        bucket.units += s.qty;
        if (ts >= t7)  bucket.rev7  += rev;
        if (ts >= t14) bucket.rev14 += rev;
        const dayIdx = 29 - Math.floor((endOfToday - ts) / DAY);
        if (dayIdx >= 0 && dayIdx < 30) bucket.daily[dayIdx] += rev;
    }

    const out: CategoryPerformance[] = [];
    for (const [cat, bucket] of catStats) {
        const productCount = productByCategory.get(cat)?.length ?? 0;
        // Trend = last 7d daily avg vs previous 7d daily avg
        const prev7 = bucket.rev14 - bucket.rev7;
        const avg7   = bucket.rev7 / 7;
        const avgPrev = prev7 / 7;
        const trendPct = avgPrev > 0 ? (avg7 / avgPrev) - 1 : 0;

        out.push({
            category: cat,
            label: cat,
            revenue30d: bucket.rev30,
            units30d: bucket.units,
            productCount,
            trendPct,
            daily: bucket.daily,
        });
    }
    // Ensure analytics cache stays warm (used above) — no-op reference
    void analytics;

    out.sort((a, b) => b.revenue30d - a.revenue30d);
    return out;
}
