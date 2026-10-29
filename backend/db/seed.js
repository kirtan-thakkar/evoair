/**
 * Seed data for EvoAir Storefront (UUID Enabled)
 * Includes complete Foundation, Blush, and Highlighter shade formulas
 */
import 'dotenv/config';
import { db, closeDb } from '../config/db.js';
import { env } from '../config/env.js';
import { products, productVariants } from './schema.js';

if (env.NODE_ENV === 'production') {
  console.error('❌ Cannot run seed in production environment!');
  process.exit(1);
}

export const SEED_PRODUCT_IDS = {
  EVOAIR: '00000000-0000-4000-8000-000000000001',
  EVO_FILLS: '00000000-0000-4000-8000-000000000002',
  EVO_BOTTLES: '00000000-0000-4000-8000-000000000003',
};

// Foundation Shades (10)
export const FOUNDATION_SHADES = [
  { code: '02', name: 'Halo', color: '#d8a978' },
  { code: '03', name: 'Flare', color: '#e7b894' },
  { code: '06', name: 'Serene', color: '#d19a57' },
  { code: '07', name: 'Astra', color: '#b18368' },
  { code: '10', name: 'Amber', color: '#c98a4a' },
  { code: '11', name: 'Dawn', color: '#b87543' },
  { code: '14', name: 'Cosmic', color: '#9b621f' },
  { code: '15', name: 'Stardusk', color: '#a96e3b' },
  { code: '18', name: 'Galaxy', color: '#8a542e' },
  { code: '19', name: 'Nebula', color: '#61341f' },
];

// Blush Shades (5)
export const BLUSH_SHADES = [
  { code: 'B01', name: 'Terra Nova', color: '#a84f34' },
  { code: 'B02', name: 'Sun Halo', color: '#ec7554' },
  { code: 'B03', name: 'Stellar Rose', color: '#d75068' },
  { code: 'B04', name: 'Comet Glow', color: '#e53935' },
  { code: 'B05', name: 'Pink Constellation', color: '#e98676' },
];

// Highlighter Shades (5)
export const HIGHLIGHTER_SHADES = [
  { code: 'H01', name: 'Moonveil', color: '#e9d9c6' },
  { code: 'H02', name: 'Cosmic Bronze', color: '#c7774a' },
  { code: 'H03', name: 'Sun Halo', color: '#dca46a' },
  { code: 'H04', name: 'Celestial Glow', color: '#e8c79d' },
  { code: 'H05', name: 'Rose Nebula', color: '#df8e9b' },
];

