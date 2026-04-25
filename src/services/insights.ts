/**
 * Insights — narrative observations derived from the live product + sales state.
 *
 * The feed surfaces what matters without the user having to scan every widget.
 * Each insight carries a severity, an icon, a short headline, a human-readable
 * body, and optional navigation metadata (productId / category) so the UI can
 * route clicks to the right drill-down.
 *
 * All insight computation is pure. The feed is recomputed whenever products or
 * sales change — rankings are cheap because the upstream velocity/analytics
 * caches do the heavy lifting.
 */
import { Product } from '../core/schema';
import { getVelocityMap } from './velocity';
import {
    getAnalyticsMap,
    getCategoryPerformance,
    getRevenueTimeSeries,
} from './analytics';
import { SalesService } from './sales';

export type InsightSeverity = 'critical' | 'warning' | 'positive' | 'info';

export interface Insight {
    id: string;
    severity: InsightSeverity;
    icon: string;
    headline: string;
    body: string;
    /** Higher weight = floats toward the top of the feed. */
    weight: number;
    /** Optional drill-down targets the UI can route clicks to. */
    productId?: string;
    category?: string;
    /** Pre-formatted metric, shown in the card trailing slot. */
    metric?: string;
}

/** Returns purchase price and whether it is real (from schema) or estimated. */
function purchasePriceOf(p: Product): { price: number; isEstimated: boolean } {
    // CPO v4.2: priceRange.min = purchase/cost price, .typical = retail price
    const min = p.commercial?.priceRange?.min;
    if (typeof min === 'number' && min > 0) {
        return { price: min, isEstimated: false };
    }
    // No purchase price in schema — use 60% of retail as rough estimate
    const retail = p.commercial?.priceRange?.typical || 0;
    return { price: retail * 0.6, isEstimated: true };
}

function priceOf(p: Product): number {
    return p.commercial?.priceRange?.typical || 0;
}

function fmtCurrency(v: number): string {
    return new Intl.NumberFormat('fr-DZ', {
        style: 'currency', currency: 'DZD', maximumFractionDigits: 0,
    }).format(v);
}

function fmtShort(v: number): string {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1000)     return `${Math.round(v / 1000)}k`;
    return String(Math.round(v));
}

/**
 * Build the feed. Returns up to `limit` insights ranked by weight desc.
 * If sales data is absent, returns a single onboarding insight.
 */
