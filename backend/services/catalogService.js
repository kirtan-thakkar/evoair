import { eq, and, asc, inArray } from 'drizzle-orm';
import { db } from '../config/db.js';
import { products, productVariants } from '../db/schema.js';
import { NotFoundError } from '../utils/errors.js';

export const getActiveProducts = async () => {
  const rows = await db
    .select({
      productId: products.id,
      productName: products.name,
      productSlug: products.slug,
      productDescription: products.description,
      variantId: productVariants.id,
      formula: productVariants.formula,
      shadeName: productVariants.shade_name,
      shadeCode: productVariants.shade_code,
      colorHex: productVariants.color_hex,
      sku: productVariants.sku,
      pricePaise: productVariants.price_paise,
      stockQty: productVariants.stock_qty,
    })
    .from(products)
    .leftJoin(
      productVariants,
      and(
        eq(products.id, productVariants.product_id),
        eq(productVariants.is_active, true)
      )
    )
    .where(eq(products.is_active, true))
    .orderBy(asc(products.id), asc(productVariants.id));

  const productsMap = new Map();

  for (const row of rows) {
    if (!productsMap.has(row.productId)) {
      productsMap.set(row.productId, {
        id: row.productId,
        name: row.productName,
        slug: row.productSlug,
        description: row.productDescription,
        variants: [],
      });
    }

    if (row.variantId !== null) {
      productsMap.get(row.productId).variants.push({
        id: row.variantId,
        formula: row.formula,
        shade_name: row.shadeName,
        shade_code: row.shadeCode,
        color_hex: row.colorHex,
        sku: row.sku,
        price_paise: row.pricePaise,
        in_stock: row.stockQty > 0,
      });
    }
  }

  return Array.from(productsMap.values());
};

export const getProductBySlug = async (slug) => {
  const rows = await db
    .select({
      productId: products.id,
      productName: products.name,
      productSlug: products.slug,
      productDescription: products.description,
      variantId: productVariants.id,
      formula: productVariants.formula,
      shadeName: productVariants.shade_name,
      shadeCode: productVariants.shade_code,
      colorHex: productVariants.color_hex,
      sku: productVariants.sku,
      pricePaise: productVariants.price_paise,
      stockQty: productVariants.stock_qty,
    })
    .from(products)
    .leftJoin(
      productVariants,
      and(
        eq(products.id, productVariants.product_id),
        eq(productVariants.is_active, true)
      )
    )
    .where(and(eq(products.slug, slug), eq(products.is_active, true)))
    .orderBy(asc(products.id), asc(productVariants.id));

  if (!rows.length) {
    throw new NotFoundError('Product not found');
  }

  const first = rows[0];
  const product = {
    id: first.productId,
    name: first.productName,
    slug: first.productSlug,
    description: first.productDescription,
    variants: [],
  };

  for (const row of rows) {
    if (row.variantId !== null) {
      product.variants.push({
        id: row.variantId,
        formula: row.formula,
        shade_name: row.shadeName,
        shade_code: row.shadeCode,
        color_hex: row.colorHex,
        sku: row.sku,
        price_paise: row.pricePaise,
        in_stock: row.stockQty > 0,
      });
    }
  }

  return product;
};

export const validateCartItems = async (items) => {
  const variantIds = items.map((i) => i.variantId);

  const dbVariants = await db
    .select({
      id: productVariants.id,
      shade_name: productVariants.shade_name,
      price_paise: productVariants.price_paise,
      stock_qty: productVariants.stock_qty,
      is_active: productVariants.is_active,
    })
    .from(productVariants)
    .where(inArray(productVariants.id, variantIds))
    .orderBy(asc(productVariants.id));

  const variantMap = new Map(dbVariants.map((v) => [v.id, v]));

  let total_paise = 0;
  const validatedItems = items.map((item) => {
    const v = variantMap.get(item.variantId);

    if (!v || !v.is_active) {
      return {
        variantId: item.variantId,
        shade_name: null,
        price_paise: null,
        available: false,
        max_quantity_available: 0,
        line_total_paise: 0,
      };
    }

    const isAvailable = v.stock_qty >= item.quantity;
    const maxQuantity = Math.max(0, Math.min(v.stock_qty, 10));
    const lineTotal = isAvailable ? v.price_paise * item.quantity : 0;

    if (isAvailable) {
      total_paise += lineTotal;
    }

    return {
      variantId: item.variantId,
      shade_name: v.shade_name,
      price_paise: v.price_paise,
      available: isAvailable,
      max_quantity_available: maxQuantity,
      line_total_paise: lineTotal,
    };
  });

  return {
    items: validatedItems,
    total_paise,
  };
};
