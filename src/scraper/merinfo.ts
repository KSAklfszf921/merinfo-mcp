/**
 * Merinfo.se scraper
 * Combines patterns from merinfo_scraper.py and allabolag request handling
 */

import { Page } from 'playwright';
import { browserPool } from './browser.js';
import { CompanyData, PersonDetails, NoSuchCompanyError, ScraperError, DEFAULT_CONFIG } from '../types.js';
import { logger, logScrapingOperation } from '../utils/logger.js';
import { RateLimiter, withRetry } from '../utils/rate-limiter.js';
import {
  cleanText,
  parseValue,
  parseAddress,
  parseApartment,
  parseBoolean,
  parseThousands,
  parseAge,
  normalizeOrgNumber,
} from '../utils/parsers.js';

const BASE_URL = 'https://www.merinfo.se';
const SEARCH_DELAY_MS = [1000, 2500]; // Random delay range
const rateLimiter = new RateLimiter(
  DEFAULT_CONFIG.rate_limit_scraping_rpm,
  60_000 // 1 minute window
);

/**
 * Main scraper class
 */
export class MerinfoScraper {
  /**
   * Search and scrape company by organization number
   */
  async scrapeCompany(
    org_number: string,
    include_board: boolean = true
  ): Promise<{ company: CompanyData; board_members: PersonDetails[] }> {
    const startTime = Date.now();
    const normalized_org = normalizeOrgNumber(org_number);

    try {
      // Rate limiting
      await rateLimiter.waitForSlot('merinfo_scraper');

      // Scrape with retry logic
      const result = await withRetry(
        async () => this.doScrape(normalized_org, include_board),
        {
          maxAttempts: 3,
          retryableErrors: ['ScraperError', 'TimeoutError'],
          onRetry: async (attempt, error) => {
            logger.warn({ attempt, error: error.message }, 'Retrying scrape...');
            if (attempt >= 2) {
              await browserPool.restart();
            }
          },
        }
      );

      const duration = Date.now() - startTime;
      logScrapingOperation('scrape_company', normalized_org, false, duration);

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logScrapingOperation('scrape_company', normalized_org, false, duration, error as Error);
      throw error;
    }
  }

  /**
   * Internal scrape method
   */
  private async doScrape(
    org_number: string,
    include_board: boolean
  ): Promise<{ company: CompanyData; board_members: PersonDetails[] }> {
    const context = await browserPool.acquireContext();
    const page = await browserPool.createPage(context);

    try {
      // Search for company
      await this.randomDelay();
      const companyUrl = await this.searchCompany(page, org_number);

      if (!companyUrl) {
        throw new NoSuchCompanyError(org_number);
      }

      // Check for search limit page
      if (await this.isSearchLimitReached(page)) {
        throw new ScraperError('Search limit reached on merinfo.se', true);
      }

      // Scrape company data
      await this.randomDelay();
      const company = await this.scrapeCompanyPage(page, companyUrl, org_number);

      // Scrape board members if requested
      let board_members: PersonDetails[] = [];
      if (include_board && DEFAULT_CONFIG.enable_person_details) {
        board_members = await this.scrapeBoardMembers(page, org_number);
      }

      await page.close();
      await browserPool.releaseContext(context);

      return { company, board_members };
    } catch (error) {
      await page.close();
      throw error;
    }
  }

