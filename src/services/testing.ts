/**
 * Testing Framework Service
 *
 * Purpose:
 * - Define and execute tests for AI models and connectors
 * - Store test results with AI-generated insights
 * - Track model performance and drift over time
 */

import { getDb, tryParseJson, toJsonString } from '../db/kysely';
import { createLogger } from '../utils/logger';

export interface TestProfile {
  id: number;
  name: string;
  description: string | null;
  features: string | null;
  possibleErrorsWResolutions: Record<string, string> | null;
  isActive: boolean;
  createdAt: string;
}

export interface TestResult {
  id?: number;
  testProfileId: number;
  testSessionId: string;
  timestamp: string;
  status: 'PASS' | 'FAIL' | 'ERROR';
  rawErrorMessage: string | null;
  humanReadableErrorMessage: string | null;
  possibleSolutions: string | null;
  latencyMs: number | null;
  logs: string | null;
  createdAt: string;
}

export interface AiLog {
  id?: number;
  testResultId: number;
  model: string | null;
  provider: string | null;
  prompt: string | null;
  responseJson: string | null;
  reasoningSummary: string | null;
  tokenUsage: number | null;
  latencyMs: number | null;
  createdAt: string;
}

// ============================================================================
// TEST PROFILES
// ============================================================================

/**
 * Get all active test profiles
 */
export async function getActiveTestProfiles(db: D1Database): Promise<TestProfile[]> {
  const kysely = getDb(db);

  const rows = await kysely
    .selectFrom('test_profiles')
    .selectAll()
    .where('is_active', '=', 1)
    .orderBy('name', 'asc')
    .execute();

  return rows.map(deserializeTestProfile);
}

/**
 * Get test profile by ID
 */
export async function getTestProfileById(db: D1Database, id: number): Promise<TestProfile | null> {
  const kysely = getDb(db);

  const row = await kysely
    .selectFrom('test_profiles')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirst();

  return row ? deserializeTestProfile(row) : null;
}

/**
 * Create new test profile
 */
