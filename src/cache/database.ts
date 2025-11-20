/**
 * SQLite database operations
 * Implements caching patterns from allabolag
 */

import Database from 'better-sqlite3';
import { SCHEMA_SQL, CLEANUP_SQL } from './schema.js';
import { CompanyData, PersonDetails, CacheStats, DEFAULT_CONFIG } from '../types.js';
import { logger, logCacheOperation } from '../utils/logger.js';
import path from 'path';
import fs from 'fs';

export class CompanyDatabase {
  private db: Database.Database;

  constructor(dbPath: string = DEFAULT_CONFIG.database_path) {
    // Ensure directory exists
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.initialize();

    logger.info({ path: dbPath }, 'Database initialized');
  }

  /**
   * Initialize database schema
   */
  private initialize(): void {
    this.db.exec(SCHEMA_SQL);
  }

  /**
   * Get company by organization number
   */
  getCompany(org_number: string): CompanyData | null {
    logCacheOperation('read', org_number, false);

    const row = this.db
      .prepare(
        `SELECT * FROM companies WHERE org_number = ?`
      )
      .get(org_number) as any;

    if (!row) {
      logCacheOperation('read', org_number, false);
      return null;
    }

    logCacheOperation('read', org_number, true);
    return this.rowToCompany(row);
  }

  /**
   * Save or update company
   */
  saveCompany(company: CompanyData): void {
    const stmt = this.db.prepare(`
      INSERT INTO companies (
        org_number, name, legal_form, status, registration_date,
        phone, address, postal_code, city, municipality, county,
        f_skatt, vat_registered, employer_registered,
        financial_period, revenue, profit_after_financial, net_profit, total_assets, currency,
        sni_code, sni_description, categories, activity_description,
        bankgiro_number, has_remarks, remarks, source_url, scraped_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?
      )
      ON CONFLICT(org_number) DO UPDATE SET
        name = excluded.name,
        legal_form = excluded.legal_form,
        status = excluded.status,
        registration_date = excluded.registration_date,
        phone = excluded.phone,
        address = excluded.address,
        postal_code = excluded.postal_code,
        city = excluded.city,
        municipality = excluded.municipality,
        county = excluded.county,
        f_skatt = excluded.f_skatt,
        vat_registered = excluded.vat_registered,
        employer_registered = excluded.employer_registered,
        financial_period = excluded.financial_period,
        revenue = excluded.revenue,
        profit_after_financial = excluded.profit_after_financial,
        net_profit = excluded.net_profit,
        total_assets = excluded.total_assets,
        currency = excluded.currency,
        sni_code = excluded.sni_code,
        sni_description = excluded.sni_description,
        categories = excluded.categories,
        activity_description = excluded.activity_description,
        bankgiro_number = excluded.bankgiro_number,
        has_remarks = excluded.has_remarks,
        remarks = excluded.remarks,
        source_url = excluded.source_url,
        updated_at = excluded.updated_at
    `);

    stmt.run(
      company.org_number,
      company.name,
      company.legal_form || null,
      company.status || null,
      company.registration_date || null,
      company.contact.phone || null,
      company.contact.address || null,
      company.contact.postal_code || null,
      company.contact.city || null,
      company.contact.municipality || null,
      company.contact.county || null,
      company.tax_info.f_skatt ? 1 : 0,
      company.tax_info.vat_registered ? 1 : 0,
      company.tax_info.employer_registered ? 1 : 0,
      company.financials?.period || null,
      company.financials?.revenue || null,
      company.financials?.profit_after_financial || null,
      company.financials?.net_profit || null,
      company.financials?.total_assets || null,
      company.financials?.currency || 'SEK',
      company.industry.sni_code || null,
      company.industry.sni_description || null,
      JSON.stringify(company.industry.categories || []),
      company.industry.activity_description || null,
      company.bankgiro_number || null,
      company.has_remarks ? 1 : 0,
      company.remarks || null,
      company.source_url,
      company.scraped_at,
      new Date().toISOString()
    );

    logCacheOperation('write', company.org_number, true);
  }

