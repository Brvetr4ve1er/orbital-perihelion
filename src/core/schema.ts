import { z } from 'zod';

// ═══════════════════════════════════════════════════════════════════
// Canonical Product Schema
// Unifies the product model across all app components and parsers.
// ═══════════════════════════════════════════════════════════════════

export const ProductIdentitySchema = z.object({
    id: z.string(),
    brand: z.string(),
    model: z.string(),
    sku: z.string().nullable(),
    name: z.string(),
    category: z.string(),
    subcategory: z.string().nullable(),
    variant: z.string().nullable(),
    confidenceScore: z.number().min(0).max(1),
    brandSource: z.enum(['explicit', 'regex', 'unknown']).optional(),
    dataSource: z.array(z.string()),
    lastUpdated: z.string(),
});

export const ProductVisualSchema = z.object({
    heroImage: z.string(),
    gallery: z.array(z.string()),
    marketingVisuals: z.array(z.string()),
    videoUrl: z.string().nullable(),
    thumbnailUrl: z.string().nullable(),
    imageStatus: z.enum(['missing', 'present', 'pending']),
});

export const ProductTechnicalSchema = z.object({
    quickSpecs: z.object({
        screenSize: z.number().nullable(),
        resolution: z.object({ width: z.number().nullable(), height: z.number().nullable(), label: z.string() }),
        panelType: z.string(),
        refreshRate: z.string(),
        power: z.number().nullable(),
    }),
    display: z.object({
        brightness: z.string().nullable(),
        contrastRatio: z.string().nullable(),
        hdr: z.boolean(),
        hdrFormats: z.array(z.string()),
        viewingAngle: z.string().nullable(),
    }),
    smart: z.object({
        platform: z.string().nullable(),
        os: z.string().nullable(),
        processor: z.string().nullable(),
        ram: z.string().nullable(),
        storage: z.string().nullable(),
        voiceAssistants: z.array(z.string()),
    }),
    connectivity: z.object({
        wifi: z.boolean(),
        wifiSpec: z.string().nullable(),
        bluetooth: z.boolean(),
        btVersion: z.string().nullable(),
        hdmiPorts: z.number(),
        hdmiSpec: z.string().nullable(),
        usbPorts: z.number(),
        ethernet: z.boolean(),
        casting: z.array(z.string()),
    }),
    audio: z.object({
        output: z.string().nullable(),
        technology: z.array(z.string()),
        speakers: z.string().nullable(),
    }),
    comparisonTags: z.array(z.string()),
});

export const ProductCommercialSchema = z.object({
    priceRange: z.object({
        min: z.number().nullable(),
        max: z.number().nullable(),
        typical: z.number().nullable(),
        currency: z.string(),
    }),
    priceConfidence: z.enum(['estimated', 'unknown', 'verified']),
    priceSources: z.array(z.string()),
    availability: z.enum(['unknown', 'in_stock', 'out_of_stock']),
    warranty: z.string().nullable(),
    riskFlags: z.array(z.string()),
});

export const ProductStrategicSchema = z.object({
    productRole: z.string(),
    marginBehavior: z.string(),
    discountSensitivity: z.string(),
    bundleEligibility: z.boolean(),
    bundleRole: z.string().nullable(),
    seasonalRelevance: z.array(z.string()),
    targetAudience: z.array(z.string()),
    competitivePosition: z.string(),
});

export const ProductMarketingSchema = z.object({
    sellingAngles: z.array(z.string()),
    emotionalDrivers: z.array(z.string()),
    hooks: z.array(z.string()),
    captions: z.object({
        short: z.string().nullable(),
        medium: z.string().nullable(),
        long: z.string().nullable(),
    }),
    benefits_dz: z.array(z.string()),
    ramadanAngle: z.string().nullable(),
    adFormats: z.array(z.string()),
});

export const ProductRelationshipsSchema = z.object({
    complementary: z.array(z.string()),
    comparisons: z.array(z.object({ productId: z.string(), relationship: z.string() })),
    upgradePath: z.object({
        from: z.array(z.string()),
        to: z.array(z.string()),
    }),
    bundleFamilies: z.array(z.string()),
    alternatives: z.array(z.object({ productId: z.string(), reason: z.string() })),
});

