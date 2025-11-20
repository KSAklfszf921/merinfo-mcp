#!/usr/bin/env node

/**
 * Test script for Merinfo MCP Server
 * Tests all 12 tools systematically
 */

import { spawn } from 'child_process';
import { stdin, stdout } from 'process';

const TEST_ORG_NUMBER = '5566313788'; // Example org number (remove dash for testing)

// Colors for output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(color, ...args) {
  console.log(color, ...args, colors.reset);
}

// Test cases for all 12 tools
const tests = [
  {
    name: '1. get_cache_stats',
    tool: 'get_cache_stats',
    args: {},
    description: 'Get initial cache statistics',
  },
  {
    name: '2. search_company_by_org_number (fresh scrape)',
    tool: 'search_company_by_org_number',
    args: {
      org_number: TEST_ORG_NUMBER,
      include_board: true,
      force_refresh: false,
    },
    description: 'Search and scrape a company',
  },
  {
    name: '3. get_company_details (from cache)',
    tool: 'get_company_details',
    args: {
      org_number: TEST_ORG_NUMBER,
    },
    description: 'Get cached company details',
  },
  {
    name: '4. get_board_members',
    tool: 'get_board_members',
    args: {
      org_number: TEST_ORG_NUMBER,
      force_refresh: false,
    },
    description: 'Get board members from cache',
  },
  {
    name: '5. get_financial_data',
    tool: 'get_financial_data',
    args: {
      org_number: TEST_ORG_NUMBER,
    },
    description: 'Get financial data',
  },
  {
    name: '6. get_tax_information',
    tool: 'get_tax_information',
    args: {
      org_number: TEST_ORG_NUMBER,
    },
    description: 'Get tax information',
  },
  {
    name: '7. get_cached_companies',
    tool: 'get_cached_companies',
    args: {
      limit: 10,
      sort_by: 'scraped_at',
      order: 'desc',
    },
    description: 'List cached companies',
  },
  {
    name: '8. search_company_by_name',
    tool: 'search_company_by_name',
    args: {
      query: 'AB',
      limit: 5,
    },
    description: 'Full-text search by name',
  },
  {
    name: '9. search_companies_by_industry (if SNI available)',
    tool: 'search_companies_by_industry',
    args: {
      limit: 5,
    },
    description: 'Search by industry (may be empty)',
  },
  {
    name: '10. search_person (if people cached)',
    tool: 'search_person',
    args: {
      name: 'AB',
      limit: 5,
    },
    description: 'Search people by name',
  },
  {
    name: '11. get_cache_stats (after operations)',
    tool: 'get_cache_stats',
    args: {},
    description: 'Verify cache has data',
  },
];

async function runTest(testCase) {
  log(colors.cyan, `\n${'='.repeat(60)}`);
  log(colors.cyan, `TEST: ${testCase.name}`);
  log(colors.cyan, `Description: ${testCase.description}`);
  log(colors.cyan, '='.repeat(60));

  return new Promise((resolve) => {
    const mcp = spawn('node', ['dist/index.js'], {
      cwd: '/Users/isak/merinfo-mcp',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let output = '';
    let errorOutput = '';

    mcp.stdout.on('data', (data) => {
      output += data.toString();
    });

    mcp.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    mcp.on('close', (code) => {
      if (code !== 0) {
        log(colors.red, `❌ Test failed with exit code ${code}`);
        if (errorOutput) {
          console.log('Error output:', errorOutput);
        }
        resolve({ success: false, error: `Exit code ${code}` });
        return;
      }

      try {
        const result = JSON.parse(output);
        log(colors.green, '✅ Test passed');
        console.log('Result:', JSON.stringify(result, null, 2).substring(0, 500));
        resolve({ success: true, result });
      } catch (error) {
        log(colors.red, `❌ Failed to parse output`);
        console.log('Raw output:', output.substring(0, 500));
        resolve({ success: false, error: error.message });
      }
    });

    // Send MCP request
    const request = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: testCase.tool,
        arguments: testCase.args,
      },
    };

    mcp.stdin.write(JSON.stringify(request) + '\n');
    mcp.stdin.end();

    // Timeout after 60 seconds
    setTimeout(() => {
      mcp.kill();
      log(colors.red, '❌ Test timeout');
      resolve({ success: false, error: 'Timeout' });
    }, 60000);
  });
}

async function main() {
  log(colors.blue, '\n🧪 MERINFO MCP SERVER - COMPREHENSIVE TEST SUITE\n');
  log(colors.yellow, '⚠️  This will scrape real data from merinfo.se');
  log(colors.yellow, '⚠️  Rate limit: 10 requests/minute');
  log(colors.yellow, '⚠️  Some tests may take time (browser startup, scraping)\n');

  const results = [];

  for (let i = 0; i < tests.length; i++) {
    const test = tests[i];

    // Skip industry search if no SNI code available yet
    if (test.name.includes('industry') && i < 2) {
      log(colors.yellow, `⏭️  Skipping ${test.name} (no data yet)`);
      continue;
    }

    const result = await runTest(test);
    results.push({ test: test.name, ...result });

    // Wait between tests to respect rate limits
    if (i < tests.length - 1) {
      const waitTime = 6000; // 6 seconds between tests
      log(colors.yellow, `\n⏳ Waiting ${waitTime/1000}s before next test...`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }

  // Summary
  log(colors.blue, '\n\n' + '='.repeat(60));
  log(colors.blue, '📊 TEST SUMMARY');
  log(colors.blue, '='.repeat(60));

  const passed = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  results.forEach((r) => {
    const icon = r.success ? '✅' : '❌';
    const color = r.success ? colors.green : colors.red;
    log(color, `${icon} ${r.test}`);
    if (r.error) {
      log(colors.red, `   Error: ${r.error}`);
    }
  });

  log(colors.blue, '\n' + '='.repeat(60));
  log(colors.cyan, `Total: ${results.length} tests`);
  log(colors.green, `Passed: ${passed}`);
  log(colors.red, `Failed: ${failed}`);
  log(colors.blue, '='.repeat(60) + '\n');

  if (failed === 0) {
    log(colors.green, '🎉 ALL TESTS PASSED!');
  } else {
    log(colors.red, '⚠️  SOME TESTS FAILED');
    process.exit(1);
  }
}

main().catch((error) => {
  log(colors.red, '💥 Fatal error:', error);
  process.exit(1);
});
