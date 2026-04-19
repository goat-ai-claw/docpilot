import { callLLM } from './llm';
import { truncate } from './utils';

const MAX_COMMITS_CHARS = 8000;

export interface ChangelogSection {
  version: string;
  date: string;
  added: string[];
  changed: string[];
  fixed: string[];
  removed: string[];
  breaking: string[];
}

const CHANGELOG_SYSTEM_PROMPT = `You are an expert technical writer creating structured changelogs following the Keep a Changelog format (https://keepachangelog.com).

Given a list of git commits, generate a structured changelog section.

Respond ONLY with valid JSON (no markdown fences) matching this schema:
{
  "added": ["New feature descriptions in past tense"],
  "changed": ["Changed behavior descriptions in past tense"],
  "fixed": ["Bug fix descriptions in past tense"],
  "removed": ["Removed feature descriptions in past tense"],
  "breaking": ["Breaking change descriptions in past tense"]
}

Guidelines:
- Map commit types: feat→added, fix→fixed, refactor/perf→changed, revert/remove→removed
- Write in user-facing language (not "fix typo in parseConfig" → "Fixed configuration parsing error")
- Be concise but specific — include the affected component
- Skip chore/ci/docs/test commits unless user-facing
- Breaking changes (BREAKING CHANGE in commit body, or ! suffix) go in "breaking"
- Empty arrays are fine — only include real changes`;

export async function generateChangelogSection(
  apiKey: string,
  model: string,
  commits: string[],
  version: string
): Promise<ChangelogSection> {
  const commitText = truncate(commits.join('\n'), MAX_COMMITS_CHARS);

  const response = await callLLM(
    apiKey,
    model,
    [
      { role: 'system', content: CHANGELOG_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Generate a changelog section for version ${version}.\n\nCommits:\n${commitText}`,
      },
    ],
    1024
  );

  try {
    const jsonText = response.content
      .replace(/^```(?:json)?\s*/m, '')
      .replace(/\s*```\s*$/m, '')
      .trim();

    const parsed = JSON.parse(jsonText);

    return {
      version,
      date: new Date().toISOString().split('T')[0],
      added: parsed.added ?? [],
      changed: parsed.changed ?? [],
      fixed: parsed.fixed ?? [],
      removed: parsed.removed ?? [],
      breaking: parsed.breaking ?? [],
    };
  } catch {
    return {
      version,
      date: new Date().toISOString().split('T')[0],
      added: [],
      changed: [],
      fixed: [],
      removed: [],
      breaking: [],
    };
  }
}

export function formatChangelogSection(section: ChangelogSection): string {
  const lines: string[] = [`## [${section.version}] - ${section.date}`, ''];

  if (section.breaking.length > 0) {
    lines.push('### ⚠ Breaking Changes');
    section.breaking.forEach(item => lines.push(`- ${item}`));
    lines.push('');
  }

  if (section.added.length > 0) {
    lines.push('### Added');
    section.added.forEach(item => lines.push(`- ${item}`));
    lines.push('');
  }

  if (section.changed.length > 0) {
    lines.push('### Changed');
    section.changed.forEach(item => lines.push(`- ${item}`));
    lines.push('');
  }

  if (section.fixed.length > 0) {
    lines.push('### Fixed');
    section.fixed.forEach(item => lines.push(`- ${item}`));
    lines.push('');
  }

  if (section.removed.length > 0) {
    lines.push('### Removed');
    section.removed.forEach(item => lines.push(`- ${item}`));
    lines.push('');
  }

  return lines.join('\n');
}

export function prependToChangelog(existing: string, newSection: string): string {
  const marker = '## [';
  const insertAt = existing.indexOf(marker);

  if (insertAt === -1) {
    // No existing entries — append after header
    return existing.trimEnd() + '\n\n' + newSection;
  }

  return existing.slice(0, insertAt) + newSection + '\n' + existing.slice(insertAt);
}