  /**
   * Get board members for a company
   */
  getBoardMembers(org_number: string): PersonDetails[] {
    const rows = this.db
      .prepare(`SELECT * FROM people WHERE org_number = ?`)
      .all(org_number) as any[];

    return rows.map(this.rowToPerson);
  }

  /**
   * Save board members
   */
  saveBoardMembers(org_number: string, members: PersonDetails[]): void {
    // Delete existing members
    this.db.prepare(`DELETE FROM people WHERE org_number = ?`).run(org_number);

    if (members.length === 0) return;

    // Insert new members
    const stmt = this.db.prepare(`
      INSERT INTO people (
        org_number, name, role, personal_number, age, phone,
        street, apartment, postal_code, city, profile_url, scraped_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insert = this.db.transaction((members: PersonDetails[]) => {
      for (const member of members) {
        stmt.run(
          member.org_number,
          member.name,
          member.role,
          member.personal_number || null,
          member.age || null,
          member.phone || null,
          member.address.street || null,
          member.address.apartment || null,
          member.address.postal_code || null,
          member.address.city || null,
          member.profile_url || null,
          member.scraped_at || new Date().toISOString()
        );
      }
    });

    insert(members);
  }

  /**
   * Search companies by name (full-text search)
   */
  searchCompaniesByName(query: string, limit: number = 20): CompanyData[] {
    const rows = this.db
      .prepare(
        `
      SELECT c.* FROM companies c
      JOIN companies_fts fts ON c.org_number = fts.org_number
      WHERE companies_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `
      )
      .all(query, limit) as any[];

    return rows.map(this.rowToCompany);
  }

  /**
   * Search companies by industry
   */
  searchCompaniesByIndustry(params: {
    sni_code?: string;
    category?: string;
    city?: string;
    min_revenue?: number;
    limit?: number;
  }): CompanyData[] {
    let sql = 'SELECT * FROM companies WHERE 1=1';
    const values: any[] = [];

    if (params.sni_code) {
      sql += ' AND sni_code = ?';
      values.push(params.sni_code);
    }

    if (params.category) {
      sql += ' AND categories LIKE ?';
      values.push(`%${params.category}%`);
    }

    if (params.city) {
      sql += ' AND city = ?';
      values.push(params.city);
    }

    if (params.min_revenue) {
      sql += ' AND revenue >= ?';
      values.push(params.min_revenue);
    }

    sql += ' ORDER BY revenue DESC LIMIT ?';
    values.push(params.limit || 20);

    const rows = this.db.prepare(sql).all(...values) as any[];
    return rows.map(this.rowToCompany);
  }

  /**
   * Search people by name
   */
  searchPeople(name: string, role?: string, limit: number = 20): PersonDetails[] {
    let sql = 'SELECT * FROM people WHERE name LIKE ?';
    const values: any[] = [`%${name}%`];

    if (role) {
      sql += ' AND role = ?';
      values.push(role);
    }

    sql += ' LIMIT ?';
    values.push(limit);

    const rows = this.db.prepare(sql).all(...values) as any[];
    return rows.map(this.rowToPerson);
  }

  /**
   * Get cached companies with filters
   */
  getCachedCompanies(params: {
    city?: string;
    status?: string;
    has_remarks?: boolean;
    sort_by?: string;
    order?: string;
    limit?: number;
    offset?: number;
  }): CompanyData[] {
    let sql = 'SELECT * FROM companies WHERE 1=1';
    const values: any[] = [];

    if (params.city) {
      sql += ' AND city = ?';
      values.push(params.city);
    }

    if (params.status) {
      sql += ' AND status = ?';
      values.push(params.status);
    }

    if (params.has_remarks !== undefined) {
      sql += ' AND has_remarks = ?';
      values.push(params.has_remarks ? 1 : 0);
    }

    const sortBy = params.sort_by || 'scraped_at';
    const order = params.order || 'desc';
    sql += ` ORDER BY ${sortBy} ${order.toUpperCase()}`;

    sql += ' LIMIT ? OFFSET ?';
    values.push(params.limit || 50, params.offset || 0);

    const rows = this.db.prepare(sql).all(...values) as any[];
    return rows.map(this.rowToCompany);
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): CacheStats {
    const total_companies = this.db
      .prepare('SELECT COUNT(*) as count FROM companies')
      .get() as { count: number };

    const total_people = this.db
      .prepare('SELECT COUNT(*) as count FROM people')
      .get() as { count: number };

    const oldest = this.db
      .prepare('SELECT MIN(scraped_at) as oldest FROM companies')
      .get() as { oldest: string | null };

    const newest = this.db
      .prepare('SELECT MAX(scraped_at) as newest FROM companies')
      .get() as { newest: string | null };

    const cities = this.db
      .prepare(
        'SELECT city, COUNT(*) as count FROM companies WHERE city IS NOT NULL GROUP BY city'
      )
      .all() as { city: string; count: number }[];

    const statuses = this.db
      .prepare('SELECT status, COUNT(*) as count FROM companies GROUP BY status')
      .all() as { status: string; count: number }[];

    // Get database file size
    const dbPath = (this.db as any).name;
    const stats = fs.existsSync(dbPath) ? fs.statSync(dbPath) : { size: 0 };

    return {
      total_companies: total_companies.count,
      total_people: total_people.count,
      oldest_entry: oldest.oldest,
      newest_entry: newest.newest,
      cache_size_mb: Math.round((stats.size / 1024 / 1024) * 100) / 100,
      companies_by_city: Object.fromEntries(cities.map((c) => [c.city, c.count])),
      companies_by_status: Object.fromEntries(statuses.map((s) => [s.status || 'unknown', s.count])),
    };
  }

  /**
   * Clear cache older than specified days
   */
  clearCache(older_than_days: number): number {
    const result = this.db.prepare(CLEANUP_SQL.split(';')[0]).run(older_than_days);
    logger.info({ deleted: result.changes, older_than_days }, 'Cache cleared');
    return result.changes;
  }

  /**
   * Check if company cache is stale
   */
  isCacheStale(org_number: string, stale_days: number): boolean {
    const row = this.db
      .prepare(
        `
      SELECT julianday('now') - julianday(scraped_at) as age_days
      FROM companies WHERE org_number = ?
    `
      )
      .get(org_number) as { age_days: number } | undefined;

    return !row || row.age_days > stale_days;
  }

  /**
   * Convert database row to CompanyData
   */
  private rowToCompany(row: any): CompanyData {
    return {
      org_number: row.org_number,
      name: row.name,
      legal_form: row.legal_form,
      status: row.status,
      registration_date: row.registration_date,
      contact: {
        phone: row.phone,
        address: row.address,
        postal_code: row.postal_code,
        city: row.city,
        municipality: row.municipality,
        county: row.county,
      },
      tax_info: {
        f_skatt: Boolean(row.f_skatt),
        vat_registered: Boolean(row.vat_registered),
        employer_registered: Boolean(row.employer_registered),
      },
      financials: row.revenue
        ? {
            period: row.financial_period,
            revenue: row.revenue,
            profit_after_financial: row.profit_after_financial,
            net_profit: row.net_profit,
            total_assets: row.total_assets,
            currency: row.currency || 'SEK',
          }
        : undefined,
      industry: {
        sni_code: row.sni_code,
        sni_description: row.sni_description,
        categories: row.categories ? JSON.parse(row.categories) : [],
        activity_description: row.activity_description,
      },
      bankgiro_number: row.bankgiro_number,
      has_remarks: Boolean(row.has_remarks),
      remarks: row.remarks,
      source_url: row.source_url,
      scraped_at: row.scraped_at,
      updated_at: row.updated_at,
    };
  }

  /**
   * Convert database row to PersonDetails
   */
  private rowToPerson(row: any): PersonDetails {
    return {
      id: row.id,
      org_number: row.org_number,
      name: row.name,
      role: row.role,
      personal_number: row.personal_number,
      age: row.age,
      phone: row.phone,
      address: {
        street: row.street,
        apartment: row.apartment,
        postal_code: row.postal_code,
        city: row.city,
      },
      profile_url: row.profile_url,
      scraped_at: row.scraped_at,
    };
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
    logger.info('Database closed');
  }
}
