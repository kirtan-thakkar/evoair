import { z } from 'zod';

export const eventSchema = z.object({
  event: z
    .string({ required_error: 'Event name is required' })
    .trim()
    .min(1, 'Event name cannot be empty')
    .max(64, 'Event name cannot exceed 64 characters'),
  path: z
    .string()
    .trim()
    .max(256, 'Path cannot exceed 256 characters')
    .optional()
    .default('/'),
  sessionId: z
    .string()
    .trim()
    .max(64, 'Session ID cannot exceed 64 characters')
    .optional(),
  userId: z
    .string()
    .trim()
    .max(64, 'User ID cannot exceed 64 characters')
    .nullable()
    .optional(),
  timestamp: z
    .string()
    .datetime({ message: 'Timestamp must be a valid ISO date string' })
    .optional(),
  metadata: z
    .record(
      z.string().max(256, 'Metadata key cannot exceed 256 characters'),
      z.union([
        z.string().max(256, 'Metadata string value cannot exceed 256 characters'),
        z.number(),
        z.boolean(),
        z.null(),
      ])
    )
    .refine((data) => Object.keys(data).length <= 20, {
      message: 'Metadata cannot exceed 20 keys',
    })
    .optional()
    .default({}),
});
