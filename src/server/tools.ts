/**
 * MCP Tools implementation
 * All 12 tools for company information retrieval
 */

import { CompanyDatabase } from '../cache/database.js';
import { merinfoScraper } from '../scraper/merinfo.js';
import { DEFAULT_CONFIG } from '../types.js';
import { logger } from '../utils/logger.js';
import * as validators from '../utils/validators.js';

export class MerinfoTools {
  constructor(private db: CompanyDatabase) {}

  /**
   * Tool 1: Search company by organization number
   */
  async searchCompanyByOrgNumber(args: validators.SearchCompanyByOrgNumberInput) {
    const { org_number, force_refresh, include_board } = validators.SearchCompanyByOrgNumberInput.parse(args);

    logger.info({ org_number, force_refresh, include_board }, 'Tool: search_company_by_org_number');

    // Check cache first
    const cached = this.db.getCompany(org_number);
    const is_stale = cached ? this.db.isCacheStale(org_number, DEFAULT_CONFIG.cache_stale_days) : true;

    if (cached && !force_refresh && !is_stale) {
      const board_members = include_board ? this.db.getBoardMembers(org_number) : [];

      return {
        success: true,
        cached: true,
        cache_age_days: Math.floor(
          (Date.now() - new Date(cached.scraped_at).getTime()) / (1000 * 60 * 60 * 24)
        ),
        company: cached,
        board_members: include_board ? board_members : undefined,
      };
    }

    // Scrape fresh data
    const { company, board_members } = await merinfoScraper.scrapeCompany(org_number, include_board);

    // Save to cache
    this.db.saveCompany(company);
    if (include_board && board_members.length > 0) {
      this.db.saveBoardMembers(org_number, board_members);
    }

    return {
      success: true,
      cached: false,
      company,
      board_members: include_board ? board_members : undefined,
    };
  }

  /**
   * Tool 2: Get company details from cache
   */
  async getCompanyDetails(args: validators.GetCompanyDetailsInput) {
    const { org_number } = validators.GetCompanyDetailsInput.parse(args);

    logger.info({ org_number }, 'Tool: get_company_details');

    const company = this.db.getCompany(org_number);

    if (!company) {
      return {
        success: false,
        error: `Company ${org_number} not found in cache`,
        hint: 'Use search_company_by_org_number to fetch fresh data',
      };
    }

    const cache_age_days = Math.floor(
      (Date.now() - new Date(company.scraped_at).getTime()) / (1000 * 60 * 60 * 24)
    );

    return {
      success: true,
      company,
      cache_age_days,
      is_stale: this.db.isCacheStale(org_number, DEFAULT_CONFIG.cache_stale_days),
    };
  }

  /**
   * Tool 3: Search companies by industry
   */
  async searchCompaniesByIndustry(args: validators.SearchCompaniesByIndustryInput) {
    const params = validators.SearchCompaniesByIndustryInput.parse(args);

    logger.info(params, 'Tool: search_companies_by_industry');

    const companies = this.db.searchCompaniesByIndustry(params);

    return {
      success: true,
      count: companies.length,
      companies,
      filters_applied: {
        sni_code: params.sni_code,
        category: params.category,
        city: params.city,
        min_revenue: params.min_revenue,
      },
    };
  }

  /**
   * Tool 4: Search companies by name (full-text)
   */
  async searchCompanyByName(args: validators.SearchCompanyByNameInput) {
    const { query, limit } = validators.SearchCompanyByNameInput.parse(args);

    logger.info({ query, limit }, 'Tool: search_company_by_name');

    const companies = this.db.searchCompaniesByName(query, limit);

    return {
      success: true,
      query,
      count: companies.length,
      companies,
    };
  }

