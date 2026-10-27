/**
 * Universal CSV Parser
 *
 * Reads any CSV file regardless of column names or delimiters.
 * Uses fuzzy header mapping to extract product-relevant fields.
 * No hardcoded column names — adapts to any inventory format.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Column mapping — maps canonical field names to possible header variants
// All variants must be pre-normalized ASCII strings (lower, no diacritics,
// no special chars) so they can be compared directly against normalized headers.
// ─────────────────────────────────────────────────────────────────────────────

const COLUMN_MAP: Record<string, string[]> = {
    id:             ['id', 'ref', 'code', 'code barre', 'barcode', 'sku', 'reference', 'ref', 'article_id', 'product_id'],
    name:           ['nom', 'name', 'designation', 'libelle', 'produit', 'article', 'description', 'label', 'prod', 'titre', 'title', 'product name'],
    brand:          ['marque', 'brand', 'fabricant', 'manufacturer', 'supplier', 'fournisseur', 'brand_name', 'mfr'],
    category:       ['categorie', 'category', 'famille', 'family', 'type', 'sous famille', 'departement', 'dept', 'groupe', 'group', 'division', 'classe', 'class'],
    sku:            ['sku', 'reference', 'cod', 'code article', 'code produit', 'article code', 'part number', 'partnumber', 'sku_number'],
    barcode:        ['code barre', 'barcode', 'ean', 'upc', 'gtin', 'ean13', 'ean 13', 'code barres', 'code a barres', 'codebarres', 'codebar', 'upc_code'],
    mpn:            ['mpn', 'manufacturer part', 'mfr part', 'part no', 'part number', 'modele', 'model number', 'model no', 'numero modele', 'model'],
    price_retail:   ['prix de vente', 'prix vente', 'pv ttc', 'pv ht', 'price', 'prix retail', 'prix detail', 'prix de vente detail', 'retail price', 'selling price', 'sale price', 'tarif', 'pvttc', 'pvht', 'prix_unit'],
    price_purchase: ['prix achat', 'pa', 'cost', 'purchase price', 'cout', 'cump', 'dernier prix achat', 'last purchase price', 'coût unitaire', 'cout unitaire', 'pa_ht'],
    price_wholesale:['prix de gros', 'gros', 'wholesale', 'prix gros', 'prix revendeur'],
    stock:          ['quantite', 'qte', 'qty', 'stock', 'quantite en stock', 'quantity', 'disponible', 'quantity in stock', 'stock qty', 'stk'],
    stock_status:   ['statut stock', 'statut', 'status', 'etat stock', 'disponibilite', 'availability'],
};

// Delimiters to try in order of preference
const DELIMITERS = [';', ',', '\t', '|'];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalizes a string to lowercase ASCII for fuzzy comparison.
 * IMPORTANT: NFD decomposition MUST come first so combining diacritics
 * (U+0300–U+036F) are separated and can be stripped.
 * If we normalize to NFC first (the default), accented chars like é (U+00E9)
 * stay as a single code-point and the regex has nothing to remove.
 */
function normalizeKey(s: string): string {
    return s
        .normalize('NFD')                        // decompose: é → e + ´
        .replace(/[\u0300-\u036f]/g, '')         // strip combining diacritics
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, ' ')            // non-alphanumeric → space
        .replace(/\s+/g, ' ')
        .trim();
}

// Pre-compute normalized variants so we don't repeat the work every parse
const NORMALIZED_MAP: Record<string, string[]> = Object.fromEntries(
    Object.entries(COLUMN_MAP).map(([field, variants]) => [
        field,
        variants.map(normalizeKey),
    ])
);

function detectDelimiter(firstLine: string): string {
    let best = ',';
    let maxCount = 0;
    for (const d of DELIMITERS) {
        const count = firstLine.split(d).length;
        if (count > maxCount) { maxCount = count; best = d; }
    }
    return best;
}

