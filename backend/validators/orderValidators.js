import { z } from 'zod';
import { uuidSchema } from './commonValidators.js';

export const idempotencyKeyHeaderSchema = z
  .string({ required_error: 'Idempotency-Key header is required' })
  .trim()
  .min(8, 'Idempotency-Key header must be between 8 and 64 characters')
  .max(64, 'Idempotency-Key header must be between 8 and 64 characters');

export const orderAddressSchema = z.object({
  name: z
    .string({ required_error: 'Name is required' })
    .trim()
    .min(1, 'Name is required')
    .max(100, 'Name cannot exceed 100 characters'),
  phone: z
    .string({ required_error: 'Phone number is required' })
    .trim()
    .regex(/^(?:\+91|91)?[6-9]\d{9}$/, 'Invalid Indian phone number')
    .transform((val) => {
      // Normalize to 10 digits (strip +91 or 91)
      const match = val.match(/([6-9]\d{9})$/);
      return match ? match[1] : val;
    }),
  line1: z
    .string({ required_error: 'Address line 1 is required' })
    .trim()
    .min(1, 'Address line 1 is required')
    .max(200, 'Address line 1 cannot exceed 200 characters'),
  line2: z
    .string()
    .trim()
    .max(200, 'Address line 2 cannot exceed 200 characters')
    .nullish()
    .transform((val) => val || null),
  city: z
    .string({ required_error: 'City is required' })
    .trim()
    .min(1, 'City is required')
    .max(100, 'City cannot exceed 100 characters'),
  state: z
    .string({ required_error: 'State is required' })
    .trim()
    .min(1, 'State is required')
    .max(100, 'State cannot exceed 100 characters'),
  pincode: z
    .string({ required_error: 'Pincode is required' })
    .trim()
    .regex(/^[1-9]\d{5}$/, 'Pincode must be exactly 6 digits starting with 1-9'),
});

export const orderItemInputSchema = z.object({
  variantId: uuidSchema,
  quantity: z
    .number()
    .int()
    .min(1, 'Quantity must be at least 1')
    .max(10, 'Quantity cannot exceed 10'),
});

export const createOrderSchema = z.object({
  items: z
    .array(orderItemInputSchema)
    .min(1, 'Cart items array cannot be empty')
    .max(20, 'Cart cannot contain more than 20 items')
    .refine(
      (items) => {
        const ids = items.map((item) => item.variantId);
        return new Set(ids).size === ids.length;
      },
      {
        message: 'Duplicate variantIds are not allowed in order',
      }
    ),
  shippingAddress: orderAddressSchema,
});

export const orderIdParamSchema = z.object({
  id: uuidSchema,
});
