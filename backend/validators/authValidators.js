import { z } from 'zod';

export const registerSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  email: z.string().trim().toLowerCase().email('Invalid email address'),
  phone: z
    .string()
    .trim()
    .regex(/^(?:\+91|91|0)?[6-9]\d{9}$/, 'Invalid Indian phone number')
    .transform((val) => {
      // Normalize to 10 digits (strip +91, 91, or leading 0)
      const match = val.match(/([6-9]\d{9})$/);
      return match ? match[1] : val;
    }),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password must be at most 72 characters'),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const googleAuthSchema = z.object({
  credential: z.string().min(1, 'Google credential token is required'),
});
