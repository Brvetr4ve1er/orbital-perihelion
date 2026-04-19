/**
 * Import Web Worker — [PH4-C]
 *
 * Offloads the CSV parse + enrich + validate pipeline off the main thread.
 * Pattern: Vite native worker with `{ type: 'module' }` — zero config.
 *
 * Why: Without a worker, parsing + enriching 567 products blocks
 * the main thread for ~300-800ms, freezing the UI.
 * With a worker, the main thread stays interactive throughout.
 */
import { Parser } from '../core/parser';
import { EnrichmentService } from '../services/enrichment';
import { ProductValidator } from '../core/validator';

self.onmessage = (e: MessageEvent<{ csvText: string }>) => {
    const { csvText } = e.data;

    try {
        // Step 1: Parse the raw CSV text into Product objects
        const parsed = Parser.parse(csvText);

        if (parsed.length === 0) {
            self.postMessage({ type: 'error', message: 'Aucun produit extrait du fichier CSV.' });
            return;
        }

        // Step 2: Enrich each product (brand detection, category, specs)
        const enriched = parsed.map((p, i) => {
            // Post lightweight progress updates every 20 products
            if (i % 20 === 0) {
                self.postMessage({ type: 'progress', current: i, total: parsed.length });
            }
            return EnrichmentService.enrich(p);
        });

        // Step 3: Validate and harden (confidence scores, missing field detection)
        const { products, report } = ProductValidator.validateAll(enriched);

        self.postMessage({ type: 'success', products, report });
    } catch (err: any) {
        self.postMessage({ type: 'error', message: err?.message || 'Erreur inconnue lors du traitement.' });
    }
};
