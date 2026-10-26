import { z } from 'zod';

export const uuidSchema = z
  .string({ required_error: 'ID is required' })
  .trim()
  .uuid('Invalid UUID format');
