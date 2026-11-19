import { describe, it, expect } from 'vitest';
import { orderAddressSchema, createOrderSchema } from '../validators/orderValidators.js';

describe('Order Address & Phone Sanitization Validator', () => {
  const validBaseAddress = {
    name: 'Kirtan Thakkar',
    phone: '9876543210',
    line1: 'B-402, Titanium City Centre',
    city: 'Ahmedabad',
    state: 'Gujarat',
    pincode: '380015',
  };

  it('validates a standard 10-digit Indian mobile number', () => {
    const parsed = orderAddressSchema.parse(validBaseAddress);
    expect(parsed.phone).toBe('9876543210');
  });

  it('sanitizes and normalizes +91 country prefix', () => {
    const parsed = orderAddressSchema.parse({
      ...validBaseAddress,
      phone: '+919876543210',
    });
    expect(parsed.phone).toBe('9876543210');
  });

  it('sanitizes phone numbers with spaces, hyphens, and leading zero', () => {
    const testCases = [
      '+91 98765 43210',
      '+91-98765-43210',
      '09876543210',
      '98765-43210',
      '(0) 9876543210',
    ];

    for (const rawPhone of testCases) {
      const parsed = orderAddressSchema.parse({
        ...validBaseAddress,
        phone: rawPhone,
      });
      expect(parsed.phone).toBe('9876543210');
    }
  });

  it('rejects invalid or non-Indian phone numbers', () => {
    const invalidPhones = ['12345', '5876543210', '98765', 'abcdefghij'];

    for (const badPhone of invalidPhones) {
      expect(() =>
        orderAddressSchema.parse({ ...validBaseAddress, phone: badPhone })
      ).toThrow();
    }
  });

  it('sanitizes pincodes with spaces and validates 6 digits starting 1-9', () => {
    const parsed = orderAddressSchema.parse({
      ...validBaseAddress,
      pincode: ' 380 015 ',
    });
    expect(parsed.pincode).toBe('380015');

    expect(() =>
      orderAddressSchema.parse({ ...validBaseAddress, pincode: '080015' })
    ).toThrow();
    expect(() =>
      orderAddressSchema.parse({ ...validBaseAddress, pincode: '38001' })
    ).toThrow();
  });

  it('rejects duplicate variantIds in createOrderSchema', () => {
    const sampleUuid = '11111111-1111-4111-8111-000000000001';
    const payload = {
      items: [
        { variantId: sampleUuid, quantity: 1 },
        { variantId: sampleUuid, quantity: 2 },
      ],
      shippingAddress: validBaseAddress,
    };

    expect(() => createOrderSchema.parse(payload)).toThrow(/Duplicate variantIds/);
  });
});
