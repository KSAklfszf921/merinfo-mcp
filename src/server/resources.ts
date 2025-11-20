/**
 * MCP Resources implementation
 * Provides access to cached data via URIs
 */

import { CompanyDatabase } from '../cache/database.js';
import { logger } from '../utils/logger.js';

export class MerinfoResources {
  constructor(private db: CompanyDatabase) {}

  /**
   * List available resources
   */
  listResources(): Array<{ uri: string; name: string; mimeType: string; description?: string }> {
    return [
      {
        uri: 'company://{org_number}',
        name: 'Company by organization number',
        mimeType: 'application/json',
        description: 'Get cached company data by organization number',
      },
      {
        uri: 'companies://recent?limit={limit}',
        name: 'Recently scraped companies',
        mimeType: 'application/json',
        description: 'Get recently scraped companies',
      },
      {
        uri: 'companies://search?q={query}&limit={limit}',
        name: 'Search companies',
        mimeType: 'application/json',
        description: 'Full-text search in cached companies',
      },
      {
        uri: 'companies://industry/{sni_code}?limit={limit}',
        name: 'Companies by SNI code',
        mimeType: 'application/json',
        description: 'Get companies by SNI industry code',
      },
      {
        uri: 'stats://cache',
        name: 'Cache statistics',
        mimeType: 'application/json',
        description: 'Database health and usage metrics',
      },
    ];
  }

  /**
   * Read a resource by URI
   */
  readResource(uri: string): { contents: string; mimeType: string } {
    logger.debug({ uri }, 'Reading resource');

    try {
      const url = new URL(uri);

      // company://5566313788
      if (url.protocol === 'company:') {
        const org_number = url.hostname;
        const company = this.db.getCompany(org_number);

        if (!company) {
          throw new Error(`Company ${org_number} not found in cache`);
        }

        return {
          contents: JSON.stringify(company, null, 2),
          mimeType: 'application/json',
        };
      }

      // companies://recent?limit=50
      if (url.protocol === 'companies:' && url.hostname === 'recent') {
        const limit = parseInt(url.searchParams.get('limit') || '50');
        const companies = this.db.getCachedCompanies({
          sort_by: 'scraped_at',
          order: 'desc',
          limit,
        });

        return {
          contents: JSON.stringify(companies, null, 2),
          mimeType: 'application/json',
        };
      }

      // companies://search?q=assistans&limit=20
      if (url.protocol === 'companies:' && url.hostname === 'search') {
        const query = url.searchParams.get('q');
        const limit = parseInt(url.searchParams.get('limit') || '20');

        if (!query) {
          throw new Error('Query parameter "q" is required');
        }

        const companies = this.db.searchCompaniesByName(query, limit);

        return {
          contents: JSON.stringify(companies, null, 2),
          mimeType: 'application/json',
        };
      }

      // companies://industry/62010?limit=20
      if (url.protocol === 'companies:' && url.hostname === 'industry') {
        const sni_code = url.pathname.replace('/', '');
        const limit = parseInt(url.searchParams.get('limit') || '20');

        const companies = this.db.searchCompaniesByIndustry({
          sni_code,
          limit,
        });

        return {
          contents: JSON.stringify(companies, null, 2),
          mimeType: 'application/json',
        };
      }

      // stats://cache
      if (url.protocol === 'stats:' && url.hostname === 'cache') {
        const stats = this.db.getCacheStats();

        return {
          contents: JSON.stringify(stats, null, 2),
          mimeType: 'application/json',
        };
      }

      throw new Error(`Unknown resource URI: ${uri}`);
    } catch (error) {
      logger.error({ uri, error }, 'Error reading resource');
      throw error;
    }
  }
}
