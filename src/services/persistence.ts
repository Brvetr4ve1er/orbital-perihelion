/**
 * Persistence Service — IndexedDB via `idb` library
 * [PH4-B] Replaces localStorage for product storage.
 *
 * Industry standard: idb by Jake Archibald (Google Chrome team).
 * Provides a Promise-based wrapper over IndexedDB with no size limits
 * vs localStorage's 5-10MB quota.
 *
 * Falls back gracefully to localStorage if IDB is unavailable
 * (e.g. Safari private mode, certain embedded browsers).
 */
import { openDB, IDBPDatabase } from 'idb';
import { Product } from '../core/schema';

const DB_NAME = 'pkos_v2';
const DB_VERSION = 2;
const STORE_PRODUCTS = 'products';
const STORE_META = 'meta';
const STORE_SALES = 'sales';

let _db: IDBPDatabase | null = null;

export const SALES_STORE = STORE_SALES;

export async function getDB(): Promise<IDBPDatabase | null> {
    if (_db) return _db;
    try {
        _db = await openDB(DB_NAME, DB_VERSION, {
            upgrade(db) {
                if (!db.objectStoreNames.contains(STORE_PRODUCTS)) {
                    db.createObjectStore(STORE_PRODUCTS, { keyPath: 'identity.id' });
                }
                if (!db.objectStoreNames.contains(STORE_META)) {
                    db.createObjectStore(STORE_META);
                }
                if (!db.objectStoreNames.contains(STORE_SALES)) {
                    const s = db.createObjectStore(STORE_SALES, { keyPath: 'id', autoIncrement: true });
                    s.createIndex('sku',  'sku');
                    s.createIndex('date', 'date');
                }
            },
        });
        return _db;
    } catch (e) {
        console.warn('[Persistence] IndexedDB unavailable, falling back to localStorage:', e);
        return null;
    }
}

