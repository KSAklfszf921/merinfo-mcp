/**
 * SQLite database schema definitions
 */

export const SCHEMA_SQL = `
-- Companies cache
CREATE TABLE IF NOT EXISTS companies (
    org_number TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    legal_form TEXT,
    status TEXT,
    registration_date TEXT,

    -- Contact
    phone TEXT,
    address TEXT,
    postal_code TEXT,
    city TEXT,
    municipality TEXT,
    county TEXT,

    -- Tax info
    f_skatt INTEGER DEFAULT 0,
    vat_registered INTEGER DEFAULT 0,
    employer_registered INTEGER DEFAULT 0,

    -- Financial
    financial_period TEXT,
    revenue INTEGER,
    profit_after_financial INTEGER,
    net_profit INTEGER,
    total_assets INTEGER,
    currency TEXT DEFAULT 'SEK',

    -- Industry
    sni_code TEXT,
    sni_description TEXT,
    categories TEXT, -- JSON array
    activity_description TEXT,

    -- Metadata
    bankgiro_number TEXT,
    has_remarks INTEGER DEFAULT 0,
    remarks TEXT,
    source_url TEXT,
    scraped_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Board members / Key people
CREATE TABLE IF NOT EXISTS people (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    org_number TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    personal_number TEXT,
    age INTEGER,
    phone TEXT,
    street TEXT,
    apartment TEXT,
    postal_code TEXT,
    city TEXT,
    profile_url TEXT,
    scraped_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (org_number) REFERENCES companies(org_number) ON DELETE CASCADE
);

-- Rate limiting tracker
CREATE TABLE IF NOT EXISTS rate_limits (
    identifier TEXT PRIMARY KEY,
    request_count INTEGER DEFAULT 0,
    window_start DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_request DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Scrape jobs queue (for async operations)
CREATE TABLE IF NOT EXISTS scrape_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    org_number TEXT NOT NULL,
    priority INTEGER DEFAULT 5,
    status TEXT DEFAULT 'pending', -- pending, processing, completed, failed
    attempts INTEGER DEFAULT 0,
    error_message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Full-text search index
CREATE VIRTUAL TABLE IF NOT EXISTS companies_fts USING fts5(
    org_number,
    name,
    sni_description,
    activity_description,
    categories,
    content='companies'
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_companies_name ON companies(name);
CREATE INDEX IF NOT EXISTS idx_companies_sni ON companies(sni_code);
CREATE INDEX IF NOT EXISTS idx_companies_city ON companies(city);
CREATE INDEX IF NOT EXISTS idx_companies_scraped_at ON companies(scraped_at);
CREATE INDEX IF NOT EXISTS idx_people_org_number ON people(org_number);
CREATE INDEX IF NOT EXISTS idx_people_name ON people(name);
CREATE INDEX IF NOT EXISTS idx_scrape_queue_status ON scrape_queue(status, priority DESC);

-- Triggers for FTS sync
CREATE TRIGGER IF NOT EXISTS companies_fts_insert AFTER INSERT ON companies BEGIN
  INSERT INTO companies_fts(org_number, name, sni_description, activity_description, categories)
  VALUES (new.org_number, new.name, new.sni_description, new.activity_description, new.categories);
END;

CREATE TRIGGER IF NOT EXISTS companies_fts_update AFTER UPDATE ON companies BEGIN
  UPDATE companies_fts SET
    name = new.name,
    sni_description = new.sni_description,
    activity_description = new.activity_description,
    categories = new.categories
  WHERE org_number = new.org_number;
END;

CREATE TRIGGER IF NOT EXISTS companies_fts_delete AFTER DELETE ON companies BEGIN
  DELETE FROM companies_fts WHERE org_number = old.org_number;
END;
`;

export const CLEANUP_SQL = `
-- Remove companies older than specified days
DELETE FROM companies
WHERE julianday('now') - julianday(scraped_at) > ?;

-- Remove orphaned people records
DELETE FROM people
WHERE org_number NOT IN (SELECT org_number FROM companies);

-- Clean old rate limit records
DELETE FROM rate_limits
WHERE julianday('now') - julianday(window_start) > 1;

-- Clean completed scrape jobs older than 7 days
DELETE FROM scrape_queue
WHERE status = 'completed'
AND julianday('now') - julianday(updated_at) > 7;
`;
