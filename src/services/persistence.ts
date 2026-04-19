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
const DB_VERSION = 1;
const STORE_PRODUCTS = 'products';
const STORE_META = 'meta';

let _db: IDBPDatabase | null = null;

async function getDB(): Promise<IDBPDatabase | null> {
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
     * Falls back to localStorage if IDB is unavailable.
     */
    async saveAll(products: Product[]): Promise<void> {
        const db = await getDB();
        if (db) {
            const tx = db.transaction(STORE_PRODUCTS, 'readwrite');
            // Clear the store first, then write fresh
            await tx.store.clear();
            await Promise.all(products.map(p => tx.store.put(p)));
            await tx.done;
            // Write a metadata entry with the save timestamp
            await db.put(STORE_META, new Date().toISOString(), 'lastSaved');
        } else {
            // localStorage fallback
            try {
                localStorage.setItem('pkos_inventory', JSON.stringify(products));
            } catch (e) {
                console.error('[Persistence] localStorage quota exceeded:', e);
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
            await db.put(STORE_PRODUCTS, product);
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
