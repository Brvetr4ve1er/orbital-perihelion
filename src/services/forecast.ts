/**
 * Forecast — forward-looking projections derived from sales + velocity.
 *
 * Two headline outputs:
 *   1. Revenue forecast (7d / 30d horizons) with a confidence band built from
 *      the coefficient of variation of the recent daily series.
 *   2. Stock-out ETA list: for every product with positive velocity, the date
 *      its current on-hand stock will hit zero at the current sell-through rate.
 *
 * Forecasting model: a simple exponentially-weighted average of recent daily
 * revenue, nudged by the 7d-vs-23d trend factor. No ML, no dependencies — we
 * keep it transparent so operators can trust (and argue with) the numbers.
 */
import { Product } from '../core/schema';
import { SalesService } from './sales';
import { getRevenueTimeSeries } from './analytics';
import { getVelocityMap } from './velocity';

const DAY = 24 * 60 * 60 * 1000;

export interface RevenueForecast {
    /** Point estimate for revenue in the horizon. */
    horizonDays: number;
    expected: number;
    /** ±1σ band around the expected value. */
    low: number;
    high: number;
    /** Daily projected revenue (length = horizonDays). */
    daily: number[];
    /** Model confidence in [0..1]. Higher = tighter historical variance. */
    confidence: number;
}

export interface StockoutETA {
    productId: string;
    productName: string;
    sku: string;
    daysUntilStockout: number;
    /** ISO date yyyy-mm-dd */
    etaDate: string;
    velocity: number;
    onHand: number;
}

function mean(xs: number[]): number {
    return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}
function stddev(xs: number[]): number {
    if (xs.length < 2) return 0;
    const m = mean(xs);
    const variance = xs.reduce((s, x) => s + (x - m) * (x - m), 0) / (xs.length - 1);
    return Math.sqrt(variance);
}

/**
 * Build a revenue forecast over `horizonDays` days.
 * Uses an exponentially-weighted baseline plus a gentle trend factor from
 * the last 7 days vs the prior 23.
 */
export function forecastRevenue(products: Product[], horizonDays = 30): RevenueForecast {
    const history = getRevenueTimeSeries(products, 30);
    if (history.length === 0) {
        return { horizonDays, expected: 0, low: 0, high: 0, daily: new Array(horizonDays).fill(0), confidence: 0 };
    }

    // Exponentially-weighted average — more weight to recent days
    const alpha = 0.25;
    let ema = history[0];
    for (let i = 1; i < history.length; i++) {
        ema = alpha * history[i] + (1 - alpha) * ema;
    }

    // Trend: last 7 vs prior 23
    const last7 = history.slice(-7);
    const prior23 = history.slice(0, history.length - 7);
    const avg7 = mean(last7);
    const avgPrior = mean(prior23);
    const trendFactor = avgPrior > 0 ? avg7 / avgPrior : 1;
    // Dampen the trend so one hot week doesn't send the forecast to the moon
    const dampenedTrend = 1 + 0.5 * (trendFactor - 1);

    // Confidence: inverse coefficient of variation, clamped to [0..1]
    const m = mean(history);
    const sd = stddev(history);
    const cv = m > 0 ? sd / m : 1;
    const confidence = Math.max(0, Math.min(1, 1 - cv));

    // Daily projection: ema nudged by trend, with a slight mean-reversion so
    // the curve bends back toward the 30d average over the horizon.
    const anchor = m;
    const daily: number[] = [];
    for (let i = 0; i < horizonDays; i++) {
        const t = (i + 1) / horizonDays;
        // Early days: trust recent EMA * trend. Later days: drift toward anchor.
        const projected = (ema * dampenedTrend) * (1 - t * 0.4) + anchor * (t * 0.4);
        daily.push(Math.max(0, projected));
    }

    const expected = daily.reduce((a, b) => a + b, 0);
    // ±1σ band on the total — scale sigma by sqrt(horizon) for daily IID assumption
    const totalSigma = sd * Math.sqrt(horizonDays);
    return {
        horizonDays,
        expected,
        low:  Math.max(0, expected - totalSigma),
        high: expected + totalSigma,
        daily,
        confidence,
    };
}

/**
 * For every product with positive velocity, compute how many days remain
 * until stock hits zero. Returns items sorted by soonest ETA.
 */
export function computeStockoutETAs(products: Product[], limit = 12): StockoutETA[] {
    const vmap = getVelocityMap(products);
    const etas: StockoutETA[] = [];
    const now = Date.now();

    for (const p of products) {
        const v = vmap.get(p.identity.id);
        if (!v) continue;
        if (v.velocity <= 0 || v.onHand <= 0) continue;
        const daysUntil = v.onHand / v.velocity;
        if (!Number.isFinite(daysUntil)) continue;
        const eta = new Date(now + daysUntil * DAY);
        const etaDate = eta.toISOString().slice(0, 10);
        etas.push({
            productId: p.identity.id,
            productName: p.identity.name,
            sku: v.sku,
            daysUntilStockout: daysUntil,
            etaDate,
            velocity: v.velocity,
            onHand: v.onHand,
        });
    }
    etas.sort((a, b) => a.daysUntilStockout - b.daysUntilStockout);
    return etas.slice(0, limit);
}

// ── Memoized wrappers ───────────────────────────────────────────────────────
interface ForecastCache {
    key: string;
    fc7?: RevenueForecast;
    fc30?: RevenueForecast;
    etas?: StockoutETA[];
}
let _cache: ForecastCache = { key: '' };

function refreshIfStale(products: Product[]) {
    const sales = SalesService.getCached();
    const key = `${products.length}:${sales.length}`;
    if (key === _cache.key) return;
    _cache = {
        key,
        fc7:  forecastRevenue(products, 7),
        fc30: forecastRevenue(products, 30),
        etas: computeStockoutETAs(products, 12),
    };
}

export function getRevenueForecast(products: Product[], horizon: 7 | 30 = 30): RevenueForecast {
    refreshIfStale(products);
    return horizon === 7 ? _cache.fc7! : _cache.fc30!;
}

export function getStockoutETAs(products: Product[]): StockoutETA[] {
    refreshIfStale(products);
    return _cache.etas!;
}

export function invalidateForecastCache() { _cache = { key: '' }; }

SalesService.subscribe(() => invalidateForecastCache());