function parseCsvLines(csvText: string, delimiter: string): string[][] {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentField = '';
    let inQuotes = false;

    for (let i = 0; i < csvText.length; i++) {
        const char = csvText[i];
        const nextChar = csvText[i + 1];

        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                currentField += '"';
                i++; // Skip the escaped quote
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === delimiter && !inQuotes) {
            currentRow.push(currentField.trim());
            currentField = '';
        } else if ((char === '\n' || char === '\r') && !inQuotes) {
            if (char === '\r' && nextChar === '\n') i++; // Skip \n
            currentRow.push(currentField.trim());
            rows.push(currentRow);
            currentRow = [];
            currentField = '';
        } else {
            currentField += char;
        }
    }

    if (currentField || currentRow.length > 0) {
        currentRow.push(currentField.trim());
        rows.push(currentRow);
    }

    return rows.filter(r => r.some(f => f.trim() !== ''));
}

/**
 * Maps raw CSV headers to canonical field names.
 * Both the header and the variants are normalized with normalizeKey()
 * so accent/case differences are transparent.
 *
 * Priority rules:
 * - `barcode` is checked before `id`, so a dedicated EAN/barcode column
 *   is not accidentally swallowed by the generic id mapping.
 * - Once a field is claimed it is not re-claimed.
 */
