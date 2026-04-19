import { Product } from '../core/schema';
import { CURATED_DB } from './curated-db';

/**
 * Enrichment Service
 * Ported from legacy core-engine.js and product-enrichments.js.
 * Handles brand detection, category classification, and fact consensus.
 */
export const EnrichmentService = {
    KNOWN_BRANDS: [
        'SAMSUNG', 'HISENSE', 'MIDEA', 'TCL', 'IRIS', 'CONDOR', 'GEANT',
        'MULTISMART', 'SCHALLENGE', 'ARCODYM', 'CONTIGLOBAL', 'CONTI GLOBAL',
        'SONIFER', 'MOULINEX', 'TEFAL', 'BRANDT', 'ARTCOOL', 'BRENT',
        'CRISTOR', 'ELECTROGAS', 'GENERAL', 'WINOR', 'RAYLAN', 'HYUNDAI',
        'BEKO', 'HOOVER', 'ARISTON', 'HOTPOINT', 'THOMSON', 'BOOMAX',
        'MEGATRONICS', 'KENWOOD', 'BERGHAM', 'BERGMANN', 'FIRAX',
        'DIGITECH', 'CRRAFT', 'CRAFT', 'MOSER', 'MOZER', 'STARMAN',
        'WESTCROWN', 'BOMANN', 'CAMRY', 'LUXINOX', 'MESKO', 'NOVACEL',
        'KRUPS', 'ROYALTYLINE', 'NEWSTAR', 'COBRA', 'EAGLFLY', 'TOYOTA',
    ],

    CATEGORY_PATTERNS: [
        { pattern: /\bMICRO[- ]?ONDE/i, id: 'microwave', label: 'Micro-Ondes' },
        { pattern: /\bMACHINE\s+A\s+LAVER/i, id: 'washing_machine', label: 'Machine à Laver' },
        { pattern: /\bLAVE\s+LINGE/i, id: 'washing_machine', label: 'Machine à Laver' },
        { pattern: /\bMACHINE\s+A\s+VAISSELLE/i, id: 'dishwasher', label: 'Lave-Vaisselle' },
        { pattern: /\bFOUR[- ]?ENCASTRABL/i, id: 'builtin_oven', label: 'Four Encastrable' },
        { pattern: /\bFOUR[- ]?ELECTRIQUE/i, id: 'electric_oven', label: 'Four Électrique' },
        { pattern: /\bPLAQUE[- ]?CHAUFFANT/i, id: 'cooktop', label: 'Plaque Chauffante' },
        { pattern: /\bCLIMATISEUR/i, id: 'ac', label: 'Climatiseur' },
        { pattern: /\bCONGELATEUR/i, id: 'freezer', label: 'Congélateur' },
        { pattern: /\bREFRIGE?RATEUR/i, id: 'refrigerator', label: 'Réfrigérateur' },
        { pattern: /\bREFRIGRATEUR/i, id: 'refrigerator', label: 'Réfrigérateur' },
        { pattern: /\bCUIS(?:INIERE|\b[- ])/i, id: 'cooker', label: 'Cuisinière' },
        { pattern: /\bTV\b/i, id: 'tv', label: 'Télévision' },
        // Small Appliances
        { pattern: /\bPETRIN/i, id: 'mixer', label: 'Pétrin/Batteur' },
        { pattern: /\bBATTEUR/i, id: 'mixer', label: 'Pétrin/Batteur' },
        { pattern: /\bBLENDER/i, id: 'blender', label: 'Blender' },
        { pattern: /\bFRITEUSE/i, id: 'fryer', label: 'Friteuse' },
        { pattern: /\bASPIRATEUR/i, id: 'vacuum', label: 'Aspirateur' },
        { pattern: /\bFER\s+(?:A|À)/i, id: 'iron', label: 'Fer à Repasser' },
        { pattern: /\bSECHE[- ]?CHEVEUX/i, id: 'hair_dryer', label: 'Sèche-Cheveux' },
        { pattern: /\bBOULOIRE|\bBOUILLOIRE/i, id: 'kettle', label: 'Bouilloire' },
        { pattern: /\bHACHOIR/i, id: 'blender', label: 'Hachoir' },
        { pattern: /\bMOULINETTE/i, id: 'blender', label: 'Hachoir' },
        { pattern: /\bCAFETIER|\bCAFITIER/i, id: 'coffee_machine', label: 'Cafetière' },
        { pattern: /\bTOASTER/i, id: 'toaster', label: 'Toaster' },
        { pattern: /\bPANINEUSE|\bGRILL/i, id: 'toaster', label: 'Panineuse/Grill' },
        { pattern: /\bCOCOTTE/i, id: 'small_appliance', label: 'Cocotte' },
        { pattern: /\bFONTAINE/i, id: 'small_appliance', label: 'Fontaine' },
        { pattern: /\bCHAUFFE\s+BAIN|\bCHAUFF\s+BAIN/i, id: 'small_appliance', label: 'Chauffe-Bain' },
        { pattern: /\bHOTTE/i, id: 'small_appliance', label: 'Hotte' },
        { pattern: /\bJUICER/i, id: 'blender', label: 'Extracteur de Jus' },
        // Expanded Patterns [P1-3]
        { pattern: /\bPLANCHA/i, id: 'small_appliance', label: 'Plancha' },
        { pattern: /\bCREPIE?RE/i, id: 'small_appliance', label: 'Crêpière' },
        { pattern: /\bGAFRIERE/i, id: 'small_appliance', label: 'Gaufrier' },
        { pattern: /\bPRESSE\s+AGRUME/i, id: 'small_appliance', label: 'Presse-Agrume' },
        { pattern: /\bEPILATEUR/i, id: 'beauty', label: 'Épilateur' },
        { pattern: /\bTONDEUSE/i, id: 'beauty', label: 'Tondeuse' },
        { pattern: /\bBALANCE/i, id: 'small_appliance', label: 'Balance de Cuisine' },
        { pattern: /\bSARTOR[iy]US/i, id: 'small_appliance', label: 'Balance de Précision' },
    ],

    BRAND_DESCRIPTIONS: {
        SAMSUNG: 'Marque premium mondiale reconnue pour l\'innovation et la qualité durable.',
        HISENSE: 'Marque chinoise offrant un excellent rapport qualité/prix sur le marché algérien.',
        MIDEA: 'Leader mondial de l\'électroménager, connu pour la fiabilité et les prix compétitifs.',
        TCL: 'Marque technologique en forte croissance, spécialisée dans les écrans.',
        IRIS: 'Marque algérienne populaire avec une gamme complète d\'électroménager.',
        CONDOR: 'Fabricant algérien de référence, réseau SAV étendu à travers le pays.',
        GEANT: 'Marque algérienne très populaire, large gamme et prix accessibles.',
        DEFAULT: 'Marque d\'électroménager disponible sur le marché algérien.',
    } as Record<string, string>,

    ATTR_BUILDERS: {
        tv: (nums: any, flags: any) => ({
            screen_size: (nums.size_or_feux || 43) + '"',
            resolution: (nums.size_or_feux || 43) >= 50 ? '4K UHD' : 'FHD',
            panel_type: flags.qled ? 'QLED' : 'LED',
            os: flags.smart ? 'Google TV' : 'Sans OS'
        }),
        washing_machine: (nums: any) => ({
            capacity: (nums.capacity_kg || 8) + ' KG',
            motor: 'Inverter',
            programs: 15
        }),
        other: () => ({ status: 'Verified', warranty: '24 Months' })
    } as Record<string, Function>,

    detectBrand(name: string): string {
        if (!name) return 'Inconnu';
        const upper = name.toUpperCase();
        for (const brand of this.KNOWN_BRANDS) {
            if (upper.includes(brand)) return brand;
        }
        return 'Inconnu';
    },

    detectCategory(name: string): { id: string, label: string } {
        if (!name) return { id: 'other', label: 'Autre' };
        const upper = name.toUpperCase();
        for (const cp of this.CATEGORY_PATTERNS) {
            if (cp.pattern.test(upper)) return { id: cp.id, label: cp.label };
        }
        return { id: 'other', label: 'Autre' };
    },

    extractSpecs(name: string, categoryId: string): Record<string, any> {
        const upper = name.toUpperCase();
        const specs: Record<string, any> = {};

        const screenMatch = upper.match(/(\d{2})P\b/);
        if (screenMatch) specs.size_or_feux = parseInt(screenMatch[1]);

        const kgMatch = upper.match(/(\d+(?:\.\d+)?)\s*KG?\b/);
        if (kgMatch) specs.capacity_kg = parseFloat(kgMatch[1]);

        return specs;
    },

    getBrandDescription(brand: string) {
        const key = brand.toUpperCase();
        return this.BRAND_DESCRIPTIONS[key] || this.BRAND_DESCRIPTIONS.DEFAULT;
    },

    parseFlags(name: string) {
        const upper = name.toUpperCase();
        return {
            smart: /SMART|GOOGLE\s+TV|VIDAA|ANDROID/i.test(upper),
            inox: /INOX/i.test(upper),
            qled: /QLED/i.test(upper),
            encastrable: /ENCASTRABLE/i.test(upper),
        };
    },

    appendObservation(p: any, key: string, val: any, conf = 0.8, src = "src_engine_v1", method = "regex") {
        const ts = new Date().toISOString();
        if (!p.observations) p.observations = {};
        if (!p.observations[key]) p.observations[key] = [];

        const existing = p.observations[key].find((o: any) => o.s === src && o.v === val);
        if (!existing) {
            p.observations[key].push({ v: val, c: conf, s: src, m: method, t: ts });
        }
    },

    enrich(product: Product): Product {
        const p = JSON.parse(JSON.stringify(product));
        const src = "src_enrichment_v2";
        const ts = new Date().toISOString();

        if (!p._meta) p._meta = {};
        const name = p.identity.name;

        // 1. Brand — respect explicit CSV source (conf:1.0), only run regex if brand is unknown
        if (p.identity.brandSource !== 'explicit') {
            const detected = this.detectBrand(name);
            if (detected !== 'Inconnu') {
                // Regex-inferred brand — conf: 0.75
                p.identity.brand = detected;
                p.identity.brandSource = 'regex';
                this.appendObservation(p, 'brand', detected, 0.75, src, 'regex');
            } else {
                // No match — keep as-is but ensure observation reflects low confidence
                if (!p.observations?.brand?.length) {
                    this.appendObservation(p, 'brand', p.identity.brand || 'Inconnu', 0.3, src, 'fallback');
                }
            }
        }
        // Explicit brand is already at conf:1.0 from product-adapter, no action needed

        // Category detection (unchanged — only if not already classified)
        if (!p.identity.category || p.identity.category === 'other') {
            const cat = this.detectCategory(name);
            p.identity.category = cat.id;
        }

        // 2. Auto-Enrichment via Regex & Builders
        const flags = this.parseFlags(name);
        const specs = this.extractSpecs(name, p.identity.category);

        const builder = this.ATTR_BUILDERS[p.identity.category] || this.ATTR_BUILDERS.other;
        const autoAttrs = builder(specs, flags);

        Object.entries(autoAttrs).forEach(([k, v]) => this.appendObservation(p, k, v, 0.8, src, "auto"));

        // Add description
        const desc = `${p.identity.category.toUpperCase()} ${p.identity.brand}. ${this.getBrandDescription(p.identity.brand)}`;
        this.appendObservation(p, 'description', desc, 0.8, src, "auto");

        // 2.5 Curated DB overlay
        const curated = CURATED_DB.find(db => 
            db.matchPatterns.some(pattern => new RegExp(pattern, 'i').test(name))
        );
        if (curated) {
            p.identity.category = curated.categoryId; // Force override
            this.appendObservation(p, 'description', curated.description, 1.0, 'curated_db', 'exact_match');
            Object.entries(curated.coreAttributes).forEach(([k, v]) => {
                if (v !== null) this.appendObservation(p, k, v, 1.0, 'curated_db', 'exact_match');
            });
            p.enrichment = p.enrichment || {};
            p.enrichment.competitorPrices = curated.competitorPrices;
        }

        // 3. Final Consensus
        this.computeConsensus(p);
        p._meta.score = this.calculateScore(p);
        p._meta.ts = ts;

        return p;
    },

    computeConsensus(p: any) {
        p.consensus = {};
        if (!p.observations) return;

        Object.entries(p.observations).forEach(([key, obsList]: [string, any]) => {
            if (!obsList || obsList.length === 0) return;

            const clusters: Record<string, any> = {};
            obsList.forEach((obs: any) => {
                const valKey = JSON.stringify(obs.v);
                if (!clusters[valKey]) clusters[valKey] = { v: obs.v, sources: new Set(), maxConf: 0, count: 0 };
                clusters[valKey].sources.add(obs.s);
                clusters[valKey].count++;
                if (obs.c > clusters[valKey].maxConf) clusters[valKey].maxConf = obs.c;
            });

            const winner = Object.values(clusters).sort((a: any, b: any) => b.maxConf - a.maxConf)[0];
            p.consensus[key] = { v: winner.v, c: winner.maxConf, flag: null };
        });
        p._meta.lastAggregated = new Date().toISOString();
    },

    calculateScore(p: any): number {
        const specs = Object.values(p.consensus) as any[];
        if (specs.length === 0) return 0.5;
        const sum = specs.reduce((acc, f) => acc + (f.c || 0), 0);
        return Math.round((sum / specs.length) * 100) / 100;
    }
};
