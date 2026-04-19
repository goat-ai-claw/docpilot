import * as core from '@actions/core';
import * as github from '@actions/github';

export interface PRContext {
  owner: string;
  repo: string;
  prNumber: number;
  headRef: string;
  headSha: string;
  baseSha: string;
}

export const DEFAULT_DOC_PATHS = 'README.md,docs/,CHANGELOG.md,UPGRADING.md';

export function getPRContext(): PRContext {
  const context = github.context;
  const prNumber = context.payload.pull_request?.number;

  if (!prNumber) {
    throw new Error(
      'This action must be triggered by a pull_request event. ' +
        'Ensure your workflow uses: on: [pull_request]'
    );
  }

  return {
    owner: context.repo.owner,
    repo: context.repo.repo,
    prNumber,
    headRef: context.payload.pull_request?.head?.ref ?? '',
    headSha: context.payload.pull_request?.head?.sha ?? '',
    baseSha: context.payload.pull_request?.base?.sha ?? '',
  };
}

export function parseDocPaths(docPathsInput: string): string[] {
  return docPathsInput
    .split(',')
    .map(p => p.trim())
    .filter(p => p.length > 0);
}

export function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + '\n...[truncated for length]';
}

export function logInfo(message: string): void {
  core.info(`[DocPilot] ${message}`);
}

export function logWarning(message: string): void {
  core.warning(`[DocPilot] ${message}`);
}

export function logError(message: string): void {
  core.error(`[DocPilot] ${message}`);
}
