import { Product, ProductSchema } from './schema';
import { RawProductRow } from './universal-csv-parser';
import { buildSearchIndex } from './search-index';

/**
 * Product Adapter v4.1
 * Normalizes RawProductRow (from UniversalCSVParser) into the CPO (Canonical Product Object).
 * Also handles legacy ad-hoc shapes from old parsers.
 */
export const ProductAdapter = {
    normalize(raw: any): Product {
        const ts = new Date().toISOString();

        // Support both the new RawProductRow and any legacy raw shape
        const id    = String(raw.id || raw.ID || raw.barcode || raw.SKU || Math.random().toString(36).substr(2, 9));
        const name  = raw.name || raw.NAME || raw.nom || raw.Nom || raw.designation || 'Produit sans nom';
        const brand = (raw.brand || raw.BRAND || raw.marque || raw.Marque || '').trim();
        const cat   = raw.category || raw.CATEGORY || raw.categorie || raw.Catégorie || 'other';
        const sku   = String(raw.sku || raw.SKU || raw.id || id);
        const barcode = String(raw.barcode || raw.ean || raw.EAN || raw.upc || raw.UPC || raw.gtin || raw.GTIN || raw['Code Barre'] || '');
        const mpn     = String(raw.mpn || raw.MPN || raw.model || raw.MODEL || '');

        const brandIsExplicit = brand.length > 0;

        const priceRetail   = Number(raw.price_retail  ?? raw.price_wholesale ?? raw['Prix de Vente (Détail)'] ?? raw.PRICE_RETAIL ?? 0) || 0;
        const pricePurchase = Number(raw.price_purchase ?? raw["Prix d'Achat"] ?? 0) || 0;
        const stockQty      = Number(raw.stock ?? raw.QTE ?? raw['Quantité en Stock'] ?? raw.STOCK ?? 0) || 0;

        const p_obj: any = {
            _meta: { schema: 'CPO v4.1', createdBy: 'Adapter', fp: id, ts },
            identity: {
                id,
                brand: brand || 'Inconnu',
                model: mpn || raw.model || raw.MODEL || sku,
                sku,
                name,
                category: cat,
                subcategory: raw.subcategory || null,
                variant: raw.variant || null,
                confidenceScore: 0.5,
                brandSource: brandIsExplicit ? 'explicit' : 'unknown',
                dataSource: ['import'],
                lastUpdated: ts,
            },
            visual: {
                heroImage: raw.image || '',
                gallery: [],
                marketingVisuals: [],
                videoUrl: null,
                thumbnailUrl: null,
                imageStatus: raw.image ? 'present' : 'missing',
            },
            technical: {
                quickSpecs: {
                    screenSize: raw.size || raw.screenSize || null,
                    resolution: { width: null, height: null, label: raw.resolution || 'Unknown' },
                    panelType: raw.panel || raw.panelType || 'LED',
                    refreshRate: raw.refreshRate || '60Hz',
                    power: null,
                },
                display:      { brightness: null, contrastRatio: null, hdr: false, hdrFormats: [], viewingAngle: null },
                smart:        { platform: null, os: null, processor: null, ram: null, storage: null, voiceAssistants: [] },
                connectivity: { wifi: false, wifiSpec: null, bluetooth: false, btVersion: null, hdmiPorts: 0, hdmiSpec: null, usbPorts: 0, ethernet: false, casting: [] },
                audio:        { output: null, technology: [], speakers: null },
                comparisonTags: [],
            },
            commercial: {
                priceRange: {
                    min: pricePurchase || null,
                    max: priceRetail || null,
                    typical: priceRetail || null,
                    currency: 'DZD',
                },
                priceConfidence: 'estimated',
                priceSources: ['internal'],
                availability: stockQty > 0 ? 'in_stock' : 'out_of_stock',
                warranty: '24 Months',
                riskFlags: [],
            },
            strategic: {
                productRole: raw.productRole || 'core',
                marginBehavior: 'balanced',
                discountSensitivity: 'medium',
                bundleEligibility: true,
                bundleRole: null,
                seasonalRelevance: [],
                targetAudience: [],
                competitivePosition: 'neutral',
            },
            marketing: {
                sellingAngles: [],
                emotionalDrivers: [],
                hooks: [],
                captions: { short: null, medium: null, long: null },
                benefits_dz: [],
                ramadanAngle: null,
                adFormats: [],
            },
            relationships: {
                complementary: [],
                comparisons: [],
                upgradePath: { from: [], to: [] },
                bundleFamilies: [],
                alternatives: [],
            },
            enrichment: {
                specs: raw._raw || {},
                barcode: barcode || undefined,
                mpn: mpn || undefined,
            },
        };

        // Store stock, price, and brand confidence as observations for the consensus layer
        p_obj.observations = p_obj.observations || {};
        p_obj.observations.stock = [{ v: stockQty, c: 1.0, s: 'inventory', m: 'direct', t: ts }];
        if (pricePurchase > 0) {
            p_obj.observations.price_purchase = [{ v: pricePurchase, c: 1.0, s: 'inventory', m: 'direct', t: ts }];
        }
        if (raw.stock_status) {
            p_obj.observations.stock_status = [{ v: raw.stock_status, c: 1.0, s: 'inventory', m: 'direct', t: ts }];
        }
        p_obj.observations.brand = [{
            v: brand || 'Inconnu',
            c: brandIsExplicit ? 1.0 : 0.3,
            s: brandIsExplicit ? 'csv_explicit' : 'unknown',
            m: 'direct',
            t: ts
        }];
        if (barcode) {
            p_obj.observations.barcode = [{ v: barcode, c: 1.0, s: 'inventory', m: 'direct', t: ts }];
        }
        if (mpn) {
            p_obj.observations.mpn = [{ v: mpn, c: 1.0, s: 'inventory', m: 'direct', t: ts }];
        }

        // [P0-4] Runtime Validation via Zod
        const result = ProductSchema.safeParse(p_obj);
        if (!result.success) {
            console.error(`[Adapter] Validation failed for product ${id}:`);
            result.error.issues.forEach(issue => {
                console.error(`  - [${issue.path.join('.')}] ${issue.message}`);
            });
            // Still compute search index for failed-validation products
            p_obj._searchIndex = buildSearchIndex(p_obj as Product);
            return p_obj as Product;
        }

        // Stamp the pre-computed search index
        const validated = result.data;
        (validated as any)._searchIndex = buildSearchIndex(validated);
        return validated;
    },

    fromRawRow(row: RawProductRow): Product {
        return this.normalize(row);
    },

    toLegacy(p: Product): any {
        const specs  = p.consensus || {};
        const fv = (k: string, def: any = null) => specs[k] ? specs[k].v : def;

        // [P1-2] Stock: prefer observation over commercial.availability
        const stockObs = p.observations?.stock?.[0];
        const stockQty = typeof stockObs?.v === 'number' ? stockObs.v : 0;

        // [P1-1] Margin: compute directly from prices, no consensus obs needed
        const retailPrice   = p.commercial.priceRange.typical || p.commercial.priceRange.max || 0;
        const purchasePrice = p.commercial.priceRange.min || 0;
        const margin = retailPrice > 0 && purchasePrice > 0
            ? Math.round(((retailPrice - purchasePrice) / retailPrice) * 100)
            : 0;

        // Stock status from raw CSV if available, else derive from quantity
        const csvStatus = p.observations?.stock_status?.[0]?.v as string | undefined;
        const stockStatus = csvStatus
            ? this._normalizeStockStatus(csvStatus)
            : stockQty > 5 ? 'Normal' : stockQty > 0 ? 'Faible' : 'Rupture';

        return {
            id:           p.identity.id,
            name:         p.identity.name,
            marque:       p.identity.brand,
            sku:          p.identity.sku,
            category: {
                id:    p.identity.category,
                label: this._categoryLabel(p.identity.category),
                icon:  this._categoryIcon(p.identity.category),
            },
            primarySpec: fv('screen_size') || fv('screenSize') || '',
            commercial: {
                retailPrice,
                purchasePrice,
                margin,
                stockQty,
                stockStatus,
            },
            enrichment: p.enrichment || {},
        };
    },

    _categoryIcon(cat: string): string {
        const icons: Record<string, string> = {
            tv: '📺', washing_machine: '🫧', refrigerator: '🧊',
            freezer: '🧊', ac: '❄️', microwave: '📡',
            dishwasher: '🫗', cooker: '🍳', electric_oven: '🔥',
            builtin_oven: '🔥', cooktop: '🔥',
            blender: '🫙', mixer: '⚙️', kettle: '☕',
            iron: '👔', vacuum: '🌀', fryer: '🍟',
            coffee_machine: '☕', toaster: '🍞',
            hair_dryer: '💨', beauty: '💅',
            small_appliance: '🔌', other: '📦',
        };
        return icons[cat?.toLowerCase()] || '📦';
    },

    _categoryLabel(cat: string): string {
        const labels: Record<string, string> = {
            tv: 'Télévision', washing_machine: 'Machine à Laver',
            refrigerator: 'Réfrigérateur', freezer: 'Congélateur',
            ac: 'Climatiseur', microwave: 'Micro-Ondes',
            dishwasher: 'Lave-Vaisselle', cooker: 'Cuisinière',
            electric_oven: 'Four Électrique', builtin_oven: 'Four Encastrable',
            cooktop: 'Plaque Chauffante', blender: 'Blender',
            mixer: 'Batteur/Pétrin', kettle: 'Bouilloire',
            iron: 'Fer à Repasser', vacuum: 'Aspirateur',
            fryer: 'Friteuse', coffee_machine: 'Cafetière',
            toaster: 'Toaster', hair_dryer: 'Sèche-Cheveux',
            beauty: 'Beauté & Soin', small_appliance: 'Petit Électroménager',
            other: 'Autre',
        };
        return labels[cat?.toLowerCase()] || cat || 'Autre';
    },

    _normalizeStockStatus(raw: string): string {
        const r = raw.toLowerCase().trim();
        if (r === 'rupture' || r === 'out_of_stock' || r === '0') return 'Rupture';
        if (r === 'faible' || r === 'low' || r === 'low_stock') return 'Faible';
        return 'Normal';
    }
};

