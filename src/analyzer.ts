import { callLLM } from './llm';
import { truncate } from './utils';

const MAX_DIFF_CHARS = 12000;
const MAX_DOC_CHARS = 6000;

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

  const userMessage = `## Pull Request #${prNumber}: ${prTitle}

## Code Changes (diff)
\`\`\`diff
${truncatedDiff}
\`\`\`

## Existing Documentation
${docSections || '(No existing documentation files found in the configured paths)'}

Analyze this PR and return valid JSON identifying what documentation needs updating. PR number is ${prNumber}.`;

  const response = await callLLM(
    apiKey,
    model,
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ],
    2048
  );

  try {
    const jsonText = response.content
      .replace(/^```(?:json)?\s*/m, '')
      .replace(/\s*```\s*$/m, '')
      .trim();

    const parsed = JSON.parse(jsonText) as AnalysisResult;

    // Substitute PR number placeholder
    if (parsed.changelogEntry) {
      parsed.changelogEntry = parsed.changelogEntry.replace('PR_NUMBER', String(prNumber));
    }

    return parsed;
  } catch {
    return {
      summary: 'DocPilot completed analysis but could not parse the structured response.',
      docsNeedingUpdate: [],
      changelogEntry: '',
      readmeIssues: [],
      overallImpact: 'none',
    };
  }
}