  /**
   * Search for company and return URL
   */
  private async searchCompany(page: Page, org_number: string): Promise<string | null> {
    const searchUrl = `${BASE_URL}/search?q=${org_number}`;
    logger.debug({ url: searchUrl }, 'Searching company');

    await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });

    // Wait for search results
    try {
      await page.waitForSelector('div[class*="mi-shadow-dark-blue"]', { timeout: 10000 });
    } catch {
      return null;
    }

    // Find company card with matching org number
    const cardXPath = `//div[contains(@class, 'mi-shadow-dark-blue') and .//p[normalize-space()='${org_number}']]`;

    try {
      const card = await page.waitForSelector(`xpath=${cardXPath}`, { timeout: 5000 });

      if (!card) return null;

      // Check for warning remarks
      const warningSelector = ".//span[contains(@class, 'mi-text-red') and contains(text(), 'anmärka på')]";
      const hasWarning = await card.$(`xpath=${warningSelector}`);

      if (hasWarning) {
        const companyName = await card.$eval('a[href*="/foretag/"]', (el) => el.textContent);
        logger.warn({ org_number, name: companyName }, 'Company has remarks, skipping');
        throw new ScraperError(`Company ${companyName} has warning remarks`, false);
      }

      // Get company URL
      const link = await card.$('a[href*="/foretag/"]');
      if (!link) return null;

      const href = await link.getAttribute('href');
      if (!href) return null;

      // Check if href is already absolute URL
      return href.startsWith('http') ? href : `${BASE_URL}${href}`;
    } catch (error) {
      if (error instanceof ScraperError) throw error;
      return null;
    }
  }

  /**
   * Scrape company page
   */
  private async scrapeCompanyPage(page: Page, url: string, org_number: string): Promise<CompanyData> {
    logger.debug({ url }, 'Scraping company page');

    await page.goto(url, { waitUntil: 'domcontentloaded' });

    // Wait for company name
    await page.waitForSelector('h1 span.namn', { timeout: 10000 });

    const company: CompanyData = {
      org_number,
      name: '',
      contact: {},
      tax_info: {
        f_skatt: false,
        vat_registered: false,
        employer_registered: false,
      },
      industry: {},
      has_remarks: false,
      source_url: url,
      scraped_at: new Date().toISOString(),
    };

    // Company name
    company.name = (await this.getTextContent(page, 'h1 span.namn')) || '';

    // Legal form, status, registration date (from table)
    company.legal_form = (await this.getTableValue(page, 'Bolagsform:')) || undefined;
    company.status = (await this.getTableValue(page, 'Status:')) || undefined;
    company.registration_date = (await this.getTableValue(page, 'Registrerat:')) || undefined;

    // Remarks
    const remarksText = await this.getTextContent(page, '.mi-text-green, .mi-text-red, .mi-text-orange');
    if (remarksText) {
      company.has_remarks = true;
      company.remarks = remarksText;
    }

    // Contact info
    company.contact.phone = (await this.getTextContent(page, 'a[href^="tel:"]')) || undefined;

    const addressText = await this.getTextContent(page, 'address');
    if (addressText) {
      const cleanAddress = addressText.replace(company.name, '').trim();
      company.contact.address = cleanAddress;

      const parsed = parseAddress(cleanAddress);
      company.contact.postal_code = parsed.postal_code;
      company.contact.city = parsed.city;
    }

    company.contact.municipality = (await this.getTableValue(page, 'Kommunsäte:')) || undefined;
    company.contact.county = (await this.getTableValue(page, 'Länssäte:')) || undefined;

    // Tax info
    const fSkatt = await this.getTableValue(page, 'F-Skatt:');
    company.tax_info.f_skatt = parseBoolean(fSkatt);

    const moms = await this.getTableValue(page, 'Momsregistrerad:');
    company.tax_info.vat_registered = parseBoolean(moms);

    const arbetsgivare = await this.getTableValue(page, 'Arbetsgivare:');
    company.tax_info.employer_registered = parseBoolean(arbetsgivare);

    // Financial data
    const financialPeriod = await this.getTextContent(page, "h3:has-text('Nyckeltal 20')");
    if (financialPeriod) {
      company.financials = {
        period: financialPeriod.replace('Nyckeltal ', '').trim(),
        currency: 'SEK',
        revenue: (await this.getFinancialValue(page, 'Omsättning')) || undefined,
        profit_after_financial: (await this.getFinancialValue(page, 'Res. e. fin')) || undefined,
        net_profit: (await this.getFinancialValue(page, 'Årets resultat')) || undefined,
        total_assets: (await this.getFinancialValue(page, 'Summa tillgångar')) || undefined,
      };
    }

    // Industry info
    const sniText = await this.getTextContent(
      page,
      "h3:has-text('Svensk näringsgrensindelning') + div"
    );
    if (sniText) {
      const parts = sniText.split(' - ', 2);
      if (parts.length === 2) {
        company.industry.sni_code = parts[0].trim();
        company.industry.sni_description = parts[1].trim();
      } else {
        company.industry.sni_description = sniText;
      }
    }

    // Categories
    const categories = await page
      .$$eval("h3:has-text('Bransch') + div a", (links) => links.map((l) => l.textContent?.trim() || ''))
      .catch(() => []);
    company.industry.categories = categories.filter((c) => c);

    // Activity description
    company.industry.activity_description = (await this.getTextContent(
      page,
      "h3:has-text('Verksamhetsbeskrivning') + div div[class*='expanded']"
    )) || undefined;

    return company;
  }

  /**
   * Scrape board members
   */
  private async scrapeBoardMembers(page: Page, org_number: string): Promise<PersonDetails[]> {
    const members: PersonDetails[] = [];
    const roles = ['VD', 'Ordförande', 'Styrelseledamot', 'Ordinarie ledamot', 'Innehavare', 'Komplementär', 'Likvidator'];

    for (const role of roles) {
      try {
        const xpath = `//td[contains(., '${role}')]/following-sibling::td//a[contains(@href, '/person/')]`;
        const link = await page.$(`xpath=${xpath}`);

        if (!link) continue;

        const personUrl = await link.getAttribute('href');
        if (!personUrl) continue;

        const fullUrl = `${BASE_URL}${personUrl}`;

        // Scrape person details
        await this.randomDelay();
        const person = await this.scrapePersonPage(page, fullUrl, org_number, role);

        if (person) {
          members.push(person);
        }

        // Go back to company page
        await page.goBack({ waitUntil: 'domcontentloaded' });
        await page.waitForSelector('h1 span.namn', { timeout: 10000 });

        break; // Only scrape first person found
      } catch (error) {
        logger.debug({ role, error }, 'No person found for role');
        continue;
      }
    }

    return members;
  }

  /**
   * Scrape person details page
   */
  private async scrapePersonPage(
    page: Page,
    url: string,
    org_number: string,
    role: string
  ): Promise<PersonDetails | null> {
    logger.debug({ url, role }, 'Scraping person page');

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('h1 span.namn', { timeout: 10000 });

      const person: PersonDetails = {
        org_number,
        name: (await this.getTextContent(page, 'h1 span.namn')) || '',
        role,
        address: {},
        profile_url: url,
        scraped_at: new Date().toISOString(),
      };

      // Age
      const ageText = await this.getTextContent(page, "i[class*='fa-address-book'] + span");
      if (ageText) {
        person.age = parseAge(ageText) || undefined;
      }

      // Phone
      person.phone = (await this.getTextContent(page, 'a[href^="tel:"]')) || undefined;

      // Address
      const addressText = await this.getTextContent(page, '#oversikt address');
      if (addressText) {
        const apartment = parseApartment(addressText);
        const cleanAddress = addressText.replace(apartment || '', '');
        const parsed = parseAddress(cleanAddress);

        person.address = {
          street: parsed.street,
          apartment: apartment || undefined,
          postal_code: parsed.postal_code,
          city: parsed.city,
        };
      }

      return person;
    } catch (error) {
      logger.error({ url, error }, 'Error scraping person');
      return null;
    }
  }

  /**
   * Get table value by header text
   */
  private async getTableValue(page: Page, headerText: string): Promise<string | null> {
    try {
      const xpath = `//th[contains(., '${headerText}')]/following-sibling::td`;
      const element = await page.$(`xpath=${xpath}`);
      if (!element) return null;

      const text = await element.textContent();
      return cleanText(text);
    } catch {
      return null;
    }
  }

  /**
   * Get financial value (handles "1 234 tkr" format)
   */
  private async getFinancialValue(page: Page, labelText: string): Promise<number | null> {
    try {
      const xpath = `//span[contains(., '${labelText}')]/following-sibling::span`;
      const element = await page.$(`xpath=${xpath}`);
      if (!element) return null;

      const text = await element.textContent();
      return parseThousands(text);
    } catch {
      return null;
    }
  }

  /**
   * Get text content of selector
   */
  private async getTextContent(page: Page, selector: string): Promise<string | null> {
    try {
      const element = await page.$(selector);
      if (!element) return null;

      const text = await element.textContent();
      return cleanText(text);
    } catch {
      return null;
    }
  }

  /**
   * Check if search limit page is reached
   */
  private async isSearchLimitReached(page: Page): Promise<boolean> {
    const text = await page.textContent('body');
    return text?.includes('Oops, din sökgräns är nådd!') || false;
  }

  /**
   * Random delay between actions (stealth)
   */
  private async randomDelay(): Promise<void> {
    const [min, max] = SEARCH_DELAY_MS;
    const delay = Math.random() * (max - min) + min;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

/**
 * Global scraper instance
 */
export const merinfoScraper = new MerinfoScraper();