  /**
   * Tool 5: Get board members
   */
  async getBoardMembers(args: validators.GetBoardMembersInput) {
    const { org_number, force_refresh } = validators.GetBoardMembersInput.parse(args);

    logger.info({ org_number, force_refresh }, 'Tool: get_board_members');

    // Check if we need to refresh
    if (force_refresh || !this.db.getCompany(org_number)) {
      const { board_members } = await merinfoScraper.scrapeCompany(org_number, true);
      this.db.saveBoardMembers(org_number, board_members);

      return {
        success: true,
        org_number,
        count: board_members.length,
        board_members,
        cached: false,
      };
    }

    // Return cached
    const board_members = this.db.getBoardMembers(org_number);

    return {
      success: true,
      org_number,
      count: board_members.length,
      board_members,
      cached: true,
    };
  }

  /**
   * Tool 6: Search person
   */
  async searchPerson(args: validators.SearchPersonInput) {
    const { name, role, limit } = validators.SearchPersonInput.parse(args);

    logger.info({ name, role, limit }, 'Tool: search_person');

    const people = this.db.searchPeople(name, role, limit);

    return {
      success: true,
      query: name,
      role_filter: role,
      count: people.length,
      people,
    };
  }

  /**
   * Tool 7: Get financial data
   */
  async getFinancialData(args: { org_number: string }) {
    const { org_number } = validators.GetCompanyDetailsInput.parse(args);

    logger.info({ org_number }, 'Tool: get_financial_data');

    const company = this.db.getCompany(org_number);

    if (!company) {
      return {
        success: false,
        error: `Company ${org_number} not found`,
      };
    }

    return {
      success: true,
      org_number,
      company_name: company.name,
      financials: company.financials || null,
      has_data: !!company.financials,
    };
  }

  /**
   * Tool 8: Get tax information
   */
  async getTaxInformation(args: { org_number: string }) {
    const { org_number } = validators.GetCompanyDetailsInput.parse(args);

    logger.info({ org_number }, 'Tool: get_tax_information');

    const company = this.db.getCompany(org_number);

    if (!company) {
      return {
        success: false,
        error: `Company ${org_number} not found`,
      };
    }

    return {
      success: true,
      org_number,
      company_name: company.name,
      tax_info: company.tax_info,
    };
  }

  /**
   * Tool 9: Get cached companies
   */
  async getCachedCompanies(args: validators.GetCachedCompaniesInput) {
    const params = validators.GetCachedCompaniesInput.parse(args);

    logger.info(params, 'Tool: get_cached_companies');

    const companies = this.db.getCachedCompanies(params);

    return {
      success: true,
      count: companies.length,
      filters: {
        city: params.city,
        status: params.status,
        has_remarks: params.has_remarks,
      },
      sort: {
        by: params.sort_by,
        order: params.order,
      },
      pagination: {
        limit: params.limit,
        offset: params.offset,
      },
      companies,
    };
  }

  /**
   * Tool 10: Update company data
   */
  async updateCompanyData(args: { org_number: string }) {
    const { org_number } = validators.GetCompanyDetailsInput.parse(args);

    logger.info({ org_number }, 'Tool: update_company_data');

    const { company, board_members } = await merinfoScraper.scrapeCompany(org_number, true);

    this.db.saveCompany(company);
    this.db.saveBoardMembers(org_number, board_members);

    return {
      success: true,
      org_number,
      company,
      board_members,
      updated_at: company.updated_at,
    };
  }

  /**
   * Tool 11: Clear cache
   */
  async clearCache(args: validators.ClearCacheInput) {
    const { older_than_days, confirm } = validators.ClearCacheInput.parse(args);

    logger.warn({ older_than_days, confirm }, 'Tool: clear_cache');

    const deleted_count = this.db.clearCache(older_than_days);

    return {
      success: true,
      deleted_companies: deleted_count,
      older_than_days,
    };
  }

  /**
   * Tool 12: Get cache stats
   */
  async getCacheStats() {
    logger.info('Tool: get_cache_stats');

    const stats = this.db.getCacheStats();

    return {
      success: true,
      ...stats,
    };
  }
}
