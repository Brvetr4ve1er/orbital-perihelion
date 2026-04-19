import { UniversalCSVParser } from './universal-csv-parser';
import { ProductAdapter } from './product-adapter';
import { EnrichmentService } from '../services/enrichment';

/**
 * Standalone Verification Utility for PKOS Parser
 * Run with: npx tsx src/core/verify-parser.ts
 */

const TEST_CASES = [
    {
        name: "Standard Semicolon (French)",
        csv: `Nom;Marque;Prix d'Achat;Prix de Vente (Détail);Quantité en Stock;Statut Stock
TV SAMSUNG 55U7;SAMSUNG;85000;120000;12;Normal
MACHINE A LAVER LG 7KG;LG;45000;65000;3;Faible`
    },
    {
        name: "Comma Delimited (English)",
        csv: `name,brand,price_purchase,price_retail,stock,status
HISENSE AC 12K,HISENSE,32000,48000,0,Rupture
IRIS TV 32,IRIS,12000,18500,25,Normal`
    },
    {
        name: "Quoted Fields with Delimiters",
        csv: `designation,price
"TV, SAMSUNG 43""",12000
"MIXER ""MOULINEX""",4500`
    },
    {
        name: "Malformed Headers (PROD fallback)",
        csv: `XYZ-PROD,COST-ABC,RETAIL-123,STOCK-99
Batteur Kenwood,4500,6800,10`
    }
];

function verify() {
    console.log("⚡ PKOS Parser Verification Suite");
    console.log("================================");

    TEST_CASES.forEach(tc => {
        console.log(`\nTesting: ${tc.name}`);
        const rows = UniversalCSVParser.parse(tc.csv);
        
        if (rows.length === 0) {
            console.error("  ❌ FAIL: No rows parsed");
            return;
        }

        console.log(`  ✅ Parsed ${rows.length} rows`);
        
        rows.forEach((row, i) => {
            const normalized = ProductAdapter.fromRawRow(row);
            const p = EnrichmentService.enrich(normalized);
            
            console.log(`  Row ${i + 1}: [${p.identity.category}] ${p.identity.name}`);
            console.log(`     Brand: ${p.identity.brand} (${p.identity.brandSource}) | Price: ${p.commercial.priceRange.typical} DZD`);
            
            if (p.identity.category === 'other' && !tc.name.includes('Quoted')) {
                console.warn(`     ⚠️ Warning: Categorized as 'other'`);
            }
        });
    });

    console.log("\n================================");
    console.log("Verification Complete");
}

verify();