const seed = async () => {
  try {
    console.log('🌱 Starting database seeding with Foundation, Blush, and Highlighter formulas...');

    // 1. Insert product: EvoAir Device
    await db
      .insert(products)
      .values({
        id: SEED_PRODUCT_IDS.EVOAIR,
        name: 'EvoAir',
        slug: 'evoair',
        description: 'Flagship cordless micro-mist skincare and airbrush luxury device.',
        is_active: true,
      })
      .onConflictDoNothing({ target: products.slug });

    // 2. Insert product: Evo-Fills Refills
    await db
      .insert(products)
      .values({
        id: SEED_PRODUCT_IDS.EVO_FILLS,
        name: 'Evo-Fills Refills',
        slug: 'evo-fills',
        description: 'Sterile pre-filled formula capsules for flawless airbrushed misting.',
        is_active: true,
      })
      .onConflictDoNothing({ target: products.slug });

    // 3. Insert product: Evo-Bottles Empty
    await db
      .insert(products)
      .values({
        id: SEED_PRODUCT_IDS.EVO_BOTTLES,
        name: 'Evo-Bottles Empty',
        slug: 'evo-bottles',
        description: 'Pack of 20 empty refillable capsules compatible with your personal formulas.',
        is_active: true,
      })
      .onConflictDoNothing({ target: products.slug });

    const allVariants = [];

    // ── EvoAir Device Starter Variants (₹14,999) ──
    FOUNDATION_SHADES.forEach((s, idx) => {
      const numStr = String(idx + 1).padStart(2, '0');
      allVariants.push({
        id: `11111111-1111-4111-8111-0000000000${numStr}`,
        product_id: SEED_PRODUCT_IDS.EVOAIR,
        formula: 'foundation',
        shade_name: s.name,
        shade_code: s.code,
        color_hex: s.color,
        sku: `EVO-${numStr}`,
        price_paise: 1499900,
        stock_qty: 50,
      });
    });

    BLUSH_SHADES.forEach((s, idx) => {
      const numStr = String(11 + idx).padStart(2, '0');
      allVariants.push({
        id: `11111111-1111-4111-8111-0000000000${numStr}`,
        product_id: SEED_PRODUCT_IDS.EVOAIR,
        formula: 'blush',
        shade_name: s.name,
        shade_code: s.code,
        color_hex: s.color,
        sku: `EVO-${s.code}`,
        price_paise: 1499900,
        stock_qty: 40,
      });
    });

    HIGHLIGHTER_SHADES.forEach((s, idx) => {
      const numStr = String(21 + idx).padStart(2, '0');
      allVariants.push({
        id: `11111111-1111-4111-8111-0000000000${numStr}`,
        product_id: SEED_PRODUCT_IDS.EVOAIR,
        formula: 'highlighter',
        shade_name: s.name,
        shade_code: s.code,
        color_hex: s.color,
        sku: `EVO-${s.code}`,
        price_paise: 1499900,
        stock_qty: 40,
      });
    });

    // ── Evo-Fills Foundation Refill Variants (₹2,800) ──
    FOUNDATION_SHADES.forEach((s, idx) => {
      const numStr = String(idx + 1).padStart(2, '0');
      allVariants.push({
        id: `22222222-2222-4222-8222-0000000000${numStr}`,
        product_id: SEED_PRODUCT_IDS.EVO_FILLS,
        formula: 'foundation',
        shade_name: s.name,
        shade_code: s.code,
        color_hex: s.color,
        sku: `FILL-FND-${s.code}`,
        price_paise: 280000,
        stock_qty: 60,
      });
    });

    // ── Evo-Fills Blush Refill Variants (5 shades, ₹2,500) ──
    BLUSH_SHADES.forEach((s, idx) => {
      const numStr = String(11 + idx).padStart(2, '0');
      allVariants.push({
        id: `22222222-2222-4222-8222-0000000000${numStr}`,
        product_id: SEED_PRODUCT_IDS.EVO_FILLS,
        formula: 'blush',
        shade_name: s.name,
        shade_code: s.code,
        color_hex: s.color,
        sku: `FILL-BLUSH-${s.code}`,
        price_paise: 250000,
        stock_qty: 50,
      });
    });

    // ── Evo-Fills Highlighter Refill Variants (5 shades, ₹2,650) ──
    HIGHLIGHTER_SHADES.forEach((s, idx) => {
      const numStr = String(21 + idx).padStart(2, '0');
      allVariants.push({
        id: `22222222-2222-4222-8222-0000000000${numStr}`,
        product_id: SEED_PRODUCT_IDS.EVO_FILLS,
        formula: 'highlighter',
        shade_name: s.name,
        shade_code: s.code,
        color_hex: s.color,
        sku: `FILL-HL-${s.code}`,
        price_paise: 265000,
        stock_qty: 45,
      });
    });

    // ── Legacy Evo-Fill 10-Pack Refills (₹2,500) ──
    allVariants.push({
      id: '11111111-1111-4111-8111-000000000051',
      product_id: SEED_PRODUCT_IDS.EVO_FILLS,
      formula: 'foundation',
      shade_name: 'Pre-filled Capsules (Pack of 10)',
      shade_code: 'CAPSULE-10',
      color_hex: '#d8a978',
      sku: 'EVO-FILL-10',
      price_paise: 250000,
      stock_qty: 50,
    });

    // ── Evo-Bottles Empty (Pack of 20, ₹1,799) ──
    allVariants.push({
      id: '11111111-1111-4111-8111-000000000052',
      product_id: SEED_PRODUCT_IDS.EVO_BOTTLES,
      formula: 'accessories',
      shade_name: 'Empty Capsules (Pack of 20)',
      shade_code: 'BOTTLE-20',
      color_hex: '#ffffff',
      sku: 'EVO-BOTTLE-20',
      price_paise: 179900,
      stock_qty: 50,
    });

    // Insert or update all variants
    for (const v of allVariants) {
      await db
        .insert(productVariants)
        .values({
          id: v.id,
          product_id: v.product_id,
          formula: v.formula,
          shade_name: v.shade_name,
          shade_code: v.shade_code,
          color_hex: v.color_hex,
          sku: v.sku,
          price_paise: v.price_paise,
          stock_qty: v.stock_qty,
          is_active: true,
        })
        .onConflictDoUpdate({
          target: productVariants.id,
          set: {
            formula: v.formula,
            shade_name: v.shade_name,
            shade_code: v.shade_code,
            color_hex: v.color_hex,
            price_paise: v.price_paise,
            stock_qty: v.stock_qty,
          },
        });
    }

    console.log(`✅ Successfully seeded ${allVariants.length} product variants across Foundation, Blush, and Highlighter!`);
  } catch (err) {
    console.error('❌ Seeding failed:', err);
    process.exit(1);
  } finally {
    await closeDb();
  }
};

seed();
