import { describe, it, expect } from 'vitest';
import { calculatePricing } from '../services/cartService.js';

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
});
