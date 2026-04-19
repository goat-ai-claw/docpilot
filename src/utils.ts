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
export const DOC_FILES_PER_DIRECTORY_LIMIT = 5;

const DOC_FILE_EXTENSIONS = ['.md', '.mdx', '.txt', '.rst'];
const AUTHORITATIVE_DOC_NAMES = new Map<string, number>([
  ['readme', 120],
  ['changelog', 110],
  ['changes', 110],
  ['history', 105],
  ['releasenotes', 105],
  ['releases', 100],
  ['upgrade', 100],
  ['upgrading', 100],
  ['migration', 100],
  ['migrating', 100],
]);
const USER_FACING_DOC_NAMES = new Map<string, number>([
  ['gettingstarted', 70],
  ['quickstart', 68],
  ['installation', 65],
  ['install', 65],
  ['configuration', 60],
  ['config', 60],
  ['usage', 58],
  ['guide', 56],
  ['guides', 56],
  ['tutorial', 54],
  ['reference', 52],
  ['references', 52],
  ['faq', 48],
  ['troubleshooting', 46],
  ['overview', 44],
]);
const DEPRIORITIZED_DOC_NAMES = new Set([
  'summary',
  'sidebar',
  'sidebars',
  'navigation',
  'nav',
  'toc',
  'snippet',
  'snippets',
  'template',
  'templates',
  'metadata',
  'meta',
  'manifest',
]);
const DEPRIORITIZED_DOC_SEGMENTS = new Set([
  'snippet',
  'snippets',
  'fragment',
  'fragments',
  'partial',
  'partials',
  'template',
  'templates',
  'generated',
]);

function normalizeDocSegment(segment: string): string {
  return segment.toLowerCase().replace(/\.[^.]+$/, '').replace(/[^a-z0-9]+/g, '');
}

function getRawDocSegments(path: string): string[] {
  return path.split('/').filter(Boolean);
}

function getDocPriorityScore(path: string): number {
  const rawSegments = getRawDocSegments(path);
  const segments = rawSegments.map(normalizeDocSegment).filter(Boolean);
  if (segments.length === 0) return 0;

  const basename = segments[segments.length - 1];
  const rawBasename = rawSegments[rawSegments.length - 1]?.toLowerCase() ?? '';
  const parentSegments = segments.slice(0, -1);
  const rawParentSegments = rawSegments.slice(0, -1).map(segment => segment.toLowerCase());
  let score = 0;

  score += AUTHORITATIVE_DOC_NAMES.get(basename) ?? 0;
  score += USER_FACING_DOC_NAMES.get(basename) ?? 0;

  for (const segment of parentSegments) {
    if (AUTHORITATIVE_DOC_NAMES.has(segment)) {
      score += 45;
    } else if (USER_FACING_DOC_NAMES.has(segment)) {
      score += 18;
    }

    if (DEPRIORITIZED_DOC_SEGMENTS.has(segment)) {
      score -= 40;
    }
  }

  if (DEPRIORITIZED_DOC_NAMES.has(basename)) {
    score -= 120;
  }

  if (rawBasename.startsWith('_') || rawBasename.startsWith('.')) {
    score -= 40;
  }

  if (rawParentSegments.some(segment => segment.startsWith('_') || segment.startsWith('.'))) {
    score -= 10;
  }

  score -= segments.length;

  return score;
}

export function isSupportedDocFile(path: string): boolean {
  return DOC_FILE_EXTENSIONS.some(extension => path.toLowerCase().endsWith(extension));
}

export function prioritizeDocFiles(paths: string[], limit: number = DOC_FILES_PER_DIRECTORY_LIMIT): string[] {
  return [...paths]
    .filter(isSupportedDocFile)
    .sort((left, right) => {
      const scoreDifference = getDocPriorityScore(right) - getDocPriorityScore(left);
      if (scoreDifference !== 0) return scoreDifference;

      const depthDifference = left.split('/').length - right.split('/').length;
      if (depthDifference !== 0) return depthDifference;

      return left.localeCompare(right);
    })
    .slice(0, limit);
}

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
