import { z } from 'zod';
import { uuidSchema } from './commonValidators.js';

export const cartItemUpdateSchema = z.object({
  variantId: uuidSchema,
  quantity: z
    .number()
    .int()
    .min(0, 'Quantity cannot be negative')
    .max(10, 'Quantity cannot exceed 10'),
});

export const cartVariantParamSchema = z.object({
  variantId: uuidSchema,
});

export const cartSyncItemSchema = z.object({
  variantId: uuidSchema,
  quantity: z
    .number()
    .int()
    .min(1, 'Quantity must be at least 1')
    .max(10, 'Quantity cannot exceed 10'),
});

export const cartSyncSchema = z.object({
  items: z
    .array(cartSyncItemSchema)
    .max(20, 'Cart cannot contain more than 20 items')
    .refine(
      (items) => {
        const ids = items.map((item) => item.variantId);
        return new Set(ids).size === ids.length;
      },
      {
        message: 'Duplicate variantIds are not allowed in sync payload',
      }
    ),
});
