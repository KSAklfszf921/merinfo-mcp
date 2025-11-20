/**
 * Database setup script
 * Creates database and initializes schema
 */

import { CompanyDatabase } from '../src/cache/database.js';
import { DEFAULT_CONFIG } from '../src/types.js';
import { logger } from '../src/utils/logger.js';
import fs from 'fs';
import path from 'path';

async function setupDatabase() {
  console.log('🔧 Setting up Merinfo MCP database...\n');

  // Ensure data directory exists
  const dbPath = DEFAULT_CONFIG.database_path;
  const dir = path.dirname(dbPath);

  if (!fs.existsSync(dir)) {
    console.log(`📁 Creating directory: ${dir}`);
    fs.mkdirSync(dir, { recursive: true });
  }

  // Initialize database
  console.log(`💾 Initializing database: ${dbPath}`);
  const db = new CompanyDatabase(dbPath);

  // Get initial stats
  const stats = db.getCacheStats();

  console.log('\n✅ Database setup complete!\n');
  console.log('📊 Initial statistics:');
  console.log(`  - Total companies: ${stats.total_companies}`);
  console.log(`  - Total people: ${stats.total_people}`);
  console.log(`  - Database size: ${stats.cache_size_mb} MB`);

  db.close();

  console.log('\n🎉 Ready to start scraping Swedish company data!');
  console.log('\n💡 Next steps:');
  console.log('  1. npm run dev (for local development)');
  console.log('  2. npm start (for production)');
  console.log('  3. Use MCP client to connect and search companies\n');
}

setupDatabase().catch((error) => {
  console.error('❌ Setup failed:', error);
  process.exit(1);
});
