/**
 * Sales store — flat per-line-item log persisted in IndexedDB.
 * One record = one SKU sold on one day. Granularity matters for velocity math.
 */
import { getDB, SALES_STORE } from './persistence';

export interface SalesRecord {
    id?: number;
    sku: string;          // normalized lower-case, trimmed
    barcode?: string;
    date: string;         // ISO YYYY-MM-DD
    qty: number;
    unitPrice?: number;
    channel?: string;
}

type Listener = (records: SalesRecord[]) => void;

let cache: SalesRecord[] = [];
let loaded = false;
const listeners = new Set<Listener>();

function notify() { listeners.forEach(l => l(cache)); }

export const SalesService = {
    async loadAll(): Promise<SalesRecord[]> {
        if (loaded) return cache;
        const db = await getDB();
        if (!db) { loaded = true; return cache; }
        cache = (await db.getAll(SALES_STORE)) as SalesRecord[];
        loaded = true;
        notify();
        return cache;
    },

    getCached(): SalesRecord[] { return cache; },

    subscribe(l: Listener) {
        listeners.add(l);
        return () => listeners.delete(l);
    },

    async addMany(rows: Omit<SalesRecord, 'id'>[]): Promise<number> {
        if (!rows.length) return 0;
        const db = await getDB();
        if (!db) return 0;
        const tx = db.transaction(SALES_STORE, 'readwrite');
        for (const r of rows) await tx.store.add(r);
        await tx.done;
        // Refresh cache
        cache = (await db.getAll(SALES_STORE)) as SalesRecord[];
        loaded = true;
        notify();
        return rows.length;
    },

    async clear(): Promise<void> {
        const db = await getDB();
        if (db) await db.clear(SALES_STORE);
        cache = [];
        notify();
    },
};

// ── CSV parser: tolerant of column naming conventions ─────────────────────────
// Detects columns for SKU, date, qty, price across common shop exports
// (Shopify, WooCommerce, Square, generic POS).
const COL_ALIASES: Record<keyof SalesRecord, string[]> = {
    id:        [],
    sku:       ['sku', 'variant_sku', 'product_sku', 'code', 'ref', 'reference', 'article'],
    barcode:   ['barcode', 'ean', 'upc', 'gtin'],
    date:      ['date', 'order_date', 'created_at', 'timestamp', 'day'],
    qty:       ['qty', 'quantity', 'units', 'sold', 'lineitem_quantity'],
    unitPrice: ['price', 'unit_price', 'lineitem_price', 'total', 'amount'],
    channel:   ['channel', 'source', 'store', 'location'],
};

function detectDelimiter(text: string): string {
    const first = text.split(/\r?\n/, 1)[0] || '';
    const counts = [',', ';', '\t', '|'].map(d => ({ d, n: first.split(d).length - 1 }));
    counts.sort((a, b) => b.n - a.n);
    return counts[0].n > 0 ? counts[0].d : ',';
}

function normalizeHeader(h: string): string {
    return h.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

export function parseSalesCSV(text: string): { rows: Omit<SalesRecord, 'id'>[]; diagnostic: string } {
    if (!text || !text.trim()) return { rows: [], diagnostic: 'Empty file' };
    const delim = detectDelimiter(text);
    const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length < 2) return { rows: [], diagnostic: 'No data rows' };

    const headers = lines[0].split(delim).map(normalizeHeader);
    const pick = (key: keyof SalesRecord): number => {
        for (const alias of COL_ALIASES[key]) {
            const idx = headers.indexOf(alias);
            if (idx !== -1) return idx;
        }
        return -1;
    };

    const iSku   = pick('sku');
    const iDate  = pick('date');
    const iQty   = pick('qty');
    const iPrice = pick('unitPrice');
    const iBar   = pick('barcode');
    const iCh    = pick('channel');

    if (iSku === -1 || iQty === -1) {
        return { rows: [], diagnostic: `Missing required columns (sku, qty). Detected headers: ${headers.join(', ')}` };
    }

    const rows: Omit<SalesRecord, 'id'>[] = [];
    for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(delim);
        const sku = (parts[iSku] || '').trim().toLowerCase();
        const qty = parseFloat((parts[iQty] || '').replace(/[^\d.-]/g, ''));
        if (!sku || !Number.isFinite(qty) || qty <= 0) continue;
        rows.push({
            sku,
            qty,
            date: iDate >= 0 ? (parts[iDate] || '').trim().slice(0, 10) : new Date().toISOString().slice(0, 10),
            unitPrice: iPrice >= 0 ? parseFloat((parts[iPrice] || '').replace(/[^\d.-]/g, '')) || undefined : undefined,
            barcode:   iBar >= 0 ? (parts[iBar] || '').trim() || undefined : undefined,
            channel:   iCh  >= 0 ? (parts[iCh]  || '').trim() || undefined : undefined,
        });
    }
    return {
        rows,
        diagnostic: `Delimiter "${delim}" · ${rows.length}/${lines.length - 1} rows mapped via columns: ${headers.join(', ')}`,
    };
}