export const Persistence = {
    /**
     * Saves all products to IndexedDB, replacing existing data.
     * Used ONLY for full imports where the entire catalog is being replaced.
     * For incremental mutations (delete, price adjust), use deleteMany/putMany.
     */
    async saveAll(products: Product[]): Promise<void> {
        const db = await getDB();
        if (db) {
            try {
                const tx = db.transaction(STORE_PRODUCTS, 'readwrite');
                await tx.store.clear();
                await Promise.all(products.map(p => tx.store.put(p)));
                await tx.done;
                await db.put(STORE_META, new Date().toISOString(), 'lastSaved');
            } catch (e: any) {
                if (e?.name === 'QuotaExceededError' || e?.message?.includes('quota')) {
                    console.error(`[Persistence] IndexedDB quota exceeded while saving ${products.length} products.`);
                } else {
                    console.error('[Persistence] saveAll failed:', e);
                }
            }
        } else {
            try {
                localStorage.setItem('pkos_inventory', JSON.stringify(products));
            } catch (e) {
                console.error('[Persistence] localStorage quota exceeded:', e);
            }
        }
    },

    /**
     * Deletes specific products by ID. Safe: never touches other records.
     * Falls back to full rewrite in localStorage mode.
     */
    async deleteMany(ids: string[]): Promise<void> {
        if (!ids.length) return;
        const db = await getDB();
        if (db) {
            try {
                const tx = db.transaction(STORE_PRODUCTS, 'readwrite');
                await Promise.all(ids.map(id => tx.store.delete(id)));
                await tx.done;
            } catch (e) {
                console.error('[Persistence] deleteMany failed:', e);
            }
        } else {
            // localStorage fallback: full rewrite (unavoidable)
            try {
                const raw = localStorage.getItem('pkos_inventory');
                const all: Product[] = raw ? JSON.parse(raw) : [];
                const idSet = new Set(ids);
                localStorage.setItem('pkos_inventory', JSON.stringify(all.filter(p => !idSet.has(p.identity.id))));
            } catch (e) {
                console.error('[Persistence] localStorage deleteMany failed:', e);
            }
        }
    },

    /**
     * Upserts multiple products without clearing. Safe for bulk price adjustments.
     */
    async putMany(products: Product[]): Promise<void> {
        if (!products.length) return;
        const db = await getDB();
        if (db) {
            try {
                const tx = db.transaction(STORE_PRODUCTS, 'readwrite');
                await Promise.all(products.map(p => tx.store.put(p)));
                await tx.done;
            } catch (e: any) {
                if (e?.name === 'QuotaExceededError' || e?.message?.includes('quota')) {
                    console.error(`[Persistence] IndexedDB quota exceeded on putMany (${products.length} items).`);
                } else {
                    console.error('[Persistence] putMany failed:', e);
                }
            }
        } else {
            try {
                const raw = localStorage.getItem('pkos_inventory');
                const existing: Product[] = raw ? JSON.parse(raw) : [];
                const existingMap = new Map(existing.map(p => [p.identity.id, p]));
                for (const p of products) {
                    existingMap.set(p.identity.id, p);
                }
                localStorage.setItem('pkos_inventory', JSON.stringify(Array.from(existingMap.values())));
            } catch (e) {
                console.error('[Persistence] localStorage putMany failed:', e);
            }
        }
    },

    /**
     * Loads all products from IndexedDB.
     * On first load, migrates any legacy localStorage data to IDB.
     */
    async loadAll(): Promise<Product[]> {
        const db = await getDB();
        if (db) {
            const products: Product[] = await db.getAll(STORE_PRODUCTS);

            // [PH4-B] One-time migration: if IDB is empty, check legacy localStorage
            if (products.length === 0) {
                const legacy = localStorage.getItem('pkos_inventory');
                if (legacy) {
                    try {
                        const parsed: Product[] = JSON.parse(legacy);
                        if (parsed.length > 0 && parsed[0].identity) {
                            console.log(`[Persistence] Migrating ${parsed.length} products from localStorage → IndexedDB`);
                            await this.saveAll(parsed);
                            localStorage.removeItem('pkos_inventory');
                            return parsed;
                        }
                    } catch (e) {
                        console.warn('[Persistence] Legacy migration failed:', e);
                        localStorage.removeItem('pkos_inventory');
                    }
                }
            }
            return products;
        } else {
            // localStorage fallback
            try {
                const raw = localStorage.getItem('pkos_inventory');
                return raw ? JSON.parse(raw) : [];
            } catch {
                return [];
            }
        }
    },

    /**
     * Updates a single product in-place.
     * Much faster than saveAll() for individual AI enrichment updates.
     */
    async updateOne(product: Product): Promise<void> {
        const db = await getDB();
        if (db) {
            try {
                await db.put(STORE_PRODUCTS, product);
            } catch (e: any) {
                if (e?.name === 'QuotaExceededError' || e?.message?.includes('quota')) {
                    console.error(
                        `[Persistence] IndexedDB quota exceeded on updateOne for ${product.identity?.name}. ` +
                        `Product enrichment data may be too large.`
                    );
                } else {
                    console.error('[Persistence] updateOne failed:', e);
                }
            }
        } else {
            // For localStorage fallback, we have to rewrite the whole array
            const all = await this.loadAll();
            const updated = all.map(p => p.identity.id === product.identity.id ? product : p);
            try {
                localStorage.setItem('pkos_inventory', JSON.stringify(updated));
            } catch (e) {
                console.error('[Persistence] localStorage quota exceeded on updateOne:', e);
            }
        }
    },

    /**
     * Completely clears all stored data.
     */
    async clear(): Promise<void> {
        const db = await getDB();
        if (db) {
            await db.clear(STORE_PRODUCTS);
            await db.delete(STORE_META, 'lastSaved');
        }
        localStorage.removeItem('pkos_inventory');
    },
};