export async function createTestProfile(
  db: D1Database,
  profile: Omit<TestProfile, 'id' | 'createdAt'>
): Promise<TestProfile> {
  const kysely = getDb(db);
  const now = new Date().toISOString();

  const result = await kysely
    .insertInto('test_profiles')
    .values({
      name: profile.name,
      description: profile.description,
      features: profile.features,
      possible_errors_w_resolutions: toJsonString(profile.possibleErrorsWResolutions),
      is_active: profile.isActive ? 1 : 0,
      created_at: now,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  return deserializeTestProfile(result);
}

function deserializeTestProfile(row: any): TestProfile {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    features: row.features,
    possibleErrorsWResolutions: tryParseJson(row.possible_errors_w_resolutions),
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
  };
}

// ============================================================================
// TEST RESULTS
// ============================================================================

/**
 * Record test result
 */
export async function recordTestResult(
  db: D1Database,
  result: Omit<TestResult, 'id' | 'createdAt'>
): Promise<number> {
  const kysely = getDb(db);
  const now = new Date().toISOString();

  const inserted = await kysely
    .insertInto('test_results')
    .values({
      test_profile_id: result.testProfileId,
      test_session_id: result.testSessionId,
      timestamp: result.timestamp,
      status: result.status,
      raw_error_message: result.rawErrorMessage,
      human_readable_error_message: result.humanReadableErrorMessage,
      possible_solutions: result.possibleSolutions,
      latency_ms: result.latencyMs,
      logs: result.logs,
      created_at: now,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  return inserted.id;
}

/**
 * Get enriched test results with profile metadata
 */
export async function getEnrichedTestResults(
  db: D1Database,
  opts?: {
    sessionId?: string;
    onlyFailures?: boolean;
    limit?: number;
  }
): Promise<Array<TestResult & { testProfile: TestProfile }>> {
  const kysely = getDb(db);

  let query = kysely
    .selectFrom('test_results as tr')
    .innerJoin('test_profiles as tp', 'tp.id', 'tr.test_profile_id')
    .select([
      'tr.id as id',
      'tr.test_profile_id as testProfileId',
      'tr.test_session_id as testSessionId',
      'tr.timestamp',
      'tr.status',
      'tr.raw_error_message as rawErrorMessage',
      'tr.human_readable_error_message as humanReadableErrorMessage',
      'tr.possible_solutions as possibleSolutions',
      'tr.latency_ms as latencyMs',
      'tr.logs',
      'tr.created_at as createdAt',
      'tp.id as profileId',
      'tp.name as profileName',
      'tp.description as profileDescription',
      'tp.features as profileFeatures',
      'tp.possible_errors_w_resolutions as profileErrorResolutions',
      'tp.is_active as profileIsActive',
      'tp.created_at as profileCreatedAt',
    ])
    .orderBy('tr.timestamp', 'desc');

  if (opts?.sessionId) {
    query = query.where('tr.test_session_id', '=', opts.sessionId);
  }

  if (opts?.onlyFailures) {
    query = query.where('tr.status', '=', 'FAIL');
  }

  if (opts?.limit) {
    query = query.limit(opts.limit);
  }

  const rows = await query.execute();

  return rows.map((row) => ({
    id: row.id,
    testProfileId: row.testProfileId,
    testSessionId: row.testSessionId,
    timestamp: row.timestamp,
    status: row.status as 'PASS' | 'FAIL' | 'ERROR',
    rawErrorMessage: row.rawErrorMessage,
    humanReadableErrorMessage: row.humanReadableErrorMessage,
    possibleSolutions: row.possibleSolutions,
    latencyMs: row.latencyMs,
    logs: row.logs,
    createdAt: row.createdAt,
    testProfile: {
      id: row.profileId,
      name: row.profileName,
      description: row.profileDescription,
      features: row.profileFeatures,
      possibleErrorsWResolutions: tryParseJson(row.profileErrorResolutions),
      isActive: Boolean(row.profileIsActive),
      createdAt: row.profileCreatedAt,
    },
  }));
}

// ============================================================================
// AI LOGS
// ============================================================================

/**
 * Record AI model execution log
 */
export async function recordAiLog(db: D1Database, log: Omit<AiLog, 'id' | 'createdAt'>): Promise<void> {
  const kysely = getDb(db);
  const now = new Date().toISOString();

  await kysely
    .insertInto('ai_logs')
    .values({
      test_result_id: log.testResultId,
      model: log.model,
      provider: log.provider,
      prompt: log.prompt,
      response_json: log.responseJson,
      reasoning_summary: log.reasoningSummary,
      token_usage: log.tokenUsage,
      latency_ms: log.latencyMs,
      created_at: now,
    })
    .execute();
}

/**
 * Get AI logs for a test result
 */
export async function getAiLogsForTestResult(db: D1Database, testResultId: number): Promise<AiLog[]> {
  const kysely = getDb(db);

  const rows = await kysely
    .selectFrom('ai_logs')
    .selectAll()
    .where('test_result_id', '=', testResultId)
    .orderBy('created_at', 'desc')
    .execute();

  return rows.map((row) => ({
    id: row.id,
    testResultId: row.test_result_id,
    model: row.model,
    provider: row.provider,
    prompt: row.prompt,
    responseJson: row.response_json,
    reasoningSummary: row.reasoning_summary,
    tokenUsage: row.token_usage,
    latencyMs: row.latency_ms,
    createdAt: row.created_at,
  }));
}

// ============================================================================
// TEST EXECUTION
// ============================================================================

/**
 * Run AI test with validation and logging
 */
export async function runAiTest(
  db: D1Database,
  ai: Ai,
  testProfileId: number,
  model: string,
  prompt: string
): Promise<{ testResultId: number; passed: boolean; error?: string }> {
  const logger = createLogger(db, 'TestingService');
  const sessionId = crypto.randomUUID();
  const start = Date.now();

  try {
    // Run AI model
    const response = await ai.run(model, { input: prompt });
    const latency = Date.now() - start;

    // Validate response
    const validation = validateAiResponse(response);

    // Record test result
    const testResultId = await recordTestResult(db, {
      testProfileId,
      testSessionId: sessionId,
      timestamp: new Date().toISOString(),
      status: validation.passed ? 'PASS' : 'FAIL',
      rawErrorMessage: validation.error || null,
      humanReadableErrorMessage: validation.humanReadable || null,
      possibleSolutions: validation.solutions || null,
      latencyMs: latency,
      logs: JSON.stringify({ model, prompt: prompt.substring(0, 200) }),
    });

    // Record AI log
    await recordAiLog(db, {
      testResultId,
      model,
      provider: model.split('/')[0],
      prompt,
      responseJson: JSON.stringify(response),
      reasoningSummary: extractReasoning(response),
      tokenUsage: (response as any).usage?.total_tokens || null,
      latencyMs: latency,
    });

    await logger.info('AI_TEST_COMPLETED', {
      testResultId,
      testProfileId,
      status: validation.passed ? 'PASS' : 'FAIL',
      latencyMs: latency,
    });

    return { testResultId, passed: validation.passed, error: validation.error };
  } catch (error) {
    const latency = Date.now() - start;

    const testResultId = await recordTestResult(db, {
      testProfileId,
      testSessionId: sessionId,
      timestamp: new Date().toISOString(),
      status: 'ERROR',
      rawErrorMessage: error instanceof Error ? error.message : String(error),
      humanReadableErrorMessage: `Test execution failed: ${error instanceof Error ? error.message : String(error)}`,
      possibleSolutions: 'Check model availability and input format',
      latencyMs: latency,
      logs: JSON.stringify({ error: String(error) }),
    });

    await logger.error('AI_TEST_FAILED', error, {
      testResultId,
      testProfileId,
    });

    return {
      testResultId,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Validate AI response structure and content
 */
function validateAiResponse(response: any): {
  passed: boolean;
  error?: string;
  humanReadable?: string;
  solutions?: string;
} {
  // Check if response exists
  if (!response) {
    return {
      passed: false,
      error: 'Response is null or undefined',
      humanReadable: 'The AI model did not return any response',
      solutions: 'Check model availability and input parameters',
    };
  }

  // Check for common response fields
  const hasResponse = response.response || response.text || response.content || response.output;

  if (!hasResponse) {
    return {
      passed: false,
      error: 'Response does not contain expected text fields',
      humanReadable: 'The AI response is missing expected content fields (response, text, content, or output)',
      solutions: 'Verify the model is responding correctly and check the input schema',
    };
  }

  return { passed: true };
}

/**
 * Extract reasoning or summary from AI response
 */
function extractReasoning(response: any): string | null {
  if (typeof response === 'string') return response;

  const text = response.response || response.text || response.content || response.output;

  if (typeof text === 'string') {
    return text.substring(0, 500); // First 500 chars
  }

  if (Array.isArray(text) && text.length > 0) {
    return String(text[0]).substring(0, 500);
  }

  return null;
}
