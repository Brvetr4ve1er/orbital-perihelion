import { Product } from '../core/schema';
import { ProductAdapter } from '../core/product-adapter';

function csvEscape(v: any): string {
    if (v == null) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
}

const COLUMNS: Array<{ header: string; get: (p: Product, lp: any) => any }> = [
    { header: 'id',             get: (p) => p.identity.id },
    { header: 'name',           get: (p) => p.identity.name },
    { header: 'brand',          get: (p) => p.identity.brand },
    { header: 'model',          get: (p) => p.identity.model },
    { header: 'sku',            get: (p) => p.identity.sku || '' },
    { header: 'category',       get: (p) => p.identity.category },
    { header: 'price',          get: (_, lp) => lp.commercial.retailPrice },
    { header: 'purchase_price', get: (_, lp) => lp.commercial.purchasePrice },
    { header: 'margin_pct',     get: (_, lp) => lp.commercial.margin },
    { header: 'stock',          get: (_, lp) => lp.commercial.stockQty },
    { header: 'stock_status',   get: (_, lp) => lp.commercial.stockStatus },
    { header: 'competitor_count', get: (p) => (p.enrichment?.competitorPrices || []).length },
    { header: 'market_min_price', get: (p) => {
        const cp = p.enrichment?.competitorPrices || [];
        const nums = cp.map((c: any) => c.price).filter((x: any) => typeof x === 'number' && x > 0);
        return nums.length ? Math.min(...nums) : '';
    }},
    { header: 'enriched',       get: (p) => !!(p.enrichment?.competitorPrices?.length || p.knowledge?.insights) },
    { header: 'seo_description',get: (p) => p.enrichment?.seoDescription || '' },
    { header: 'pros',           get: (p) => (p.knowledge?.insights?.pros || []).join(' | ') },
    { header: 'cons',           get: (p) => (p.knowledge?.insights?.cons || []).join(' | ') },
    { header: 'hero_image',     get: (p) => p.visual?.heroImage || '' },
    { header: 'sources',        get: (p) => (p.enrichment?.sources || []).map((s: any) => s.url).join(' | ') },
];

export function productsToCSV(products: Product[]): string {
    const header = COLUMNS.map(c => c.header).join(',');
    const rows = products.map(p => {
        const lp = ProductAdapter.toLegacy(p);
        return COLUMNS.map(c => csvEscape(c.get(p, lp))).join(',');
    });
    return [header, ...rows].join('\r\n');
}

export function downloadCSV(products: Product[], filename = `pkos-export-${Date.now()}.csv`) {
    const csv = productsToCSV(products);
    downloadBlob(csv, filename);
}

function downloadBlob(csv: string, filename: string) {
    const blob = new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── Shopify Products CSV ─────────────────────────────────────────────────────
// Matches Shopify's canonical import spec. Each product becomes one primary row
// plus one row per extra image (Shopify expects empty Title/Handle for image-only rows).
// Columns reference: https://help.shopify.com/en/manual/products/import-export/using-csv
const SHOPIFY_COLUMNS = [
    'Handle', 'Title', 'Body (HTML)', 'Vendor', 'Type', 'Tags', 'Published',
    'Option1 Name', 'Option1 Value',
    'Variant SKU', 'Variant Grams', 'Variant Inventory Tracker',
    'Variant Inventory Qty', 'Variant Inventory Policy', 'Variant Fulfillment Service',
    'Variant Price', 'Variant Compare At Price',
    'Variant Requires Shipping', 'Variant Taxable', 'Variant Barcode',
    'Image Src', 'Image Position', 'Image Alt Text',
    'Gift Card', 'SEO Title', 'SEO Description',
    'Status',
];

function handleFromName(name: string): string {
    return (name || '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 80) || 'product';
}

export function productsToShopifyCSV(products: Product[]): string {
    const rows: string[] = [SHOPIFY_COLUMNS.join(',')];
    for (const p of products) {
        const lp = ProductAdapter.toLegacy(p);
        const handle  = p.identity.sku ? handleFromName(p.identity.sku) : handleFromName(p.identity.name);
        const title   = p.identity.name || '';
        const body    = p.enrichment?.seoDescription || p.enrichment?.description || '';
        const vendor  = p.identity.brand || '';
        const type    = p.identity.category || '';
        const tags    = [p.identity.brand, p.identity.category, p.identity.subcategory].filter(Boolean).join(', ');
        const price   = lp.commercial.retailPrice || 0;
        const stock   = lp.commercial.stockQty || 0;
        const barcode = p.enrichment?.barcode || '';
        const hero    = p.visual?.heroImage || '';
        const gallery = p.visual?.gallery || [];
        const seoTitle = (p.identity.brand ? `${p.identity.brand} ${title}` : title).slice(0, 70);
        const seoDesc  = (body || title).replace(/\s+/g, ' ').slice(0, 320);

        // Primary row with the full product payload + first image
        rows.push([
            handle, title, body, vendor, type, tags, 'TRUE',
            'Title', 'Default Title',
            p.identity.sku || '', '0', 'shopify',
            String(stock), 'deny', 'manual',
            String(price), '',
            'TRUE', 'TRUE', barcode,
            hero, hero ? '1' : '', hero ? title : '',
            'FALSE', seoTitle, seoDesc,
            'active',
        ].map(csvEscape).join(','));

        // One extra row per additional image (Shopify convention)
        gallery.forEach((src, i) => {
            if (!src || src === hero) return;
            rows.push([
                handle, '', '', '', '', '', '',
                '', '',
                '', '', '',
                '', '', '',
                '', '',
                '', '', '',
                src, String(i + 2), '',
                '', '', '',
                '',
            ].map(csvEscape).join(','));
        });
    }
    return rows.join('\r\n');
}

export function downloadShopifyCSV(products: Product[], filename = `shopify-products-${Date.now()}.csv`) {
    const csv = productsToShopifyCSV(products);
    downloadBlob(csv, filename);
}
