#!/usr/bin/env node

/**
 * Simple test to verify MCP server tools work
 * Tests by importing directly
 */

import { CompanyDatabase } from './dist/cache/database.js';
import { MerinfoTools } from './dist/server/tools.js';

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

async function main() {
  log(colors.blue, '\n🧪 MERINFO MCP SERVER - TOOL VERIFICATION\n');

  const db = new CompanyDatabase('./data/merinfo.db');
  const tools = new MerinfoTools(db);

  let passed = 0;
  let failed = 0;

  // Test 1: Get cache stats (should always work)
  try {
    log(colors.cyan, '\n1️⃣  Testing: get_cache_stats');
    const result = await tools.getCacheStats();
    if (result.success) {
      log(colors.green, '   ✅ PASS - Cache stats retrieved');
      console.log(`   📊 Companies: ${result.total_companies}, People: ${result.total_people}`);
      passed++;
    } else {
      throw new Error('Failed');
    }
  } catch (error) {
    log(colors.red, `   ❌ FAIL - ${error.message}`);
    failed++;
  }

  // Test 2: Get cached companies (empty cache is OK)
  try {
    log(colors.cyan, '\n2️⃣  Testing: get_cached_companies');
    const result = await tools.getCachedCompanies({ limit: 10 });
    if (result.success) {
      log(colors.green, `   ✅ PASS - Found ${result.count} cached companies`);
      passed++;
    } else {
      throw new Error('Failed');
    }
  } catch (error) {
    log(colors.red, `   ❌ FAIL - ${error.message}`);
    failed++;
  }

  // Test 3: Search company (this will actually scrape!)
  try {
    log(colors.cyan, '\n3️⃣  Testing: search_company_by_org_number');
    log(colors.yellow, '   ⏳ This will scrape merinfo.se (may take 10-30 seconds)...');

    const result = await tools.searchCompanyByOrgNumber({
      org_number: '556631-3788',
      include_board: true,
      force_refresh: false,
    });

    if (result.success && result.company) {
      log(colors.green, `   ✅ PASS - Company found: ${result.company.name}`);
      log(colors.cyan, `   📍 Cached: ${result.cached ? 'Yes' : 'No (freshly scraped)'}`);
      log(colors.cyan, `   👥 Board members: ${result.board_members?.length || 0}`);
      passed++;
    } else {
      throw new Error('No company data returned');
    }
  } catch (error) {
    log(colors.red, `   ❌ FAIL - ${error.message}`);
    failed++;
  }

  // Test 4: Get company details (from cache)
  try {
    log(colors.cyan, '\n4️⃣  Testing: get_company_details');
    const result = await tools.getCompanyDetails({
      org_number: '556631-3788',
    });

    if (result.success && result.company) {
      log(colors.green, `   ✅ PASS - Details retrieved from cache`);
      log(colors.cyan, `   🏢 Status: ${result.company.status}`);
      passed++;
    } else {
      throw new Error(result.error || 'Failed');
    }
  } catch (error) {
    log(colors.red, `   ❌ FAIL - ${error.message}`);
    failed++;
  }

  // Test 5: Get financial data
  try {
    log(colors.cyan, '\n5️⃣  Testing: get_financial_data');
    const result = await tools.getFinancialData({
      org_number: '556631-3788',
    });

    if (result.success) {
      log(colors.green, `   ✅ PASS - Financial data retrieved`);
      if (result.has_data) {
        log(colors.cyan, `   💰 Revenue: ${result.financials?.revenue ? (result.financials.revenue/1000).toLocaleString() + ' tkr' : 'N/A'}`);
      }
      passed++;
    } else {
      throw new Error(result.error || 'Failed');
    }
  } catch (error) {
    log(colors.red, `   ❌ FAIL - ${error.message}`);
    failed++;
  }

  // Test 6: Get tax information
  try {
    log(colors.cyan, '\n6️⃣  Testing: get_tax_information');
    const result = await tools.getTaxInformation({
      org_number: '556631-3788',
    });

    if (result.success) {
      log(colors.green, `   ✅ PASS - Tax info retrieved`);
      log(colors.cyan, `   📋 F-skatt: ${result.tax_info.f_skatt ? 'Yes' : 'No'}`);
      passed++;
    } else {
      throw new Error(result.error || 'Failed');
    }
  } catch (error) {
    log(colors.red, `   ❌ FAIL - ${error.message}`);
    failed++;
  }

  // Test 7: Get board members
  try {
    log(colors.cyan, '\n7️⃣  Testing: get_board_members');
    const result = await tools.getBoardMembers({
      org_number: '556631-3788',
      force_refresh: false,
    });

    if (result.success) {
      log(colors.green, `   ✅ PASS - Board members retrieved`);
      log(colors.cyan, `   👥 Count: ${result.count}`);
      passed++;
    } else {
      throw new Error('Failed');
    }
  } catch (error) {
    log(colors.red, `   ❌ FAIL - ${error.message}`);
    failed++;
  }

  // Test 8: Search by name
  try {
    log(colors.cyan, '\n8️⃣  Testing: search_company_by_name');
    const result = await tools.searchCompanyByName({
      query: 'Århult',
      limit: 5,
    });

    if (result.success) {
      log(colors.green, `   ✅ PASS - Search completed`);
      log(colors.cyan, `   🔍 Results: ${result.count}`);
      passed++;
    } else {
      throw new Error('Failed');
    }
  } catch (error) {
    log(colors.red, `   ❌ FAIL - ${error.message}`);
    failed++;
  }

  // Test 9: Search person
  try {
    log(colors.cyan, '\n9️⃣  Testing: search_person');
    const result = await tools.searchPerson({
      name: 'sson',
      limit: 5,
    });

    if (result.success) {
      log(colors.green, `   ✅ PASS - Person search completed`);
      log(colors.cyan, `   👤 Results: ${result.count}`);
      passed++;
    } else {
      throw new Error('Failed');
    }
  } catch (error) {
    log(colors.red, `   ❌ FAIL - ${error.message}`);
    failed++;
  }

  // Test 10: Final cache stats
  try {
    log(colors.cyan, '\n🔟 Testing: get_cache_stats (final)');
    const result = await tools.getCacheStats();
    if (result.success) {
      log(colors.green, '   ✅ PASS - Final cache stats');
      console.log(`   📊 Companies: ${result.total_companies}, People: ${result.total_people}`);
      passed++;
    } else {
      throw new Error('Failed');
    }
  } catch (error) {
    log(colors.red, `   ❌ FAIL - ${error.message}`);
    failed++;
  }

  // Summary
  db.close();

  log(colors.blue, '\n' + '='.repeat(60));
  log(colors.blue, '📊 TEST SUMMARY');
  log(colors.blue, '='.repeat(60));
  log(colors.cyan, `Total tests: ${passed + failed}`);
  log(colors.green, `Passed: ${passed}`);
  log(colors.red, `Failed: ${failed}`);
  log(colors.blue, '='.repeat(60) + '\n');

  if (failed === 0) {
    log(colors.green, '🎉 ALL TESTS PASSED!\n');
    process.exit(0);
  } else {
    log(colors.red, '⚠️  SOME TESTS FAILED\n');
    process.exit(1);
  }
}

main().catch((error) => {
  log(colors.red, '💥 Fatal error:', error);
  console.error(error);
  process.exit(1);
});
