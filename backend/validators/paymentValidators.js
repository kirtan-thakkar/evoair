import { z } from 'zod';
import { uuidSchema } from './commonValidators.js';

export const createPaymentOrderSchema = z.object({
  orderId: uuidSchema,
});

export const verifyPaymentSchema = z.object({
  orderId: uuidSchema,
  razorpay_order_id: z
    .string({ required_error: 'razorpay_order_id is required' })
    .trim()
    .min(1, 'razorpay_order_id cannot be empty'),
  razorpay_payment_id: z
    .string({ required_error: 'razorpay_payment_id is required' })
    .trim()
    .min(1, 'razorpay_payment_id cannot be empty'),
  razorpay_signature: z
    .string({ required_error: 'razorpay_signature is required' })
    .trim()
    .min(1, 'razorpay_signature cannot be empty'),
});
