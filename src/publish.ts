import * as core from '@actions/core';
import { getOctokit } from '@actions/github';
import type { AnalysisResult } from './analyzer';
import { syncComment } from './commenter';
import { logInfo, logWarning } from './utils';

export type DocPilotMode = 'suggest' | 'auto-update' | 'report';
export type FailOnImpact = '' | Exclude<AnalysisResult['overallImpact'], 'none'>;

const IMPACT_ORDER: AnalysisResult['overallImpact'][] = ['none', 'minor', 'moderate', 'major'];
const FAILABLE_IMPACTS: FailOnImpact[] = ['', 'minor', 'moderate', 'major'];

type AutoUpdateDocsFn = (
  octokit: ReturnType<typeof getOctokit>,
  owner: string,
  repo: string,
  headRef: string,
  suggestions: Array<{ file: string; suggestedChange: string }>
) => Promise<void>;

type SyncCommentFn = (
  octokit: ReturnType<typeof getOctokit>,
  owner: string,
  repo: string,
  prNumber: number,
  analysis: AnalysisResult,
  commentOnNoImpact: boolean
) => Promise<void>;

type SummaryWriteFn = (markdown: string) => Promise<void>;
type SetFailedFn = (message: string) => void;

export interface PublishAnalysisOptions {
  mode: DocPilotMode;
  octokit: ReturnType<typeof getOctokit>;
  owner: string;
  repo: string;
  prNumber: number;
  headRef: string;
  analysis: AnalysisResult;
  commentOnNoImpact: boolean;
  failOnImpact?: FailOnImpact;
  autoUpdateDocsFn: AutoUpdateDocsFn;
  syncCommentFn?: SyncCommentFn;
  summaryWriteFn?: SummaryWriteFn;
  setFailedFn?: SetFailedFn;
}

export function assertValidMode(mode: string): asserts mode is DocPilotMode {
  if (mode !== 'suggest' && mode !== 'auto-update' && mode !== 'report') {
    throw new Error(`Invalid mode "${mode}". Must be "report", "suggest", or "auto-update".`);
  }
}

export function assertValidFailOnImpact(value: string): asserts value is FailOnImpact {
  if (!FAILABLE_IMPACTS.includes(value as FailOnImpact)) {
    throw new Error(
      `Invalid fail_on_impact "${value}". Must be empty, "minor", "moderate", or "major".`
    );
  }
}

export function shouldFailForImpact(
  impact: AnalysisResult['overallImpact'],
  threshold: FailOnImpact
): boolean {
  if (threshold === '') {
    return false;
  }

  return IMPACT_ORDER.indexOf(impact) >= IMPACT_ORDER.indexOf(threshold);
}

export function buildReportBody(analysis: AnalysisResult): string {
  const lines: string[] = [
    '## DocPilot report',
    '',
    `**Impact:** \`${analysis.overallImpact}\``,
    `**Summary:** ${analysis.summary}`,
    `**Docs needing updates:** ${analysis.docsNeedingUpdate.length}`,
  ];

  if (analysis.docsNeedingUpdate.length > 0) {
    lines.push('');
    lines.push('### Suggested doc updates');
    lines.push('');

    for (const suggestion of analysis.docsNeedingUpdate.slice(0, 5)) {
      lines.push(
        `- \`${suggestion.file}\` — **${suggestion.priority}** priority: ${suggestion.reason}`
      );
    }
  }

  if (analysis.readmeIssues.length > 0) {
    lines.push('');
    lines.push('### README issues');
    lines.push('');
    for (const issue of analysis.readmeIssues) {
      lines.push(`- ${issue}`);
    }
  }

  if (analysis.changelogEntry) {
    lines.push('');
    lines.push('### Suggested CHANGELOG.md entry');
    lines.push('');
    lines.push('```markdown');
    lines.push(analysis.changelogEntry);
    lines.push('```');
  }

  return lines.join('\n');
}

async function defaultSummaryWrite(markdown: string): Promise<void> {
  try {
    await core.summary.addRaw(markdown, true).write();
  } catch (error) {
    logWarning(`Failed to write GitHub step summary: ${String(error)}`);
  }
}

export async function publishAnalysisResult({
  mode,
  octokit,
  owner,
  repo,
  prNumber,
  headRef,
  analysis,
  commentOnNoImpact,
  failOnImpact = '',
  autoUpdateDocsFn,
  syncCommentFn = syncComment,
  summaryWriteFn = defaultSummaryWrite,
  setFailedFn = core.setFailed,
}: PublishAnalysisOptions): Promise<void> {
  if (mode === 'auto-update' && analysis.docsNeedingUpdate.length > 0) {
    logInfo(`Auto-update mode: committing suggestions to branch "${headRef}"...`);
    await autoUpdateDocsFn(
      octokit,
      owner,
      repo,
      headRef,
      analysis.docsNeedingUpdate.map(d => ({
        file: d.file,
        suggestedChange: d.suggestedChange,
      }))
    );
  }

  if (mode === 'report') {
    logInfo('Report mode: skipping PR comments and commit side effects');
    const reportBody = buildReportBody(analysis);
    logInfo(`Report summary:\n${reportBody}`);
    await summaryWriteFn(reportBody);
  } else {
    logInfo('Synchronizing analysis comment on PR...');
    await syncCommentFn(octokit, owner, repo, prNumber, analysis, commentOnNoImpact);
  }

  if (shouldFailForImpact(analysis.overallImpact, failOnImpact)) {
    setFailedFn(
      `DocPilot detected ${analysis.overallImpact} documentation impact, meeting the fail_on_impact threshold of ${failOnImpact}.`
    );
  }
}
