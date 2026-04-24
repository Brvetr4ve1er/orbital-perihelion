/**
 * Sample-data seeder — generates a realistic catalog so first-time users
 * can explore every view without needing a real CSV. Runs through the same
 * adapter + enrichment path as a real import.
 */
import { ProductAdapter } from '../core/product-adapter';
import { EnrichmentService } from './enrichment';
import { Product } from '../core/schema';
import { buildSearchIndex } from '../core/search-index';

const ROWS = [
    { name: 'TV SAMSUNG 55P QLED 4K SMART',            brand: 'SAMSUNG', price_purchase: 78000,  price_retail: 119000, stock: 12 },
    { name: 'TV HISENSE 65P LED 4K GOOGLE TV',         brand: 'HISENSE', price_purchase: 92000,  price_retail: 129000, stock: 8  },
    { name: 'TV TCL 43P FHD ANDROID',                   brand: 'TCL',     price_purchase: 34000,  price_retail: 47000,  stock: 20 },
    { name: 'TV CONDOR 50P 4K UHD',                     brand: 'CONDOR',  price_purchase: 48000,  price_retail: 69000,  stock: 15 },
    { name: 'MACHINE A LAVER SAMSUNG 8KG INVERTER',     brand: 'SAMSUNG', price_purchase: 72000,  price_retail: 98000,  stock: 6  },
    { name: 'MACHINE A LAVER IRIS 7KG',                 brand: 'IRIS',    price_purchase: 39000,  price_retail: 56000,  stock: 11 },
    { name: 'REFRIGERATEUR HISENSE 450L INOX NO FROST', brand: 'HISENSE', price_purchase: 95000,  price_retail: 135000, stock: 4  },
    { name: 'REFRIGERATEUR CONDOR 350L',                brand: 'CONDOR',  price_purchase: 62000,  price_retail: 89000,  stock: 9  },
    { name: 'CLIMATISEUR MIDEA 12000 BTU INVERTER',     brand: 'MIDEA',   price_purchase: 68000,  price_retail: 95000,  stock: 7  },
    { name: 'CLIMATISEUR CONDOR 9000 BTU',              brand: 'CONDOR',  price_purchase: 44000,  price_retail: 62000,  stock: 13 },
    { name: 'FOUR ELECTRIQUE MOULINEX 42L',             brand: 'MOULINEX',price_purchase: 18000,  price_retail: 27000,  stock: 22 },
    { name: 'MICRO ONDES SAMSUNG 28L GRILL',            brand: 'SAMSUNG', price_purchase: 22000,  price_retail: 33000,  stock: 18 },
    { name: 'BLENDER KENWOOD 1.5L 800W',                brand: 'KENWOOD', price_purchase: 7500,   price_retail: 12000,  stock: 30 },
    { name: 'FRITEUSE TEFAL 4L SANS HUILE',             brand: 'TEFAL',   price_purchase: 14000,  price_retail: 21000,  stock: 16 },
    { name: 'BOUILLOIRE MOULINEX 1.7L INOX',            brand: 'MOULINEX',price_purchase: 3800,   price_retail: 6500,   stock: 42 },
    { name: 'CAFETIERE KRUPS EXPRESSO 15 BAR',          brand: 'KRUPS',   price_purchase: 28000,  price_retail: 42000,  stock: 9  },
    { name: 'ASPIRATEUR HOOVER 2400W',                  brand: 'HOOVER',  price_purchase: 12000,  price_retail: 19000,  stock: 14 },
    { name: 'FER A REPASSER TEFAL VAPEUR 2400W',        brand: 'TEFAL',   price_purchase: 5200,   price_retail: 8900,   stock: 25 },
    { name: 'SECHE CHEVEUX BOMANN 2200W IONIC',         brand: 'BOMANN',  price_purchase: 3200,   price_retail: 5500,   stock: 38 },
    { name: 'PETRIN KENWOOD 1000W 5L',                  brand: 'KENWOOD', price_purchase: 32000,  price_retail: 47000,  stock: 5  },
    { name: 'PLAQUE CHAUFFANTE IRIS 4 FEUX INDUCTION',  brand: 'IRIS',    price_purchase: 29000,  price_retail: 42000,  stock: 7  },
    { name: 'HOTTE ASPIRANTE BRANDT 60CM INOX',         brand: 'BRANDT',  price_purchase: 18500,  price_retail: 27000,  stock: 10 },
    { name: 'LAVE VAISSELLE BEKO 12 COUVERTS',          brand: 'BEKO',    price_purchase: 68000,  price_retail: 94000,  stock: 3  },
    { name: 'CONGELATEUR HISENSE 220L',                 brand: 'HISENSE', price_purchase: 52000,  price_retail: 74000,  stock: 6  },
];

export function generateSampleProducts(): Product[] {
    const products: Product[] = [];
    for (const row of ROWS) {
        const id = `sample_${Math.random().toString(36).slice(2, 9)}`;
        const raw = { ...row, id, sku: id.toUpperCase() };
        const normalized = ProductAdapter.normalize(raw);
        const enriched = EnrichmentService.enrich(normalized) as Product;
        enriched._searchIndex = buildSearchIndex(enriched);
        products.push(enriched);
    }
    return products;
}
