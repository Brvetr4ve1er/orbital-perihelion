import { Product } from './schema';
import { UniversalCSVParser } from './universal-csv-parser';
import { ProductAdapter } from './product-adapter';

/**
 * Unified Parser for PKOS Intelligence.
 *
 * Uses the UniversalCSVParser as the single ingestion path.
 * No fragile format detection — adapts to any CSV structure automatically.
 */
export const Parser = {
    /**
     * Parses any CSV text into normalized Product objects.
     * Accepts any delimiter, any column names, any language.
     */
    parse(csvText: string): Product[] {
        if (!csvText || csvText.trim().length === 0) return [];

        // Log detected format for debugging
        const diag = UniversalCSVParser.diagnose(csvText);
        console.log(`[Parser] Delimiter: "${diag.delimiter}" | Headers: ${diag.headers.length} | Mapped: ${diag.mappedFields.join(', ')}`);

        // Universal parse → normalize to CPO
        const rows = UniversalCSVParser.parse(csvText);

        if (rows.length === 0) {
            console.warn('[Parser] No rows extracted. File may be empty or have an unrecognized structure.');
            return [];
        }

        console.log(`[Parser] Extracted ${rows.length} rows → normalizing to CPO...`);
        return rows.map(row => ProductAdapter.fromRawRow(row));
    },
};
