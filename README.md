# Merinfo MCP Server

🇸🇪 **Model Context Protocol server for Swedish company information** from [merinfo.se](https://www.merinfo.se) and [allabolag.se](https://www.allabolag.se).

A production-ready MCP server that combines web scraping with intelligent caching to provide AI assistants with comprehensive Swedish business intelligence.

## ✨ Features

### 🔧 12 MCP Tools
- **`search_company_by_org_number`** - Search by Swedish organization number
- **`get_company_details`** - Retrieve cached company data
- **`search_companies_by_industry`** - Filter by SNI code or category
- **`search_company_by_name`** - Full-text search
- **`get_board_members`** - Board member and management details
- **`search_person`** - Search people across all companies
- **`get_financial_data`** - Financial metrics and ratios
- **`get_tax_information`** - Tax registration status
- **`get_cached_companies`** - List cached data with filters
- **`update_company_data`** - Force refresh company data
- **`clear_cache`** - Cache management (admin)
- **`get_cache_stats`** - Database health metrics

### 📦 5 MCP Resources
- `company://{org_number}` - Direct company access
- `companies://recent?limit=N` - Recently scraped companies
- `companies://search?q={query}` - Search results
- `companies://industry/{sni_code}` - Industry listings
- `stats://cache` - Cache statistics

### 💬 4 MCP Prompts
- **`analyze-company`** - Financial health assessment
- **`compare-companies`** - Side-by-side comparison
- **`industry-overview`** - Market analysis by SNI code
- **`due-diligence`** - Comprehensive due diligence report

### 🚀 Advanced Features
- ✅ **Intelligent caching** with SQLite (30-day TTL)
- ✅ **Rate limiting** (10 requests/minute to merinfo.se)
- ✅ **Exponential backoff** with retry logic
- ✅ **Playwright browser pool** for stable scraping
- ✅ **Full-text search** with FTS5
- ✅ **Structured logging** with Pino
- ✅ **Input validation** with Zod schemas
- ✅ **TypeScript** for type safety
- ✅ **Health checks** for production deployment

## 📋 Data Collected

### Company Information
- Basic details (name, org number, legal form, status)
- Contact info (phone, address, municipality, county)
- Tax registrations (F-skatt, VAT, employer)
- Financial data (revenue, profit, assets)
- Industry classification (SNI codes, categories)
- Activity description
- Board members and management

### Board Members
- Name, role, age
- Contact details
- Address information
- Multiple roles supported (VD, Ordförande, Styrelseledamot, etc.)

## 🏗️ Architecture

```
merinfo-mcp/
├── src/
│   ├── index.ts                    # Main MCP server (STDIO)
│   ├── streamable-http-server.ts   # HTTP/SSE server (Render)
│   ├── types.ts                    # TypeScript interfaces
│   ├── scraper/
│   │   ├── browser.ts              # Playwright pool management
│   │   └── merinfo.ts              # Scraping logic
│   ├── cache/
│   │   ├── database.ts             # SQLite operations
│   │   └── schema.ts               # Database schema
│   ├── utils/
│   │   ├── rate-limiter.ts         # Token bucket + backoff
│   │   ├── parsers.ts              # Swedish data parsers
│   │   ├── validators.ts           # Zod schemas
│   │   └── logger.ts               # Pino logging
│   └── server/
│       ├── tools.ts                # MCP tool implementations
│       ├── resources.ts            # MCP resource handlers
│       └── prompts.ts              # MCP prompt templates
├── scripts/
│   └── setup-db.ts                 # Database initialization
└── data/
    └── merinfo.db                  # SQLite database (auto-created)
```

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- npm or yarn
- Playwright browsers (auto-installed)

### Installation

```bash
# Clone repository
git clone https://github.com/YOUR_USERNAME/merinfo-mcp.git
cd merinfo-mcp

# Install dependencies
npm install

# Setup database
npm run setup-db

# Start development server
npm run dev
```

### Configuration

Copy `.env.example` to `.env` and customize:

```bash
cp .env.example .env
```

Key settings:
```env
DATABASE_PATH=./data/merinfo.db
PLAYWRIGHT_HEADLESS=true
RATE_LIMIT_SCRAPING_RPM=10
CACHE_TTL_DAYS=30
LOG_LEVEL=info
```

### Usage with MCP Clients

#### Claude Desktop (Mac/Windows)

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "merinfo": {
      "command": "node",
      "args": ["/path/to/merinfo-mcp/dist/index.js"],
      "env": {
        "DATABASE_PATH": "/path/to/data/merinfo.db"
      }
    }
  }
}
```

#### Claude Code

```bash
claude mcp add merinfo node /path/to/merinfo-mcp/dist/index.js
```

#### VS Code Copilot / Cursor

Configure MCP servers in settings:
```json
{
  "mcp.servers": [
    {
      "name": "merinfo",
      "command": "node",
      "args": ["/path/to/merinfo-mcp/dist/index.js"]
    }
  ]
}
```

## 🌐 Remote Server (Render.com)

Deploy as HTTP/SSE server for remote access:

### Deploy to Render

1. Create `render.yaml`:

```yaml
services:
  - type: web
    name: merinfo-mcp
    env: node
    buildCommand: npm install && npm run build
    startCommand: npm run start:streamable
    plan: starter

    envVars:
      - key: NODE_ENV
        value: production
      - key: DATABASE_PATH
        value: /opt/render/project/data/merinfo.db
      - key: PLAYWRIGHT_HEADLESS
        value: true
      - key: LOG_LEVEL
        value: info

    disk:
      name: merinfo-data
      mountPath: /opt/render/project/data
      sizeGB: 10
