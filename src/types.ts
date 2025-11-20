/**
 * Type definitions for Merinfo MCP Server
 * Combines patterns from allabolag and merinfo_scraper
 */

export interface CompanyData {
  org_number: string;
  name: string;
  legal_form?: string;
  status?: string;
  registration_date?: string;
  contact: ContactInfo;
  tax_info: TaxInfo;
  financials?: FinancialData;
  industry: IndustryInfo;
  bankgiro_number?: string;
  has_remarks: boolean;
  remarks?: string;
  source_url: string;
  scraped_at: string;
  updated_at?: string;
}

export interface ContactInfo {
  phone?: string;
  address?: string;
  postal_code?: string;
  city?: string;
  municipality?: string;
  county?: string;
}

export interface TaxInfo {
  f_skatt: boolean;
  vat_registered: boolean;
  employer_registered: boolean;
}

export interface FinancialData {
  period?: string;
  revenue?: number;
  profit_after_financial?: number;
  net_profit?: number;
  total_assets?: number;
  currency: string;
}

export interface IndustryInfo {
  sni_code?: string;
  sni_description?: string;
  categories?: string[];
  activity_description?: string;
}

export interface PersonDetails {
  id?: number;
  org_number: string;
  name: string;
  role: string;
  personal_number?: string;
  age?: number;
  phone?: string;
  address: PersonAddress;
  profile_url?: string;
  scraped_at?: string;
}

export interface PersonAddress {
  street?: string;
  apartment?: string;
  postal_code?: string;
  city?: string;
}

export interface CompanySearchResult {
  success: boolean;
  cached: boolean;
  company: CompanyData;
  board_members?: PersonDetails[];
  cache_age_days?: number;
}

export interface CacheStats {
  total_companies: number;
  total_people: number;
  oldest_entry: string | null;
  newest_entry: string | null;
  cache_size_mb: number;
  companies_by_city: Record<string, number>;
  companies_by_status: Record<string, number>;
}

export interface RateLimitInfo {
  requests_remaining: number;
  window_reset_at: string;
  retry_after_ms?: number;
}

// Error types
export class NoSuchCompanyError extends Error {
  constructor(org_number: string) {
    super(`Company ${org_number} not found`);
    this.name = 'NoSuchCompanyError';
  }
}

export class RateLimitError extends Error {
  public retry_after_ms: number;

  constructor(message: string, retry_after_ms: number) {
    super(message);
    this.name = 'RateLimitError';
    this.retry_after_ms = retry_after_ms;
  }
}

export class ScraperError extends Error {
  public retryable: boolean;

  constructor(message: string, retryable = true) {
    super(message);
    this.name = 'ScraperError';
    this.retryable = retryable;
  }
}

// Configuration
export interface MCPConfig {
  database_path: string;
  playwright_headless: boolean;
  playwright_timeout: number;
  rate_limit_scraping_rpm: number;
  rate_limit_client_rpm: number;
  cache_ttl_days: number;
  cache_stale_days: number;
  max_cache_size: number;
  log_level: string;
  enable_person_details: boolean;
  enable_background_refresh: boolean;
}

export const DEFAULT_CONFIG: MCPConfig = {
  database_path: process.env.DATABASE_PATH || './data/merinfo.db',
  playwright_headless: process.env.PLAYWRIGHT_HEADLESS !== 'false',
  playwright_timeout: parseInt(process.env.PLAYWRIGHT_TIMEOUT || '30000'),
  rate_limit_scraping_rpm: parseInt(process.env.RATE_LIMIT_SCRAPING_RPM || '10'),
  rate_limit_client_rpm: parseInt(process.env.RATE_LIMIT_CLIENT_RPM || '30'),
  cache_ttl_days: parseInt(process.env.CACHE_TTL_DAYS || '30'),
  cache_stale_days: parseInt(process.env.CACHE_STALE_DAYS || '7'),
  max_cache_size: parseInt(process.env.MAX_CACHE_SIZE || '10000'),
  log_level: process.env.LOG_LEVEL || 'info',
  enable_person_details: process.env.ENABLE_PERSON_DETAILS !== 'false',
  enable_background_refresh: process.env.ENABLE_BACKGROUND_REFRESH === 'true'
};
