/**
 * Universal CSV Parser
 *
 * Reads any CSV file regardless of column names or delimiters.
 * Uses fuzzy header mapping to extract product-relevant fields.
 * No hardcoded column names — adapts to any inventory format.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Column mapping — maps canonical field names to possible header variants
// ─────────────────────────────────────────────────────────────────────────────

const COLUMN_MAP: Record<string, string[]> = {
    id:            ['id', 'ref', 'code', 'code barre', 'barcode', 'sku', 'reference', 'réf'],
    name:          ['nom', 'name', 'designation', 'désignation', 'libelle', 'libellé', 'produit', 'article', 'description', 'label', 'prod'],
    brand:         ['marque', 'brand', 'fabricant', 'manufacturer', 'supplier', 'fournisseur'],
    category:      ['categorie', 'catégorie', 'category', 'famille', 'family', 'type', 'sous famille'],
    sku:           ['sku', 'ref', 'reference', 'cod', 'code article', 'code produit'],
    price_retail:  ['prix de vente', 'prix vente', 'pv ttc', 'pv ht', 'price', 'prix retail', 'prix détail', 'prix de vente (détail)', 'retail price', 'selling price', 'sale price', 'tarif'],
    price_purchase:['prix achat', "prix d'achat", 'pa', 'cost', 'purchase price', 'coût', 'cump'],
    price_wholesale:['prix de gros', 'gros', 'wholesale', 'prix gros'],
    stock:         ['quantite', 'quantité', 'qte', 'qty', 'stock', 'quantité en stock', 'quantity', 'disponible'],
    stock_status:  ['statut stock', 'statut', 'status', 'etat stock', 'disponibilité'],
};

// Delimiters to try in order of preference
const DELIMITERS = [';', ',', '\t', '|'];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function detectDelimiter(firstLine: string): string {
    let best = ',';
    let maxCount = 0;
    for (const d of DELIMITERS) {
        const count = firstLine.split(d).length;
        if (count > maxCount) { maxCount = count; best = d; }
    }
    return best;
}

function parseRow(line: string, delimiter: string): string[] {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            // Handle escaped quotes inside quoted fields
            if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
            else { inQuotes = !inQuotes; }
        } else if (ch === delimiter && !inQuotes) {
            values.push(current.trim());
            current = '';
        } else {
            current += ch;
        }
    }
    values.push(current.trim());
    return values;
}

function normalizeKey(s: string): string {
    return s.toLowerCase()
        .replace(/[\u0300-\u036f]/g, '')   // remove diacritics (after decompose)
        .normalize('NFC')
        .replace(/[^a-z0-9 ]/g, ' ')       // remove special chars
        .replace(/\s+/g, ' ')
        .trim();
}

function mapHeaders(headers: string[]): Record<string, number> {
    const mapping: Record<string, number> = {};

    headers.forEach((raw, idx) => {
        const norm = normalizeKey(raw);

        for (const [field, variants] of Object.entries(COLUMN_MAP)) {
            if (mapping[field] !== undefined) continue; // already mapped
            for (const variant of variants) {
                if (norm === variant || norm.includes(variant) || variant.includes(norm)) {
                    mapping[field] = idx;
                    break;
                }
            }
        }
    });

    return mapping;
}

function getValue(values: string[], mapping: Record<string, number>, field: string): string {
    const idx = mapping[field];
    if (idx === undefined || idx >= values.length) return '';
    return values[idx]?.trim() ?? '';
}

function parseNumber(s: string): number {
    if (!s) return 0;
    // Remove currency symbols, spaces, non-numeric chars except dot/comma
    const cleaned = s.replace(/[^\d.,]/g, '').replace(',', '.');
    return parseFloat(cleaned) || 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main parser
// ─────────────────────────────────────────────────────────────────────────────

export interface RawProductRow {
    id: string;
    name: string;
    brand: string;
    category: string;
    sku: string;
    price_retail: number;
    price_purchase: number;
    price_wholesale: number;
    stock: number;
    stock_status: string;
    /** All original columns preserved for reference */
    _raw: Record<string, string>;
}

export const UniversalCSVParser = {
    /**
     * Parses any CSV text into raw product rows.
     * Returns an empty array if the file cannot be understood.
     */
    parse(csvText: string): RawProductRow[] {
        if (!csvText?.trim()) return [];

        // Normalize line endings
        const lines = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
        const nonEmpty = lines.filter(l => l.trim());
        if (nonEmpty.length < 2) return [];

        const delimiter = detectDelimiter(nonEmpty[0]);
        const rawHeaders = parseRow(nonEmpty[0], delimiter);
        const mapping = mapHeaders(rawHeaders);

        // Build a lookup for all columns by normalized name
        const allCols: Record<string, number> = {};
        rawHeaders.forEach((h, i) => { allCols[normalizeKey(h)] = i; });

        const rows: RawProductRow[] = [];

        for (let i = 1; i < nonEmpty.length; i++) {
            const line = nonEmpty[i];
            if (!line.trim()) continue;

            const values = parseRow(line, delimiter);
            if (values.length < 2) continue; // skip degenerate rows

            // Build raw object with all columns
            const rawObj: Record<string, string> = {};
            rawHeaders.forEach((h, idx) => {
                rawObj[h] = values[idx]?.trim() ?? '';
            });

            // Extract canonical fields
            const name = getValue(values, mapping, 'name');
            if (!name) continue; // skip rows with no product name

            // Derive ID — prefer explicit id field, fall back to sku, then position
            const id =
                getValue(values, mapping, 'id') ||
                getValue(values, mapping, 'sku') ||
                `row_${i}`;

            const brand = getValue(values, mapping, 'brand');
            const category = getValue(values, mapping, 'category');
            const sku = getValue(values, mapping, 'sku') || id;

            // Price: try retail first, fall back to any price column
            let price_retail = parseNumber(getValue(values, mapping, 'price_retail'));
            const price_purchase = parseNumber(getValue(values, mapping, 'price_purchase'));
            const price_wholesale = parseNumber(getValue(values, mapping, 'price_wholesale'));

            // If retail is 0, try wholesale
            if (price_retail === 0 && price_wholesale > 0) price_retail = price_wholesale;

            const stock = parseNumber(getValue(values, mapping, 'stock'));
            const stock_status = getValue(values, mapping, 'stock_status');

            rows.push({
                id,
                name,
                brand,
                category,
                sku,
                price_retail,
                price_purchase,
                price_wholesale,
                stock,
                stock_status,
                _raw: rawObj,
            });
        }

        return rows;
    },

    /**
     * Returns a diagnostic summary of what columns were detected.
     * Useful for debugging unknown formats.
     */
    diagnose(csvText: string): { delimiter: string; headers: string[]; mappedFields: string[] } {
        const lines = csvText.replace(/\r\n/g, '\n').split('\n').filter(l => l.trim());
        if (!lines.length) return { delimiter: ',', headers: [], mappedFields: [] };

        const delimiter = detectDelimiter(lines[0]);
        const headers = parseRow(lines[0], delimiter);
        const mapping = mapHeaders(headers);

        return {
            delimiter,
            headers,
            mappedFields: Object.keys(mapping),
        };
    }
};
