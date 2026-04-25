// ─────────────────────────────────────────────────────────────────────────────
// Graph System — Example Dataset Generator
// Generates realistic multi-category graph data for testing
// ─────────────────────────────────────────────────────────────────────────────

import type { GraphData, GraphNode, GraphLink, NodeGroup } from '../types';

// ─── Configuration ────────────────────────────────────────────────────────────

interface DatasetConfig {
  brandCount: number;
  categoriesPerBrand: number;
  productsPerCategory: number;
  tagsPerProduct: number;
  crossLinks: number;
}

const PRESET_CONFIGS: Record<string, DatasetConfig> = {
  small: {
    brandCount: 4,
    categoriesPerBrand: 3,
    productsPerCategory: 5,
    tagsPerProduct: 2,
    crossLinks: 20,
  },
  medium: {
    brandCount: 8,
    categoriesPerBrand: 5,
    productsPerCategory: 12,
    tagsPerProduct: 3,
    crossLinks: 80,
  },
  large: {
    brandCount: 15,
    categoriesPerBrand: 8,
    productsPerCategory: 20,
    tagsPerProduct: 4,
    crossLinks: 300,
  },
};

// ─── Name pools ───────────────────────────────────────────────────────────────

const BRAND_NAMES = [
  'Apex', 'Luminary', 'Vertex', 'Nexus', 'Prism', 'Solaris', 'Orbit',
  'Flux', 'Zenith', 'Aura', 'Nova', 'Helix', 'Quasar', 'Meridian', 'Epoch',
];
const CATEGORY_NAMES = [
  'Audio', 'Vision', 'Compute', 'Storage', 'Network', 'Power', 'Cooling',
  'Displays', 'Input', 'Security', 'Mobility', 'Imaging', 'Wearables',
];
const TAG_NAMES = [
  '#wireless', '#4K', '#AI', '#gaming', '#pro', '#budget', '#slim',
  '#RGB', '#fast', '#durable', '#eco', '#compact', '#flagship',
];
const PRODUCT_ADJECTIVES = [
  'Ultra', 'Pro', 'Max', 'Air', 'Lite', 'Edge', 'Core', 'Elite', 'Prime',
];

// ─── Generator ────────────────────────────────────────────────────────────────

function uuid(prefix: string, idx: number) {
  return `${prefix}-${idx.toString(36).padStart(4, '0')}`;
}

export function generateDataset(preset: keyof typeof PRESET_CONFIGS = 'medium'): GraphData {
  const cfg = PRESET_CONFIGS[preset];
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];
  const degreeMap: Map<string, number> = new Map();

  // Track node IDs per level for cross-links
  const brandIds: string[] = [];
  const categoryIds: string[] = [];
  const productIds: string[] = [];

  let linkIdx = 0;

  function addLink(sourceId: string, targetId: string, strength: 'strong' | 'normal' | 'weak' = 'normal') {
    links.push({
      id: `link-${linkIdx++}`,
      source: sourceId,
      target: targetId,
      strength,
    });
    degreeMap.set(sourceId, (degreeMap.get(sourceId) ?? 0) + 1);
    degreeMap.set(targetId, (degreeMap.get(targetId) ?? 0) + 1);
  }

  // ─── Tags (shared across products) ──────────────────────────────────────────
  const tagPool: GraphNode[] = TAG_NAMES.map((name, i) => ({
    id: uuid('tag', i),
    label: name,
    group: 'tag' as NodeGroup,
    degree: 0,
  }));
  nodes.push(...tagPool);

  // ─── Brands ─────────────────────────────────────────────────────────────────
  for (let b = 0; b < cfg.brandCount; b++) {
    const brandId = uuid('brand', b);
    brandIds.push(brandId);
    nodes.push({
      id: brandId,
      label: BRAND_NAMES[b % BRAND_NAMES.length],
      group: 'brand',
      degree: 0,
      clusterId: brandId,
    });

    // ─── Categories ───────────────────────────────────────────────────────────
    for (let c = 0; c < cfg.categoriesPerBrand; c++) {
      const catId = uuid('cat', b * cfg.categoriesPerBrand + c);
      categoryIds.push(catId);
      nodes.push({
        id: catId,
        label: CATEGORY_NAMES[(b * cfg.categoriesPerBrand + c) % CATEGORY_NAMES.length],
        group: 'category',
        degree: 0,
        clusterId: brandId,
      });
      addLink(brandId, catId, 'strong');

      // ─── Products ─────────────────────────────────────────────────────────
      for (let p = 0; p < cfg.productsPerCategory; p++) {
        const prodIdx = b * cfg.categoriesPerBrand * cfg.productsPerCategory
          + c * cfg.productsPerCategory + p;
        const prodId = uuid('prod', prodIdx);
        productIds.push(prodId);
        const adj = PRODUCT_ADJECTIVES[prodIdx % PRODUCT_ADJECTIVES.length];
        const catName = CATEGORY_NAMES[(b * cfg.categoriesPerBrand + c) % CATEGORY_NAMES.length];
        nodes.push({
          id: prodId,
          label: `${BRAND_NAMES[b % BRAND_NAMES.length]} ${adj} ${catName} ${p + 1}`,
          group: 'product',
          degree: 0,
          clusterId: brandId,
          meta: {
            brand: BRAND_NAMES[b % BRAND_NAMES.length],
            category: catName,
            price: Math.round(49 + Math.random() * 2000),
            stock: Math.round(Math.random() * 500),
          },
        });
        addLink(catId, prodId, 'normal');

        // Tags
        for (let t = 0; t < cfg.tagsPerProduct; t++) {
          const tagNode = tagPool[(prodIdx + t) % tagPool.length];
          addLink(prodId, tagNode.id, 'weak');
        }
      }
    }
  }

  // ─── Cross-brand links ───────────────────────────────────────────────────
  for (let x = 0; x < cfg.crossLinks; x++) {
    const a = productIds[Math.floor(Math.random() * productIds.length)];
    const b = productIds[Math.floor(Math.random() * productIds.length)];
    if (a !== b) {
      addLink(a, b, 'weak');
    }
  }

  // ─── Assign degrees ──────────────────────────────────────────────────────
  for (const node of nodes) {
    node.degree = degreeMap.get(node.id) ?? 0;
  }

  return { nodes, links };
}

// ─── Preset exports ───────────────────────────────────────────────────────────

export const GRAPH_PRESETS = {
  small: () => generateDataset('small'),
  medium: () => generateDataset('medium'),
  large: () => generateDataset('large'),
};
