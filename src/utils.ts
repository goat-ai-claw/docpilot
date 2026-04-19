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
const AUTO_DISCOVERY_MAX_DIRECTORIES = 3;
const AUTO_DISCOVERY_MIN_DOC_FILES = 3;
const AUTO_DISCOVERY_MIN_SCORE = 120;
const AUTO_DISCOVERY_IGNORED_DIRECTORIES = new Set([
  'src',
  'lib',
  'test',
  'tests',
  'spec',
  'specs',
  'scripts',
  'script',
  'dist',
  'build',
  'bin',
  'vendor',
  'node_modules',
  'coverage',
  'assets',
  'static',
  'public',
]);
const AUTO_DISCOVERY_MARKERS = new Map<string, number>([
  ['readme', 80],
  ['help', 80],
  ['changelog', 75],
  ['history', 72],
  ['changes', 70],
  ['release', 68],
  ['releasenotes', 68],
  ['upgrade', 66],
  ['upgrading', 66],
  ['migration', 66],
  ['migrating', 66],
  ['docs', 56],
  ['documentation', 56],
  ['guide', 52],
  ['guides', 52],
  ['tutorial', 50],
  ['tutorials', 50],
  ['reference', 46],
  ['references', 46],
  ['faq', 44],
]);

function scoreAutoDiscoveredDocPath(path: string): number {
  const rawSegments = getRawDocSegments(path);
  const segments = rawSegments.map(normalizeDocSegment).filter(Boolean);
  let score = 0;

  for (const segment of segments) {
    for (const [marker, markerScore] of AUTO_DISCOVERY_MARKERS) {
      if (segment === marker) {
        score += markerScore;
      } else if (segment.startsWith(marker) || segment.endsWith(marker)) {
        score += Math.max(20, markerScore - 25);
      }
    }
  }

  const rawBasename = rawSegments[rawSegments.length - 1]?.toLowerCase() ?? '';
  if (rawBasename.startsWith('readme.') || rawBasename.startsWith('help.')) {
    score += 55;
  }

  if (rawBasename.startsWith('.') || rawBasename.startsWith('_')) {
    score -= 20;
  }

  return score;
}

function usesDefaultDocPaths(docPaths: string[]): boolean {
  const defaults = parseDocPaths(DEFAULT_DOC_PATHS);
  return docPaths.length === defaults.length && docPaths.every((path, index) => path === defaults[index]);
}

export function expandDocPathsWithAutoDiscovery(allFiles: string[], docPaths: string[]): string[] {
  if (!usesDefaultDocPaths(docPaths)) {
    return [...docPaths];
  }

  const configuredDirectories = new Set(docPaths.filter(path => path.endsWith('/')));
  const candidates = new Map<string, { docCount: number; score: number }>();

  for (const filePath of allFiles) {
    if (!isSupportedDocFile(filePath) || !filePath.includes('/')) {
      continue;
    }

    const topLevelDirectory = filePath.split('/')[0];
    const normalizedTopLevelDirectory = topLevelDirectory.toLowerCase();
    if (
      !topLevelDirectory ||
      topLevelDirectory.startsWith('.') ||
      configuredDirectories.has(`${topLevelDirectory}/`) ||
      AUTO_DISCOVERY_IGNORED_DIRECTORIES.has(normalizedTopLevelDirectory)
    ) {
      continue;
    }

    const candidate = candidates.get(topLevelDirectory) ?? { docCount: 0, score: 0 };
    candidate.docCount += 1;
    candidate.score += scoreAutoDiscoveredDocPath(filePath);
    candidates.set(topLevelDirectory, candidate);
  }

  const discoveredDirectories = [...candidates.entries()]
    .filter(([, candidate]) => candidate.docCount >= AUTO_DISCOVERY_MIN_DOC_FILES && candidate.score >= AUTO_DISCOVERY_MIN_SCORE)
    .sort((left, right) => {
      const scoreDifference = right[1].score - left[1].score;
      if (scoreDifference !== 0) return scoreDifference;

      const countDifference = right[1].docCount - left[1].docCount;
      if (countDifference !== 0) return countDifference;

      return left[0].localeCompare(right[0]);
    })
    .slice(0, AUTO_DISCOVERY_MAX_DIRECTORIES)
    .map(([directory]) => `${directory}/`);

  return [...docPaths, ...discoveredDirectories];
}

export function resolveDocPathsForCollection(
  allFiles: string[],
  docPaths: string[],
  allowAutoDiscovery: boolean = true
): string[] {
  return allowAutoDiscovery ? expandDocPathsWithAutoDiscovery(allFiles, docPaths) : [...docPaths];
}

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
