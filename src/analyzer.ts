import { callLLM } from './llm';
import { logWarning, truncate } from './utils';

const MAX_DIFF_CHARS = 12000;
const MAX_DOC_CHARS = 6000;
const MAX_PARSE_ATTEMPTS = 2;
const VALID_IMPACTS = ['none', 'minor', 'moderate', 'major'] as const;
const VALID_PRIORITIES = ['high', 'medium', 'low'] as const;

export interface DocSuggestion {
  file: string;
  reason: string;
  suggestedChange: string;
  priority: 'high' | 'medium' | 'low';
}

export interface AnalysisResult {
  summary: string;
  docsNeedingUpdate: DocSuggestion[];
  changelogEntry: string;
  readmeIssues: string[];
  overallImpact: 'none' | 'minor' | 'moderate' | 'major';
}

export class AnalysisParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnalysisParseError';
  }
}

function stripCodeFences(text: string): string {
  return text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
}

function isValidPriority(value: unknown): value is DocSuggestion['priority'] {
  return typeof value === 'string' && VALID_PRIORITIES.includes(value as DocSuggestion['priority']);
}

function isValidImpact(value: unknown): value is AnalysisResult['overallImpact'] {
  return typeof value === 'string' && VALID_IMPACTS.includes(value as AnalysisResult['overallImpact']);
}

function parseAnalysisResult(responseText: string): AnalysisResult {
  const parsed = JSON.parse(stripCodeFences(responseText)) as Partial<AnalysisResult>;

  if (typeof parsed.summary !== 'string' || parsed.summary.trim().length === 0) {
    throw new AnalysisParseError('Missing required string field: summary');
  }

  if (!isValidImpact(parsed.overallImpact)) {
    throw new AnalysisParseError('Invalid overallImpact value');
  }

  if (!Array.isArray(parsed.docsNeedingUpdate)) {
    throw new AnalysisParseError('docsNeedingUpdate must be an array');
  }

  const docsNeedingUpdate = parsed.docsNeedingUpdate.map((suggestion, index) => {
    if (
      !suggestion ||
      typeof suggestion.file !== 'string' ||
      typeof suggestion.reason !== 'string' ||
      typeof suggestion.suggestedChange !== 'string' ||
      !isValidPriority(suggestion.priority)
    ) {
      throw new AnalysisParseError(`Invalid docsNeedingUpdate entry at index ${index}`);
    }

    return {
      file: suggestion.file,
      reason: suggestion.reason,
      suggestedChange: suggestion.suggestedChange,
      priority: suggestion.priority,
    };
  });

  if (typeof parsed.changelogEntry !== 'string') {
    throw new AnalysisParseError('Missing required string field: changelogEntry');
  }

  if (!Array.isArray(parsed.readmeIssues) || parsed.readmeIssues.some(issue => typeof issue !== 'string')) {
    throw new AnalysisParseError('readmeIssues must be an array of strings');
  }

  return {
    summary: parsed.summary,
    overallImpact: parsed.overallImpact,
    docsNeedingUpdate,
    changelogEntry: parsed.changelogEntry,
    readmeIssues: parsed.readmeIssues,
  };
}

const SYSTEM_PROMPT = `You are DocPilot, an expert technical writer and code reviewer specialized in keeping documentation accurate and up-to-date.

Your task: analyze a pull request diff and existing documentation, then identify exactly what documentation needs to be updated.

Respond ONLY with valid JSON matching this exact schema (no markdown fences, no extra text):
{
  "summary": "1-2 sentence summary of what the PR changes from a user perspective",
  "overallImpact": "none|minor|moderate|major",
  "docsNeedingUpdate": [
    {
      "file": "exact/path/to/doc.md",
      "reason": "Specific reason why this doc needs updating",
      "suggestedChange": "Ready-to-paste markdown text to add or replace",
      "priority": "high|medium|low"
    }
  ],
  "changelogEntry": "- feat: description of change (#PR_NUMBER)",
  "readmeIssues": ["Specific README issues found, if any"]
}

Impact levels:
- none: purely internal refactors, no user-facing changes
- minor: small additions, typo fixes, new optional config
- moderate: new features, config changes, behavior changes
- major: breaking changes, API redesigns, major new capabilities

Guidelines:
- Be specific — quote actual function names, config keys, API endpoints from the diff
- "suggestedChange" must be ready-to-paste markdown, not vague instructions like "update the readme"
- Only flag docs that ACTUALLY need updates based on what changed in the diff
- If no docs need updating, return empty arrays and overallImpact: "none"
- Changelog entries follow Keep a Changelog format; use feat/fix/chore/breaking prefixes
- Replace PR_NUMBER placeholder with the actual PR number provided
- Detect and surface: new features, breaking changes, deprecated APIs, new config options, changed CLI flags, updated function signatures, new dependencies`;

export async function analyzeDiff(
  apiKey: string,
  model: string,
  diff: string,
  existingDocs: Record<string, string>,
  prNumber: number,
  prTitle: string
): Promise<AnalysisResult> {
  const truncatedDiff = truncate(diff, MAX_DIFF_CHARS);

  const docSections = Object.entries(existingDocs)
    .map(([path, content]) => `### ${path}\n\n${truncate(content, MAX_DOC_CHARS)}`)
    .join('\n\n---\n\n');

  const baseUserMessage = `## Pull Request #${prNumber}: ${prTitle}

## Code Changes (diff)
\`\`\`diff
${truncatedDiff}
\`\`\`

## Existing Documentation
${docSections || '(No existing documentation files found in the configured paths)'}

Analyze this PR and return valid JSON identifying what documentation needs updating. PR number is ${prNumber}.`;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_PARSE_ATTEMPTS; attempt++) {
    const userMessage =
      attempt === 1
        ? baseUserMessage
        : `${baseUserMessage}

IMPORTANT: Your previous response was invalid structured output. Respond with JSON only, include every required field, and make sure each docsNeedingUpdate entry contains file, reason, suggestedChange, and priority.`;

    try {
      const response = await callLLM(
        apiKey,
        model,
        [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        2048
      );

      const parsed = parseAnalysisResult(response.content);

      if (parsed.changelogEntry) {
        parsed.changelogEntry = parsed.changelogEntry.replace('PR_NUMBER', String(prNumber));
      }

      return parsed;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (!(lastError instanceof AnalysisParseError || lastError instanceof SyntaxError)) {
        throw lastError;
      }

      if (attempt < MAX_PARSE_ATTEMPTS) {
        logWarning(
          `Analysis response was invalid on attempt ${attempt}/${MAX_PARSE_ATTEMPTS}: ${lastError.message}. Retrying with stricter formatting instructions.`
        );
      }
    }
  }

  throw new AnalysisParseError(
    `Invalid structured response from model after ${MAX_PARSE_ATTEMPTS} attempt(s): ${lastError?.message ?? 'unknown error'}`
  );
}