export const ProductSchema = z.object({
    _meta: z.object({
        schemaVersion: z.string().optional(),
        schema: z.string().optional(),
        createdBy: z.string().optional(),
        fp: z.string().optional(),
        score: z.number().optional(),
        ts: z.string().optional(),
        lastAggregated: z.string().optional(),
    }),
    identity: ProductIdentitySchema,
    visual: ProductVisualSchema,
    technical: ProductTechnicalSchema,
    commercial: ProductCommercialSchema,
    strategic: ProductStrategicSchema,
    marketing: ProductMarketingSchema,
    relationships: ProductRelationshipsSchema,
    enrichment: z.object({
        description: z.string().optional(),
        seoDescription: z.string().optional(),
        competitorPrices: z.array(z.object({
            source: z.string(),
            url: z.string().optional(),
            price: z.number(),
            currency: z.string().optional(),
            availability: z.string().optional(),
            lastChecked: z.string().optional(),
        })).optional(),
        images: z.array(z.string()).optional(),
        videos: z.array(z.object({
            url: z.string(),
            platform: z.string(),
            thumbnail: z.string().optional(),
        })).optional(),
        sources: z.array(z.object({
            title: z.string().optional(),
            url: z.string(),
            snippet: z.string().optional(),
            domain: z.string().optional(),
            type: z.enum(['retailer', 'review', 'forum', 'official', 'news', 'general']).optional(),
        })).optional(),
        specs: z.record(z.string(), z.any()).optional(),
        intelligence: z.object({
            pros: z.array(z.string()),
            cons: z.array(z.string()),
            buyerFit: z.string(),
            featureScore: z.number(),
            pricePosition: z.enum(['budget', 'midrange', 'premium', 'unknown']).optional(),
            marketVerdict: z.string().optional(),
            sellingAngles: z.array(z.string()).optional(),
        }).optional(),
        metrics: z.object({
            sentiment: z.object({
                score: z.number(), // 0-100
                label: z.string(),
                highlights: z.array(z.string()),
            }).optional(),
            reviews: z.object({
                rating: z.number(),
                count: z.number(),
                distribution: z.record(z.string(), z.number()).optional(), // e.g. {"5": 100, "4": 20}
            }).optional(),
            market: z.object({
                meanPrice: z.number().optional(),
                priceVolatility: z.number().optional(),
                demandLevel: z.enum(['low', 'medium', 'high', 'viral']).optional(),
            }).optional(),
        }).optional(),
        /** EAN / barcode / UPC / GTIN extracted from CSV */
        barcode: z.string().optional(),
        /** Manufacturer Part Number extracted from CSV */
        mpn: z.string().optional(),
    }).optional(),
    observations: z.record(z.string(), z.array(z.object({
        v: z.any(),
        c: z.number(),
        s: z.string(),
        t: z.string(),
        m: z.string().optional(), // Method: direct, inference, lookup
    }))).optional(),
    consensus: z.record(z.string(), z.object({ v: z.any(), c: z.number(), flag: z.string().nullable() })).optional(),
    sources: z.record(z.string(), z.object({ lbl: z.string(), type: z.string(), trust: z.number() })).optional(),
    knowledge: z.object({ 
        insights: z.object({ 
            pros: z.array(z.string()), 
            cons: z.array(z.string()), 
            fit: z.string(),
            hooks: z.array(z.string()).optional(),
        }) 
    }).optional(),
    _searchIndex: z.string().optional(),
    _analytics: z.object({
        viewCount: z.number().default(0),
        lastViewed: z.string().optional(),
        relevanceScore: z.number().optional(),
    }).optional(),
});

export interface CategorySpec {
    label: string;
    icon: string;
    coreAttributes: Record<string, {
        label: string;
        unit: string | null;
        type: 'number' | 'enum' | 'boolean' | 'string' | 'tags';
        filterable: boolean;
        comparable: boolean;
        priority: number;
        options?: string[];
    }>;
    comparisonAxes: string[];
    proConsRules: {
        strongIf: Record<string, (a: any) => boolean>;
        weakIf: Record<string, (a: any) => boolean>;
    };
}

export type ProductIdentity = z.infer<typeof ProductIdentitySchema>;
export type ProductVisual = z.infer<typeof ProductVisualSchema>;
export type ProductTechnical = z.infer<typeof ProductTechnicalSchema>;
export type ProductCommercial = z.infer<typeof ProductCommercialSchema>;
export type ProductStrategic = z.infer<typeof ProductStrategicSchema>;
export type ProductMarketing = z.infer<typeof ProductMarketingSchema>;
export type ProductRelationships = z.infer<typeof ProductRelationshipsSchema>;
export type ProductEnrichment = NonNullable<z.infer<typeof ProductSchema>['enrichment']>;
export type Product = z.infer<typeof ProductSchema>;

