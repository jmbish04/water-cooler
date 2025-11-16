-- Add testing tables for AI model evaluation and testing functionality
-- Migration: 0005_add_testing_tables.sql

-- ============================================================================
-- TEST_PROFILES: Test definitions and metadata
-- ============================================================================
CREATE TABLE IF NOT EXISTS test_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  features TEXT,
  possible_errors_w_resolutions TEXT, -- JSON
  is_active INTEGER DEFAULT 1 NOT NULL, -- boolean
  created_at TEXT DEFAULT (datetime('now')) NOT NULL
);

-- ============================================================================
-- TEST_RESULTS: Individual test run results
-- ============================================================================
CREATE TABLE IF NOT EXISTS test_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  test_profile_id INTEGER NOT NULL REFERENCES test_profiles(id),
  test_session_id TEXT NOT NULL,
  timestamp TEXT DEFAULT (datetime('now')) NOT NULL,
  status TEXT NOT NULL, -- PASS | FAIL | ERROR
  raw_error_message TEXT,
  human_readable_error_message TEXT,
  possible_solutions TEXT,
  latency_ms INTEGER,
  logs TEXT,
  created_at TEXT DEFAULT (datetime('now')) NOT NULL
);

-- ============================================================================
-- AI_LOGS: AI model execution logs
-- ============================================================================
CREATE TABLE IF NOT EXISTS ai_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  test_result_id INTEGER NOT NULL REFERENCES test_results(id),
  model TEXT,
  provider TEXT,
  prompt TEXT,
  response_json TEXT,
  reasoning_summary TEXT,
  token_usage INTEGER,
  latency_ms INTEGER,
  created_at TEXT DEFAULT (datetime('now')) NOT NULL
);

-- ============================================================================
-- INDEXES for performance
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_test_results_session ON test_results(test_session_id);
CREATE INDEX IF NOT EXISTS idx_test_results_status ON test_results(status);
CREATE INDEX IF NOT EXISTS idx_ai_logs_result_id ON ai_logs(test_result_id);
