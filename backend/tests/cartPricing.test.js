import { describe, it, expect, afterAll } from 'vitest';
import { calculatePricing, calculateGuestCart } from '../services/cartService.js';
import { closeDb } from '../config/db.js';

describe('Cart Pricing & Bundle Engine', () => {
  it('calculates zero total and zero shipping for an empty cart', () => {
    const result = calculatePricing([]);
    expect(result.subtotal_paise).toBe(0);
    expect(result.subtotal_rupees).toBe(0);
    expect(result.shipping_fee_paise).toBe(0);
    expect(result.shipping_fee_rupees).toBe(0);
    expect(result.total_paise).toBe(0);
    expect(result.total_rupees).toBe(0);
    expect(result.formatted.shipping).toBe('₹0');
  });

  it('calculates exact pricing for standalone Evo-Air Device (₹14,999)', () => {
    const items = [
      {
        product_slug: 'evoair',
        price_paise: 1499900,
        quantity: 1,
        available: true,
      },
    ];

    const result = calculatePricing(items);
    expect(result.subtotal_paise).toBe(1499900);
    expect(result.subtotal_rupees).toBe(14999);
    expect(result.shipping_fee_paise).toBe(0);
    expect(result.total_paise).toBe(1499900);
    expect(result.total_rupees).toBe(14999);
    expect(result.formatted.shipping).toBe('₹0');
  });

  it('calculates exact bundle pricing for Evo-Air Device (₹14,999) + Evo-Bottle (₹1,799) = ₹16,798', () => {
    const items = [
      {
        product_slug: 'evoair',
        price_paise: 1499900,
        quantity: 1,
        available: true,
      },
      {
        product_slug: 'evo-bottles',
        price_paise: 179900,
        quantity: 1,
        available: true,
      },
    ];

    const result = calculatePricing(items);
    expect(result.subtotal_paise).toBe(1679800);
    expect(result.subtotal_rupees).toBe(16798);
    expect(result.shipping_fee_paise).toBe(0);
    expect(result.total_paise).toBe(1679800);
    expect(result.total_rupees).toBe(16798);
    expect(result.total_rupees).toBe(result.subtotal_rupees);
  });

  it('handles multiple quantities correctly without unwanted discounts', () => {
    const items = [
      {
        product_slug: 'evoair',
        price_paise: 1499900,
        quantity: 2,
        available: true,
      },
      {
        product_slug: 'evo-bottles',
        price_paise: 179900,
        quantity: 3,
        available: true,
      },
    ];

    const expectedSubtotal = 1499900 * 2 + 179900 * 3; // 2999800 + 539700 = 3539500
    const result = calculatePricing(items);
    expect(result.subtotal_paise).toBe(expectedSubtotal);
    expect(result.subtotal_rupees).toBe(35395);
    expect(result.shipping_fee_paise).toBe(0);
    expect(result.total_paise).toBe(expectedSubtotal);
  });

  it('excludes unavailable or out-of-catalog items from pricing calculation', () => {
    const items = [
      {
        product_slug: 'evoair',
        price_paise: 1499900,
        quantity: 1,
        available: true,
      },
      {
        product_slug: 'discontinued-item',
        price_paise: 500000,
        quantity: 1,
        available: false,
      },
    ];

    const result = calculatePricing(items);
    expect(result.subtotal_paise).toBe(1499900);
    expect(result.total_paise).toBe(1499900);
  });

  it('grants 1 complimentary Evo-Bottle (any shade, e.g. H01 Highlighter) per Evo-Air Device in calculateGuestCart', async () => {
    const res = await calculateGuestCart([
      { id: 'evo-air-device', productSlug: 'evoair', isDevice: true, quantity: 1 },
      {
        id: 'evo-bottles-highlighter-H01',
        productSlug: 'evo-bottles',
        formulaId: 'highlighter',
        shadeCode: 'H01',
        quantity: 1,
      },
    ]);

    expect(res.items).toHaveLength(2);
    const deviceItem = res.items.find((i) => i.product_slug === 'evoair');
    const bottleItem = res.items.find((i) => i.product_slug === 'evo-bottles');

    expect(deviceItem.sku).toBe('EVO-AIR-DEVICE');
    expect(deviceItem.line_total_paise).toBe(1499900);

    expect(bottleItem.sku).toBe('BTL-HL-H01');
    expect(bottleItem.price_paise).toBe(179900);
    expect(bottleItem.is_complimentary).toBe(true);
    expect(bottleItem.free_quantity).toBe(1);
    expect(bottleItem.paid_quantity).toBe(0);
    expect(bottleItem.line_total_paise).toBe(0);

    expect(res.pricing.subtotal_rupees).toBe(14999);
    expect(res.pricing.shipping_fee_rupees).toBe(0);
    expect(res.pricing.total_rupees).toBe(14999);
  });

  it('charges regular price for additional Evo-Bottles beyond 1 per device and for standalone Evo-Fills', async () => {
    const res = await calculateGuestCart([
      { id: 'evo-air-device', productSlug: 'evoair', isDevice: true, quantity: 1 },
      {
        id: 'evo-bottles-foundation-02',
        productSlug: 'evo-bottles',
        formulaId: 'foundation',
        shadeCode: '02',
        quantity: 2,
      },
      {
        id: 'evofills-blush-B01',
        productSlug: 'evo-fills',
        formulaId: 'blush',
        shadeCode: 'B01',
        quantity: 1,
      },
    ]);

    const bottleItem = res.items.find((i) => i.product_slug === 'evo-bottles');
    const fillItem = res.items.find((i) => i.product_slug === 'evo-fills');

    expect(bottleItem.free_quantity).toBe(1);
    expect(bottleItem.paid_quantity).toBe(1);
    expect(bottleItem.line_total_paise).toBe(179900);

    expect(fillItem.is_complimentary).toBe(false);
    expect(fillItem.line_total_paise).toBe(250000);

    expect(res.pricing.total_rupees).toBe(14999 + 1799 + 2500);
  });

  afterAll(async () => {
    await closeDb();
  });
});