function mapHeaders(headers: string[]): Record<string, number> {
    // Fields that should be checked first to avoid wrong captures
    const PRIORITY_ORDER = ['barcode', 'mpn', 'id', 'name', 'brand', 'category', 'sku',
        'price_retail', 'price_purchase', 'price_wholesale', 'stock', 'stock_status'];

    // Build a sorted entry list
    const sortedEntries = PRIORITY_ORDER.map(f => [f, NORMALIZED_MAP[f] as string[]] as const)
        .filter(([, variants]) => variants !== undefined);

    const mapping: Record<string, number> = {};

    headers.forEach((raw, idx) => {
        const norm = normalizeKey(raw);

        for (const [field, variants] of sortedEntries) {
            if (mapping[field] !== undefined) continue; // already mapped
            for (const variant of variants) {
                // Exact match preferred; partial match only when both strings
                // are long enough (≥ 3 chars) to avoid false positives on
                // short tokens like "p", "id", etc.
                const exactMatch = norm === variant;
                const partialMatch =
                    norm.length >= 3 && variant.length >= 3 &&
                    (norm.includes(variant) || variant.includes(norm));
                if (exactMatch || partialMatch) {
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

/**
 * Parses a numeric string that may use either:
 *   - US/ISO format:       1,234.56  (comma = thousands sep, dot = decimal)
 *   - European format:     1.234,56  (dot = thousands sep, comma = decimal)
 *   - Space-separated:     1 234,56  (space = thousands sep)
 *   - Plain:               1234.56
 */
function parseNumber(s: string): number {
    if (!s) return 0;

    // Remove currency symbols and letter characters, keep digits .,-
    let cleaned = s.replace(/[^\d.,\- ]/g, '').trim();
    if (!cleaned) return 0;

    // Detect format by the position and count of separators
    const lastComma = cleaned.lastIndexOf(',');
    const lastDot   = cleaned.lastIndexOf('.');

    if (lastComma !== -1 && lastDot !== -1) {
        // Both present — whichever is last is the decimal separator
        if (lastComma > lastDot) {
            // European: 1.234,56
            cleaned = cleaned.replace(/\./g, '').replace(',', '.');
        } else {
            // US: 1,234.56
            cleaned = cleaned.replace(/,/g, '');
        }
    } else if (lastComma !== -1) {
        // Only comma: could be decimal (1234,56) or thousands (1,234)
        const afterComma = cleaned.slice(lastComma + 1);
        if (afterComma.length === 3 && !afterComma.includes(',')) {
            // Thousands separator (e.g. 1,234) — remove it
            cleaned = cleaned.replace(/,/g, '');
        } else {
            // Decimal comma
            cleaned = cleaned.replace(',', '.');
        }
    }
    // Only dots — remove all but the last (handles "1.234.56" edge case)
    else if ((cleaned.match(/\./g) || []).length > 1) {
        const parts = cleaned.split('.');
        cleaned = parts.slice(0, -1).join('') + '.' + parts[parts.length - 1];
    }

    // Remove any remaining spaces (thousands sep with spaces)
    cleaned = cleaned.replace(/\s/g, '');

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
    /** EAN / barcode / UPC / GTIN */
    barcode: string;
    /** Manufacturer part number */
    mpn: string;
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

        const firstLineBreak = csvText.indexOf('\n');
        const firstLine = firstLineBreak > -1 ? csvText.substring(0, firstLineBreak) : csvText;
        const delimiter = detectDelimiter(firstLine);
        
        const rowsValues = parseCsvLines(csvText, delimiter);
        if (rowsValues.length < 2) return [];

        const rawHeaders = rowsValues[0];
        const mapping = mapHeaders(rawHeaders);

        const rows: RawProductRow[] = [];

        for (let i = 1; i < rowsValues.length; i++) {
            const values = rowsValues[i];
            if (values.length < 2) continue; // skip degenerate rows

            // Build raw object with all columns preserved
            const rawObj: Record<string, string> = {};
            rawHeaders.forEach((h, idx) => {
                rawObj[h] = values[idx]?.trim() ?? '';
            });

            // Extract canonical fields
            const name = getValue(values, mapping, 'name');
            if (!name) continue; // skip rows with no product name

            // Derive ID — prefer explicit id field, fall back to barcode,
            // then sku, then position
            const id =
                getValue(values, mapping, 'id') ||
                getValue(values, mapping, 'barcode') ||
                getValue(values, mapping, 'sku') ||
                `row_${i}`;

            const barcode = getValue(values, mapping, 'barcode');
            const mpn     = getValue(values, mapping, 'mpn');
            const brand   = getValue(values, mapping, 'brand');
            const category = getValue(values, mapping, 'category');
            const sku = getValue(values, mapping, 'sku') || getValue(values, mapping, 'id') || id;

            // Price: try retail first, fall back to any price column
            let price_retail = parseNumber(getValue(values, mapping, 'price_retail'));
            const price_purchase  = parseNumber(getValue(values, mapping, 'price_purchase'));
            const price_wholesale = parseNumber(getValue(values, mapping, 'price_wholesale'));

            // If retail is 0, try wholesale
            if (price_retail === 0 && price_wholesale > 0) price_retail = price_wholesale;

            const stock       = parseNumber(getValue(values, mapping, 'stock'));
            const stock_status = getValue(values, mapping, 'stock_status');

            rows.push({
                id,
                name,
                brand,
                category,
                sku,
                barcode,
                mpn,
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
    diagnose(csvText: string): { delimiter: string; headers: string[]; mappedFields: string[]; unmappedHeaders: string[] } {
        if (!csvText?.trim()) return { delimiter: ',', headers: [], mappedFields: [], unmappedHeaders: [] };
        
        const firstLineBreak = csvText.indexOf('\n');
        const firstLine = firstLineBreak > -1 ? csvText.substring(0, firstLineBreak) : csvText;
        const delimiter = detectDelimiter(firstLine);
        
        const rowsValues = parseCsvLines(csvText.substring(0, Math.min(csvText.length, 5000)), delimiter);
        if (rowsValues.length === 0) return { delimiter, headers: [], mappedFields: [], unmappedHeaders: [] };
        
        const headers = rowsValues[0];
        const mapping = mapHeaders(headers);
        const mappedIndices = new Set(Object.values(mapping));

        return {
            delimiter,
            headers,
            mappedFields: Object.keys(mapping),
            unmappedHeaders: headers.filter((_, i) => !mappedIndices.has(i)),
        };
    }
};
