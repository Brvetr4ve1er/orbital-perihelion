import { Product } from './schema';

/**
 * PKOS CSV Parser
 * Handles parsing and exporting of the PKOS-specific CSV template.
 */
export const PKOSCsvParser = {
    parse(csvText: string): any[] {
        const lines = csvText.split('\n');
        if (lines.length < 2) return [];

        // Use quote-aware parsing for header line to handle quoted column names
        const headers = this.parseCSVRow(lines[0]).map(h => h.trim().toUpperCase());
        const results = [];

        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            const values = this.parseCSVRow(lines[i]);
            const row: any = {};
            headers.forEach((h, idx) => {
                row[h] = values[idx] || '';
            });
            results.push(row);
        }
        return results;
    },

    parseCSVRow(line: string): string[] {
        const values = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                values.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        values.push(current.trim());
        return values;
    },

    exportCSV(products: Product[]): string {
        const headers = ['ID', 'BRAND', 'MODEL', 'NAME', 'CATEGORY', 'PRICE_RETAIL', 'STOCK'];
        const rows = products.map(p => {
            const consensus = p.consensus || {};
            const retail = p.commercial.priceRange.typical || 0;
            const stock = consensus.stock?.v || 0;
            return [
                p.identity.id,
                p.identity.brand,
                p.identity.model,
                `"${p.identity.name}"`,
                p.identity.category,
                retail,
                stock
            ].join(',');
        });
        return [headers.join(','), ...rows].join('\n');
    }
};
