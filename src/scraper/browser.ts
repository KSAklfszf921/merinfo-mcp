/**
 * Playwright browser pool management
 * Based on merinfo_scraper browser handling + allabolag request patterns
 */

import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { logger } from '../utils/logger.js';
import { DEFAULT_CONFIG } from '../types.js';

export class BrowserPool {
  private browser: Browser | null = null;
  private contexts: BrowserContext[] = [];
  private maxContexts = 3;
  private contextAge: Map<BrowserContext, number> = new Map();
  private maxContextAgeMs = 600_000; // 10 minutes

  constructor(private headless: boolean = DEFAULT_CONFIG.playwright_headless) {}

  /**
   * Initialize browser
   */
  async initialize(): Promise<void> {
    if (this.browser) return;

    logger.info('Initializing Playwright browser...');

    try {
      this.browser = await chromium.launch({
        headless: this.headless,
        args: [
          '--disable-blink-features=AutomationControlled',
          '--no-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-setuid-sandbox',
          '--disable-web-security',
        ],
        // In Docker, explicitly use system chromium
        executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
      });

      logger.info('Browser initialized successfully');
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          headless: this.headless,
          execPath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
        },
        'Failed to launch Chromium browser'
      );
      throw error;
    }
  }

  /**
   * Acquire a browser context
   */
  async acquireContext(): Promise<BrowserContext> {
    if (!this.browser) {
      await this.initialize();
    }

    // Clean up old contexts
    await this.cleanupOldContexts();

    // Create new context if under limit
    if (this.contexts.length < this.maxContexts) {
      const context = await this.createContext();
      this.contexts.push(context);
      this.contextAge.set(context, Date.now());
      return context;
    }

    // Reuse oldest context
    const oldestContext = this.contexts[0];
    return oldestContext;
  }

  /**
   * Create a new browser context with stealth settings
   */
  private async createContext(): Promise<BrowserContext> {
    if (!this.browser) throw new Error('Browser not initialized');

    const context = await this.browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'sv-SE',
      timezoneId: 'Europe/Stockholm',
      // Random features for stealth
      deviceScaleFactor: 1 + Math.random() * 0.2,
    });

    // Remove automation indicators
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
      });
    });

    logger.debug('Created new browser context');
    return context;
  }

  /**
   * Create a new page with default settings
   */
  async createPage(context: BrowserContext): Promise<Page> {
    const page = await context.newPage();

    // Set default timeout
    page.setDefaultTimeout(DEFAULT_CONFIG.playwright_timeout);

    logger.debug('Created new page');
    return page;
  }

  /**
   * Release a context (keep it for reuse)
   */
  async releaseContext(context: BrowserContext): Promise<void> {
    // Just update timestamp, keep context for reuse
    this.contextAge.set(context, Date.now());
  }

  /**
   * Clean up contexts older than max age
   */
  private async cleanupOldContexts(): Promise<void> {
    const now = Date.now();
    const contextsToRemove: BrowserContext[] = [];

    for (const [context, age] of this.contextAge.entries()) {
      if (now - age > this.maxContextAgeMs) {
        contextsToRemove.push(context);
      }
    }

    for (const context of contextsToRemove) {
      await context.close();
      this.contexts = this.contexts.filter((c) => c !== context);
      this.contextAge.delete(context);
      logger.debug('Closed old browser context');
    }
  }

  /**
   * Restart browser (on errors or rate limits)
   */
  async restart(): Promise<void> {
    logger.warn('Restarting browser...');

    await this.closeAll();
    this.browser = null;
    this.contexts = [];
    this.contextAge.clear();

    // Wait before reinitializing
    await new Promise((resolve) => setTimeout(resolve, 5000));

    await this.initialize();
  }

  /**
   * Close all contexts and browser
   */
  async closeAll(): Promise<void> {
    for (const context of this.contexts) {
      try {
        await context.close();
      } catch (error) {
        logger.error({ error }, 'Error closing context');
      }
    }

    if (this.browser) {
      try {
        await this.browser.close();
        logger.info('Browser closed');
      } catch (error) {
        logger.error({ error }, 'Error closing browser');
      }
    }

    this.browser = null;
    this.contexts = [];
    this.contextAge.clear();
  }

  /**
   * Check if browser is healthy
   */
  isHealthy(): boolean {
    return this.browser !== null && this.browser.isConnected();
  }
}

/**
 * Global browser pool instance
 */
export const browserPool = new BrowserPool();
