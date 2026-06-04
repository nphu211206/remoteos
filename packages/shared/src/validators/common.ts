/**
 * Common validation schemas used across the system
 */

import { z } from 'zod';

/** Pagination query parameters */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.string().max(50).optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

/** UUID validation */
export const uuidSchema = z.string().uuid();

/** URL validation */
export const urlSchema = z.string().url().startsWith('https://');

/** Language code validation (ISO 639-1) */
export const languageSchema = z.enum(['vi', 'en', 'ja', 'ko', 'zh', 'fr', 'de', 'es', 'pt', 'ru']);

/** Timezone validation (simplified — full validation done at runtime) */
export const timezoneSchema = z.string().min(3).max(50);

/** Date range query */
export const dateRangeSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
}).refine(
  (data) => !data.from || !data.to || data.from <= data.to,
  'From date must be before to date',
);

/** Search query */
export const searchQuerySchema = z.object({
  q: z.string().min(1).max(200).trim(),
  limit: z.number().int().min(1).max(50).default(10),
});

/** Device ID param validation */
export const deviceIdParamSchema = z.object({
  id: z.string().uuid(),
});

/** Command ID param validation */
export const commandIdParamSchema = z.object({
  id: z.string().uuid(),
});