export function computeInsights(products: Product[], limit = 8): Insight[] {
    const sales = SalesService.getCached();
    const insights: Insight[] = [];

    if (sales.length === 0) {
        insights.push({
            id: 'onboarding-sales',
            severity: 'info',
            icon: '📊',
            headline: 'Import sales to unlock insights',
            body: 'The insights feed narrates velocity, trends, and reorder urgency once a sales CSV is loaded. Click the 📊 Sales button in the header.',
            weight: 0,
        });
        return insights;
    }

    const velMap = getVelocityMap(products);
    const anaMap = getAnalyticsMap(products);

    // ── 1. Critical stock-outs on high-velocity items ──────────────────────
    const criticals: Array<{ p: Product; daysOfCover: number; velocity: number }> = [];
    for (const p of products) {
        const v = velMap.get(p.identity.id);
        if (!v) continue;
        if (v.reorderSignal === 'critical' && v.velocity > 0) {
            criticals.push({ p, daysOfCover: v.daysOfCover, velocity: v.velocity });
        }
    }
    criticals.sort((a, b) => a.daysOfCover - b.daysOfCover);
    const topCritical = criticals[0];
    if (topCritical) {
        const doc = Number.isFinite(topCritical.daysOfCover)
            ? `${Math.round(topCritical.daysOfCover)}d cover`
            : 'out of stock';
        insights.push({
            id: `critical-${topCritical.p.identity.id}`,
            severity: 'critical',
            icon: '🔥',
            headline: `${topCritical.p.identity.name} will stock out soon`,
            body: `Selling ${topCritical.velocity.toFixed(1)} units/day with only ${doc} remaining. Reorder now to avoid lost sales.`,
            weight: 100,
            productId: topCritical.p.identity.id,
            metric: doc,
        });
    }
    if (criticals.length > 1) {
        insights.push({
            id: 'critical-summary',
            severity: 'critical',
            icon: '⚠',
            headline: `${criticals.length} products at critical stock`,
            body: `In total, ${criticals.length} SKUs are projected to stock out within a week at their current sell-through rate.`,
            weight: 90,
            metric: `${criticals.length} SKUs`,
        });
    }

    // ── 2. Trending up / down (velocity trend with meaningful volume) ──────
    interface TrendItem { p: Product; trend: number; vel: number }
    const trending: TrendItem[] = [];
    for (const p of products) {
        const v = velMap.get(p.identity.id);
        if (!v || v.sold30d < 5) continue; // need signal
        trending.push({ p, trend: v.trend, vel: v.velocity });
    }
    trending.sort((a, b) => b.trend - a.trend);
    const topUp = trending.find(t => t.trend > 0.3);
    if (topUp) {
        insights.push({
            id: `up-${topUp.p.identity.id}`,
            severity: 'positive',
            icon: '🚀',
            headline: `${topUp.p.identity.name} is accelerating`,
            body: `7-day pace is ${Math.round(topUp.trend * 100)}% faster than the 30-day baseline. Consider increasing stock depth or promoting.`,
            weight: 70,
            productId: topUp.p.identity.id,
            metric: `+${Math.round(topUp.trend * 100)}%`,
        });
    }
    const topDown = [...trending].reverse().find(t => t.trend < -0.3);
    if (topDown) {
        insights.push({
            id: `down-${topDown.p.identity.id}`,
            severity: 'warning',
            icon: '📉',
            headline: `${topDown.p.identity.name} is cooling off`,
            body: `Recent week is ${Math.round(Math.abs(topDown.trend) * 100)}% slower than the 30-day baseline. Worth checking pricing or visibility.`,
            weight: 55,
            productId: topDown.p.identity.id,
            metric: `${Math.round(topDown.trend * 100)}%`,
        });
    }

    // ── 3. Dead capital ────────────────────────────────────────────────────
    let deadCapital = 0;
    let deadCount = 0;
    let hasEstimatedPrices = false;
    let worstDead: { p: Product; tied: number } | null = null;
    for (const p of products) {
        const v = velMap.get(p.identity.id);
        if (v?.reorderSignal === 'dead') {
            const { price, isEstimated } = purchasePriceOf(p);
            if (isEstimated) hasEstimatedPrices = true;
            const tied = price * v.onHand;
            deadCapital += tied;
            deadCount++;
            if (!worstDead || tied > worstDead.tied) worstDead = { p, tied };
        }
    }
    if (deadCount >= 3 && deadCapital > 0) {
        const estSuffix = hasEstimatedPrices ? " (estimé — importez les prix d'achat pour précision)" : '';
        insights.push({
            id: 'dead-capital',
            severity: hasEstimatedPrices ? 'info' : 'warning',
            icon: '💀',
            headline: `${fmtCurrency(deadCapital)} immobilisé en stock mort${hasEstimatedPrices ? ' ≈' : ''}`,
            body: `${deadCount} SKUs sans ventes depuis 90 jours. ${worstDead ? `Pire position: ${worstDead.p.identity.name} (${fmtCurrency(worstDead.tied)}).` : ''} ${estSuffix} Envisager des déstockages.`,
            weight: hasEstimatedPrices ? 40 : 65,
            metric: fmtShort(deadCapital),
        });
    }

    // ── 4. Category momentum ──────────────────────────────────────────────
    const categories = getCategoryPerformance(products);
    const hotCat = categories.find(c => c.trendPct > 0.3 && c.revenue30d > 0);
    if (hotCat) {
        insights.push({
            id: `cat-hot-${hotCat.category}`,
            severity: 'positive',
            icon: '🔥',
            headline: `${hotCat.label} category is heating up`,
            body: `${hotCat.productCount} SKUs in this category are up ${Math.round(hotCat.trendPct * 100)}% week-over-week. Leaning into inventory here could compound the gain.`,
            weight: 60,
            category: hotCat.category,
            metric: `+${Math.round(hotCat.trendPct * 100)}%`,
        });
    }
    const coldCat = [...categories].reverse().find(c => c.trendPct < -0.3 && c.revenue30d > 0);
    if (coldCat) {
        insights.push({
            id: `cat-cold-${coldCat.category}`,
            severity: 'warning',
            icon: '🧊',
            headline: `${coldCat.label} category is slipping`,
            body: `Revenue in this category is down ${Math.round(Math.abs(coldCat.trendPct) * 100)}% week-over-week across ${coldCat.productCount} SKUs.`,
            weight: 50,
            category: coldCat.category,
            metric: `${Math.round(coldCat.trendPct * 100)}%`,
        });
    }

    // ── 5. Star performer (top A-tier holding a disproportionate share) ────
    let star: { p: Product; share: number } | null = null;
    for (const p of products) {
        const a = anaMap.get(p.identity.id);
        if (!a || a.tier !== 'A') continue;
        if (!star || a.revenueShare > star.share) star = { p, share: a.revenueShare };
    }
    if (star && star.share > 0.15) {
        insights.push({
            id: `star-${star.p.identity.id}`,
            severity: 'info',
            icon: '⭐',
            headline: `${star.p.identity.name} drives ${Math.round(star.share * 100)}% of revenue`,
            body: `This single SKU carries a disproportionate share of 30-day revenue. Treat its stock-out risk and price as load-bearing.`,
            weight: 45,
            productId: star.p.identity.id,
            metric: `${Math.round(star.share * 100)}%`,
        });
    }

    // ── 6. Revenue anomalies (recent day vs 30-day baseline) ───────────────
    const revSeries = getRevenueTimeSeries(products, 30);
    if (revSeries.length === 30) {
        const recent = revSeries[29];
        const prior  = revSeries.slice(0, 29);
        const priorAvg = prior.reduce((a, b) => a + b, 0) / prior.length;
        if (priorAvg > 0 && recent > priorAvg * 2) {
            insights.push({
                id: 'anomaly-spike',
                severity: 'positive',
                icon: '📈',
                headline: 'Revenue spike detected today',
                body: `Today's revenue is ${Math.round((recent / priorAvg - 1) * 100)}% above the 29-day average. Worth understanding which products or channels drove it.`,
                weight: 40,
                metric: fmtCurrency(recent),
            });
        } else if (priorAvg > 0 && recent > 0 && recent < priorAvg * 0.4) {
            insights.push({
                id: 'anomaly-dip',
                severity: 'warning',
                icon: '🥶',
                headline: 'Revenue dip detected today',
                body: `Today's revenue is ${Math.round((1 - recent / priorAvg) * 100)}% below the 29-day average. Check for pricing, stock, or channel issues.`,
                weight: 40,
                metric: fmtCurrency(recent),
            });
        }
    }

    // ── 7. Price-vs-market opportunity ─────────────────────────────────────
    let priceGap: { p: Product; pct: number } | null = null;
    for (const p of products) {
        const cps = (p.enrichment?.competitorPrices || [])
            .map((c: any) => Number(c.price))
            .filter(n => Number.isFinite(n) && n > 0);
        if (cps.length < 2) continue;
        const avg = cps.reduce((a, b) => a + b, 0) / cps.length;
        const retail = priceOf(p);
        if (!retail || !avg) continue;
        const pct = (retail - avg) / avg;
        if (pct > 0.1 && (!priceGap || pct > priceGap.pct)) {
            priceGap = { p, pct };
        }
    }
    if (priceGap) {
        insights.push({
            id: `pricegap-${priceGap.p.identity.id}`,
            severity: 'info',
            icon: '💰',
            headline: `${priceGap.p.identity.name} priced above market`,
            body: `Listed ${Math.round(priceGap.pct * 100)}% above the average competitor price. Lowering the price may unlock demand — or the premium may be justified.`,
            weight: 30,
            productId: priceGap.p.identity.id,
            metric: `+${Math.round(priceGap.pct * 100)}%`,
        });
    }

    // Final ranking + trim
    insights.sort((a, b) => b.weight - a.weight);
    return insights.slice(0, limit);
}
