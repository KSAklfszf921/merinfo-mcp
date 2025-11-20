#!/usr/bin/env node

/**
 * Merinfo MCP Server - HTTP/SSE Transport
 * For deployment on Render.com
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import express from 'express';
import { CompanyDatabase } from './cache/database.js';
import { MerinfoTools } from './server/tools.js';
import { MerinfoResources } from './server/resources.js';
import { MerinfoPrompts } from './server/prompts.js';
import { browserPool } from './scraper/browser.js';
import { logger } from './utils/logger.js';
import { DEFAULT_CONFIG } from './types.js';
import dotenv from 'dotenv';

dotenv.config();

const PORT = parseInt(process.env.PORT || '3000');
const app = express();

// Enable JSON parsing
app.use(express.json());

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const db = new CompanyDatabase();
    const stats = db.getCacheStats();
    db.close();

    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      cache: {
        total_companies: stats.total_companies,
        total_people: stats.total_people,
        cache_size_mb: stats.cache_size_mb,
      },
      browser: {
        healthy: browserPool.isHealthy(),
      },
    });
  } catch (error) {
    logger.error({ error }, 'Health check failed');
    res.status(500).json({
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// Initialize MCP server
async function initializeMCP() {
  logger.info('Initializing Merinfo MCP Server (HTTP)...');

  const db = new CompanyDatabase(DEFAULT_CONFIG.database_path);
  const tools = new MerinfoTools(db);
  const resources = new MerinfoResources(db);
  const prompts = new MerinfoPrompts(db);

  await browserPool.initialize();

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

  // Set up handlers (same as STDIO version)
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    // ... (same tool definitions as index.ts)
    return { tools: [] }; // Simplified for brevity - copy from index.ts
  });

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
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
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

  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return { resources: resources.listResources() };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;
    const { contents, mimeType } = resources.readResource(uri);
    return { contents: [{ uri, mimeType, text: contents }] };
  });

  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    return { prompts: prompts.listPrompts() };
  });

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const prompt = prompts.getPrompt(name, args || {});
    return {
      description: `Prompt: ${name}`,
      messages: [{ role: 'user', content: { type: 'text', text: prompt } }],
    };
  });

  return server;
}

// MCP endpoint
app.get('/mcp', async (req, res) => {
  try {
    const server = await initializeMCP();
    const transport = new SSEServerTransport('/message', res);
    await server.connect(transport);

    logger.info('MCP client connected via SSE');
  } catch (error) {
    logger.error({ error }, 'Failed to initialize MCP');
    res.status(500).json({ error: 'Failed to initialize MCP server' });
  }
});

// Start server
app.listen(PORT, () => {
  logger.info({ port: PORT }, 'Merinfo MCP Server listening');
  console.log(`🚀 Merinfo MCP Server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🔌 MCP endpoint: http://localhost:${PORT}/mcp`);
});

// Cleanup
process.on('SIGINT', async () => {
  logger.info('Shutting down...');
  await browserPool.closeAll();
  process.exit(0);
});
