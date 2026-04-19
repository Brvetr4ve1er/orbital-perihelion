import { Product } from './schema';

export interface ValidationReport {
    total: number;
    missingBrand: number;
    missingPrice: number;
}

export const ProductValidator = {
    /**
     * Validates and normalizes products after import.
     * Computes a validation report that can be shown as a toast.
     */
    validateAll(products: Product[]): { products: Product[], report: ValidationReport } {
        let missingBrand = 0;
        let missingPrice = 0;

        const validated = products.map(p => {
            let confidenceScore = p.identity.confidenceScore || 0.5;

            // Enforce brand
            if (!p.identity.brand || p.identity.brand.toLowerCase() === 'inconnu') {
                missingBrand++;
                confidenceScore = Math.min(confidenceScore, 0.3); // Penalty for unknown brand
            }

            // Enforce base price validity
            const typicalPrice = p.commercial?.priceRange?.typical || 0;
            if (typicalPrice <= 0) {
                missingPrice++;
            }

            // Ensure we never have a blank name making the UI break
            if (!p.identity.name || p.identity.name.trim() === '') {
                p.identity.name = "Produit sans nom";
            }

            p.identity.confidenceScore = confidenceScore;
            
            return p;
        });

        return {
            products: validated,
            report: {
                total: validated.length,
                missingBrand,
                missingPrice
            }
        };
    }
};
