/**
 * Seed data for EvoAir Storefront (UUID Enabled)
 */
import 'dotenv/config';
import { eq } from 'drizzle-orm';
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

export const SEED_VARIANT_IDS = {
  'EVO-01': '11111111-1111-4111-8111-000000000001',
  'EVO-02': '11111111-1111-4111-8111-000000000002',
  'EVO-03': '11111111-1111-4111-8111-000000000003',
  'EVO-04': '11111111-1111-4111-8111-000000000004',
  'EVO-05': '11111111-1111-4111-8111-000000000005',
  'EVO-06': '11111111-1111-4111-8111-000000000006',
  'EVO-07': '11111111-1111-4111-8111-000000000007',
  'EVO-08': '11111111-1111-4111-8111-000000000008',
  'EVO-09': '11111111-1111-4111-8111-000000000009',
  'EVO-10': '11111111-1111-4111-8111-000000000010',
  'EVO-FILL-10': '11111111-1111-4111-8111-000000000051',
  'EVO-BOTTLE-20': '11111111-1111-4111-8111-000000000052',
};

const seed = async () => {
  try {
    console.log('🌱 Starting database seeding with UUIDs...');

    // 1. Insert product: EvoAir
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

    // 2. Insert 10 shade variants for EvoAir
    const variantsData = [
      { id: SEED_VARIANT_IDS['EVO-01'], shade_name: 'Halo', shade_code: '02', sku: 'EVO-01', price_paise: 280000, stock_qty: 50 },
      { id: SEED_VARIANT_IDS['EVO-02'], shade_name: 'Flare', shade_code: '03', sku: 'EVO-02', price_paise: 280000, stock_qty: 50 },
      { id: SEED_VARIANT_IDS['EVO-03'], shade_name: 'Serene', shade_code: '06', sku: 'EVO-03', price_paise: 280000, stock_qty: 30 },
      { id: SEED_VARIANT_IDS['EVO-04'], shade_name: 'Astra', shade_code: '07', sku: 'EVO-04', price_paise: 280000, stock_qty: 40 },
      { id: SEED_VARIANT_IDS['EVO-05'], shade_name: 'Amber', shade_code: '10', sku: 'EVO-05', price_paise: 280000, stock_qty: 25 },
      { id: SEED_VARIANT_IDS['EVO-06'], shade_name: 'Dawn', shade_code: '11', sku: 'EVO-06', price_paise: 280000, stock_qty: 20 },
      { id: SEED_VARIANT_IDS['EVO-07'], shade_name: 'Cosmic', shade_code: '14', sku: 'EVO-07', price_paise: 280000, stock_qty: 15 },
      { id: SEED_VARIANT_IDS['EVO-08'], shade_name: 'Stardusk', shade_code: '15', sku: 'EVO-08', price_paise: 280000, stock_qty: 35 },
      { id: SEED_VARIANT_IDS['EVO-09'], shade_name: 'Galaxy', shade_code: '18', sku: 'EVO-09', price_paise: 280000, stock_qty: 10 },
      { id: SEED_VARIANT_IDS['EVO-10'], shade_name: 'Nebula', shade_code: '19', sku: 'EVO-10', price_paise: 280000, stock_qty: 0 },
    ];

    for (const v of variantsData) {
      await db
        .insert(productVariants)
        .values({
          id: v.id,
          product_id: SEED_PRODUCT_IDS.EVOAIR,
          shade_name: v.shade_name,
          shade_code: v.shade_code,
          sku: v.sku,
          price_paise: v.price_paise,
          stock_qty: v.stock_qty,
          is_active: true,
        })
        .onConflictDoNothing({ target: productVariants.sku });
    }

    // 3. Insert Evo-Fills Refills Product & Variant
    await db
      .insert(products)
      .values({
        id: SEED_PRODUCT_IDS.EVO_FILLS,
        name: 'Evo-Fills Refills',
        slug: 'evo-fills',
        description: '10 Pre-filled sterile formula capsules for zero mess and ultra-pure atomization.',
        is_active: true,
      })
      .onConflictDoNothing({ target: products.slug });

    await db
      .insert(productVariants)
      .values({
        id: SEED_VARIANT_IDS['EVO-FILL-10'],
        product_id: SEED_PRODUCT_IDS.EVO_FILLS,
        shade_name: 'Pre-filled Capsules (Pack of 10)',
        shade_code: 'CAPSULE-10',
        sku: 'EVO-FILL-10',
        price_paise: 250000,
        stock_qty: 50,
        is_active: true,
      })
      .onConflictDoNothing({ target: productVariants.sku });

    // 4. Insert Evo-Bottles Empty (Pack of 20 Empty Capsules)
    await db
      .insert(products)
      .values({
        id: SEED_PRODUCT_IDS.EVO_BOTTLES,
        name: 'Evo-Bottles Empty',
        slug: 'evo-bottles',
        description: 'Pack of 20 empty refillable capsules. Compatible with your own foundation formulas.',
        is_active: true,
      })
      .onConflictDoNothing({ target: products.slug });

    await db
      .insert(productVariants)
      .values({
        id: SEED_VARIANT_IDS['EVO-BOTTLE-20'],
        product_id: SEED_PRODUCT_IDS.EVO_BOTTLES,
        shade_name: 'Empty Capsules (Pack of 20)',
        shade_code: 'BOTTLE-20',
        sku: 'EVO-BOTTLE-20',
        price_paise: 179900,
        stock_qty: 0,
        is_active: true,
      })
      .onConflictDoNothing({ target: productVariants.sku });

    console.log('✅ Seeding with UUIDs completed successfully.');
  } catch (err) {
    console.error('❌ Seeding failed:', err);
    process.exit(1);
  } finally {
    await closeDb();
  }
};

seed();
