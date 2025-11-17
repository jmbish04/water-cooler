--
-- Health Checks Table
-- Stores health check results for each connector
--

CREATE TABLE IF NOT EXISTS health_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sourceId INTEGER NOT NULL,
  sourceName TEXT NOT NULL,
  sourceType TEXT NOT NULL,
  status TEXT NOT NULL, -- 'healthy' | 'degraded' | 'failed'
  responseTime INTEGER, -- milliseconds
  errorMessage TEXT,
  errorStack TEXT,
  checkedAt TEXT NOT NULL,
  metadata TEXT, -- JSON: additional details like item count, API rate limit, etc.
  FOREIGN KEY (sourceId) REFERENCES sources(id) ON DELETE CASCADE
);

-- Index for quick lookups by source
CREATE INDEX IF NOT EXISTS idx_health_checks_source ON health_checks(sourceId, checkedAt DESC);

-- Index for latest health checks
CREATE INDEX IF NOT EXISTS idx_health_checks_latest ON health_checks(sourceType, checkedAt DESC);
