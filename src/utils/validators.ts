/**
 * Input validation with Zod schemas
 */

import { z } from 'zod';

export const OrgNumberSchema = z
  .string()
  .regex(/^\d{6}-?\d{4}$/, 'Invalid Swedish organization number format (expected: XXXXXX-XXXX)')
  .transform((val) => {
    const cleaned = val.replace(/[^0-9]/g, '');
    return `${cleaned.slice(0, 6)}-${cleaned.slice(6)}`;
  });

export const SearchQuerySchema = z
  .string()
  .min(3, 'Search query too short (minimum 3 characters)')
  .max(100, 'Search query too long (maximum 100 characters)')
  .refine(
    (val) => !/<|>|script/i.test(val),
    'Invalid characters in search query'
  );

export const CitySchema = z
  .string()
  .min(2, 'City name too short')
  .max(50, 'City name too long')
  .optional();

export const SNICodeSchema = z
  .string()
  .regex(/^\d{5}$/, 'Invalid SNI code format (expected: 5 digits)')
  .optional();

export const LimitSchema = z
  .number()
  .int()
  .min(1)
  .max(200)
  .default(20);

export const OffsetSchema = z
  .number()
  .int()
  .min(0)
  .default(0);

// Tool input schemas
export const SearchCompanyByOrgNumberInput = z.object({
  org_number: OrgNumberSchema,
  force_refresh: z.boolean().default(false),
  include_board: z.boolean().default(true),
});

export const GetCompanyDetailsInput = z.object({
  org_number: OrgNumberSchema,
});

export const SearchCompaniesByIndustryInput = z.object({
  sni_code: SNICodeSchema,
  category: z.string().optional(),
  city: CitySchema,
  min_revenue: z.number().optional(),
  limit: LimitSchema,
});

export const SearchCompanyByNameInput = z.object({
  query: SearchQuerySchema,
  limit: LimitSchema,
});

export const GetBoardMembersInput = z.object({
  org_number: OrgNumberSchema,
  force_refresh: z.boolean().default(false),
});

export const SearchPersonInput = z.object({
  name: z.string().min(3, 'Name too short'),
  role: z.string().optional(),
  limit: LimitSchema,
});

export const GetCachedCompaniesInput = z.object({
  city: CitySchema,
  status: z.string().optional(),
  has_remarks: z.boolean().optional(),
  sort_by: z.enum(['name', 'revenue', 'scraped_at']).default('scraped_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
  limit: LimitSchema,
  offset: OffsetSchema,
});

export const ClearCacheInput = z.object({
  older_than_days: z.number().int().min(1).default(30),
  confirm: z.boolean().refine((val) => val === true, {
    message: 'Must explicitly confirm cache clearing',
  }),
});

// Type exports
export type SearchCompanyByOrgNumberInput = z.infer<typeof SearchCompanyByOrgNumberInput>;
export type GetCompanyDetailsInput = z.infer<typeof GetCompanyDetailsInput>;
export type SearchCompaniesByIndustryInput = z.infer<typeof SearchCompaniesByIndustryInput>;
export type SearchCompanyByNameInput = z.infer<typeof SearchCompanyByNameInput>;
export type GetBoardMembersInput = z.infer<typeof GetBoardMembersInput>;
export type SearchPersonInput = z.infer<typeof SearchPersonInput>;
export type GetCachedCompaniesInput = z.infer<typeof GetCachedCompaniesInput>;
export type ClearCacheInput = z.infer<typeof ClearCacheInput>;
