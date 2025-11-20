#!/usr/bin/env node

/**
 * Merinfo MCP Server
 * Main entry point - STDIO transport
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { CompanyDatabase } from './cache/database.js';
import { MerinfoTools } from './server/tools.js';
import { MerinfoResources } from './server/resources.js';
import { MerinfoPrompts } from './server/prompts.js';
import { browserPool } from './scraper/browser.js';
import { logger } from './utils/logger.js';
import { DEFAULT_CONFIG } from './types.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Initialize MCP Server
 */
async function main() {
  logger.info('Initializing Merinfo MCP Server...');

  // Initialize database
  const db = new CompanyDatabase(DEFAULT_CONFIG.database_path);

  // Initialize tools, resources, and prompts
  const tools = new MerinfoTools(db);
  const resources = new MerinfoResources(db);
  const prompts = new MerinfoPrompts(db);

  // Initialize browser pool
  await browserPool.initialize();

  // Create MCP server
  const server = new Server(
    {
      name: 'merinfo-mcp-server',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
      },
    }
  );

  /**
   * List available tools
   */
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'search_company_by_org_number',
          description:
            'Search for Swedish company by organization number (format: XXXXXX-XXXX). Returns company details and optionally board members.',
          inputSchema: {
            type: 'object',
            properties: {
              org_number: {
                type: 'string',
                description: 'Swedish organization number',
                pattern: '^\\d{6}-?\\d{4}$',
              },
              force_refresh: {
                type: 'boolean',
                description: 'Force scrape even if cached data exists',
                default: false,
              },
              include_board: {
                type: 'boolean',
                description: 'Include board member details',
                default: true,
              },
            },
            required: ['org_number'],
          },
        },
        {
          name: 'get_company_details',
          description: 'Get detailed cached information about a company',
          inputSchema: {
            type: 'object',
            properties: {
              org_number: {
                type: 'string',
                description: 'Swedish organization number',
              },
            },
            required: ['org_number'],
          },
        },
        {
          name: 'search_companies_by_industry',
          description: 'Search cached companies by SNI code or industry category',
          inputSchema: {
            type: 'object',
            properties: {
              sni_code: {
                type: 'string',
                description: 'Swedish SNI code (5 digits)',
              },
              category: {
                type: 'string',
                description: 'Industry category keyword',
              },
              city: {
                type: 'string',
                description: 'Filter by city',
              },
              min_revenue: {
                type: 'number',
                description: 'Minimum revenue in SEK',
              },
              limit: {
                type: 'number',
                description: 'Maximum number of results',
                default: 20,
                maximum: 100,
              },
            },
          },
        },
        {
          name: 'search_company_by_name',
          description: 'Full-text search for companies by name or description',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Search query',
                minLength: 3,
              },
              limit: {
                type: 'number',
                default: 10,
                maximum: 50,
              },
            },
            required: ['query'],
          },
        },
        {
          name: 'get_board_members',
          description: 'Get board members and key people for a company',
          inputSchema: {
            type: 'object',
            properties: {
              org_number: {
                type: 'string',
                description: 'Swedish organization number',
              },
              force_refresh: {
                type: 'boolean',
                default: false,
              },
            },
            required: ['org_number'],
          },
        },
        {
          name: 'search_person',
          description: 'Search for people by name across all cached companies',
          inputSchema: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: "Person's name (partial match supported)",
                minLength: 3,
              },
              role: {
                type: 'string',
                description: 'Filter by role (VD, Ordförande, Styrelseledamot, etc.)',
              },
              limit: {
                type: 'number',
                default: 20,
                maximum: 100,
              },
            },
            required: ['name'],
          },
        },
        {
          name: 'get_financial_data',
          description: 'Get financial summary for a company',
          inputSchema: {
            type: 'object',
            properties: {
              org_number: {
                type: 'string',
              },
            },
            required: ['org_number'],
          },
        },
        {
          name: 'get_tax_information',
          description: 'Get tax registration details for a company',
          inputSchema: {
            type: 'object',
            properties: {
              org_number: {
                type: 'string',
              },
            },
            required: ['org_number'],
          },
        },
        {
          name: 'get_cached_companies',
          description: 'List all cached companies with filters',
          inputSchema: {
            type: 'object',
            properties: {
              city: { type: 'string' },
              status: { type: 'string' },
              has_remarks: { type: 'boolean' },
              sort_by: {
                type: 'string',
                enum: ['name', 'revenue', 'scraped_at'],
                default: 'scraped_at',
              },
              order: {
                type: 'string',
                enum: ['asc', 'desc'],
                default: 'desc',
              },
              limit: {
                type: 'number',
                default: 50,
                maximum: 200,
              },
              offset: {
                type: 'number',
                default: 0,
              },
            },
          },
        },
        {
          name: 'update_company_data',
          description: 'Force refresh of cached company data',
          inputSchema: {
            type: 'object',
            properties: {
              org_number: {
                type: 'string',
              },
            },
            required: ['org_number'],
          },
        },
        {
          name: 'clear_cache',
          description: 'Clear cached data (admin operation)',
          inputSchema: {
            type: 'object',
            properties: {
              older_than_days: {
                type: 'number',
                description: 'Clear cache older than N days',
                default: 30,
              },
              confirm: {
                type: 'boolean',
                description: 'Confirmation flag',
                default: false,
              },
            },
            required: ['confirm'],
          },
        },
        {
          name: 'get_cache_stats',
          description: 'Get cache statistics and health metrics',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
      ],
    };
  });

  /**
   * Handle tool calls
   */
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;

    try {
      let result;

      switch (name) {
        case 'search_company_by_org_number':
          result = await tools.searchCompanyByOrgNumber(args as any);
          break;
        case 'get_company_details':
          result = await tools.getCompanyDetails(args as any);
          break;
        case 'search_companies_by_industry':
          result = await tools.searchCompaniesByIndustry(args as any);
          break;
        case 'search_company_by_name':
          result = await tools.searchCompanyByName(args as any);
          break;
        case 'get_board_members':
          result = await tools.getBoardMembers(args as any);
          break;
        case 'search_person':
          result = await tools.searchPerson(args as any);
          break;
        case 'get_financial_data':
          result = await tools.getFinancialData(args as any);
          break;
        case 'get_tax_information':
          result = await tools.getTaxInformation(args as any);
          break;
        case 'get_cached_companies':
          result = await tools.getCachedCompanies(args as any);
          break;
        case 'update_company_data':
          result = await tools.updateCompanyData(args as any);
          break;
        case 'clear_cache':
          result = await tools.clearCache(args as any);
          break;
        case 'get_cache_stats':
          result = await tools.getCacheStats();
          break;
        default:
          throw new Error(`Unknown tool: ${name}`);
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      logger.error({ tool: name, error }, 'Tool execution error');

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: false,
                error: error instanceof Error ? error.message : String(error),
              },
              null,
              2
            ),
          },
        ],
        isError: true,
      };
    }
  });

  /**
   * List resources
   */
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
      resources: resources.listResources(),
    };
  });

  /**
   * Read resource
   */
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;

    try {
      const { contents, mimeType } = resources.readResource(uri);

      return {
        contents: [
          {
            uri,
            mimeType,
            text: contents,
          },
        ],
      };
    } catch (error) {
      logger.error({ uri, error }, 'Resource read error');
      throw error;
    }
  });

  /**
   * List prompts
   */
  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    return {
      prompts: prompts.listPrompts(),
    };
  });

  /**
   * Get prompt
   */
  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      const prompt = prompts.getPrompt(name, args || {});

      return {
        description: `Prompt: ${name}`,
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: prompt,
            },
          },
        ],
      };
    } catch (error) {
      logger.error({ prompt: name, error }, 'Prompt generation error');
      throw error;
    }
  });

  /**
   * Start server
   */
  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info('Merinfo MCP Server started successfully');

  /**
   * Cleanup on exit
   */
  process.on('SIGINT', async () => {
    logger.info('Shutting down...');
    await browserPool.closeAll();
    db.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('Shutting down...');
    await browserPool.closeAll();
    db.close();
    process.exit(0);
  });
}

// Run server
main().catch((error) => {
  logger.error({ error }, 'Fatal error');
  process.exit(1);
});