```

2. Connect to GitHub and deploy
3. Access MCP endpoint: `https://your-app.onrender.com/mcp`

### Connect Remote Server

```bash
claude mcp add merinfo-remote --transport http https://your-app.onrender.com/mcp
```

## 📖 Example Usage

### Search Company

```javascript
// Search by organization number
{
  "tool": "search_company_by_org_number",
  "arguments": {
    "org_number": "556631-3788",
    "include_board": true
  }
}
```

### Analyze Industry

```javascript
// Get companies in specific industry
{
  "tool": "search_companies_by_industry",
  "arguments": {
    "sni_code": "62010",
    "city": "Stockholm",
    "min_revenue": 10000000,
    "limit": 20
  }
}
```

### Search by Name

```javascript
// Full-text search
{
  "tool": "search_company_by_name",
  "arguments": {
    "query": "assistans",
    "limit": 10
  }
}
```

### Generate Analysis

```javascript
// Use pre-built prompt
{
  "prompt": "analyze-company",
  "arguments": {
    "org_number": "556631-3788"
  }
}
```

## 🔒 Rate Limiting & Caching

### Rate Limits
- **Scraping:** 10 requests/minute to merinfo.se
- **Client:** 30 requests/minute per MCP client
- **Automatic backoff:** Exponential retry with jitter

### Cache Strategy
- **TTL:** 30 days (configurable)
- **Stale-while-revalidate:** Returns cached data if < 30 days
- **Background refresh:** Auto-refresh stale data (optional)
- **Storage:** SQLite with FTS5 for fast search

## 🛠️ Development

### Build

```bash
npm run build
```

### Run Tests

```bash
npm test
npm run test:coverage
```

### Linting & Formatting

```bash
npm run lint
npm run format
```

### Database Management

```bash
# View cache stats
npm run setup-db

# Clear old cache
# Use clear_cache tool with confirm: true
```

## 🏆 Credits & Inspiration

Built by combining best practices from:
- **[allabolag](https://github.com/marple-newsrobot/allabolag)** - Request client patterns, caching strategies
- **[merinfo_scraper](https://github.com/alshfu/merinfo_scraper)** - Scraping logic, rate limiting

Special thanks to:
- [Newsworthy](https://www.newsworthy.se) for the allabolag library
- Model Context Protocol team at Anthropic

## 📝 License

MIT License - see [LICENSE](LICENSE) for details

## 🤝 Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## ⚠️ Disclaimer

This server scrapes public data from merinfo.se and allabolag.se. Please:
- Respect rate limits
- Use responsibly
- Check terms of service
- Don't overwhelm their servers

This tool is for legitimate business intelligence and due diligence purposes only.

## 🆘 Support

- **Issues:** [GitHub Issues](https://github.com/YOUR_USERNAME/merinfo-mcp/issues)
- **Discussions:** [GitHub Discussions](https://github.com/YOUR_USERNAME/merinfo-mcp/discussions)

## 📊 Status

![GitHub last commit](https://img.shields.io/github/last-commit/YOUR_USERNAME/merinfo-mcp)
![GitHub issues](https://img.shields.io/github/issues/YOUR_USERNAME/merinfo-mcp)
![License](https://img.shields.io/github/license/YOUR_USERNAME/merinfo-mcp)

---

**Made with ❤️ for the MCP ecosystem**
