import { buildComment, shouldPostComment, syncComment } from '../src/commenter';
import { DEFAULT_DOC_PATHS, parseDocPaths, prioritizeDocFiles, truncate } from '../src/utils';
import type { AnalysisResult } from '../src/analyzer';

describe('buildComment', () => {
  const baseAnalysis: AnalysisResult = {
    summary: 'Test summary of changes',
    docsNeedingUpdate: [],
    changelogEntry: '',
    readmeIssues: [],
    overallImpact: 'none',
  };

  it('includes the DocPilot marker for idempotent updates', () => {
    const comment = buildComment(baseAnalysis, 1);
    expect(comment).toContain('<!-- docpilot-v1 -->');
  });

  it('shows no-impact message when overallImpact is none', () => {
    const comment = buildComment(baseAnalysis, 1);
    expect(comment).toContain('No documentation updates');
    expect(comment).toContain('✅');
  });

  it('shows file suggestions for moderate impact', () => {
    const analysis: AnalysisResult = {
      ...baseAnalysis,
      overallImpact: 'moderate',
      docsNeedingUpdate: [
        {
          file: 'README.md',
          reason: 'New CLI flag added',
          suggestedChange: '## New --timeout flag',
          priority: 'high',
        },
      ],
    };
    const comment = buildComment(analysis, 5);
    expect(comment).toContain('⚠️');
    expect(comment).toContain('Moderate documentation impact');
    expect(comment).toContain('README.md');
    expect(comment).toContain('High priority');
    expect(comment).toContain('New CLI flag added');
  });

  it('sorts suggestions by priority (high first)', () => {
    const analysis: AnalysisResult = {
      ...baseAnalysis,
      overallImpact: 'major',
      docsNeedingUpdate: [
        { file: 'low.md', reason: 'r', suggestedChange: 's', priority: 'low' },
        { file: 'high.md', reason: 'r', suggestedChange: 's', priority: 'high' },
        { file: 'medium.md', reason: 'r', suggestedChange: 's', priority: 'medium' },
      ],
    };
    const comment = buildComment(analysis, 1);
    const highIdx = comment.indexOf('high.md');
    const medIdx = comment.indexOf('medium.md');
    const lowIdx = comment.indexOf('low.md');
    expect(highIdx).toBeLessThan(medIdx);
    expect(medIdx).toBeLessThan(lowIdx);
  });

  it('includes changelog entry when present', () => {
    const analysis: AnalysisResult = {
      ...baseAnalysis,
      overallImpact: 'minor',
      changelogEntry: '- feat: add timeout flag (#3)',
      docsNeedingUpdate: [
        { file: 'README.md', reason: 'r', suggestedChange: 's', priority: 'low' },
      ],
    };
    const comment = buildComment(analysis, 3);
    expect(comment).toContain('CHANGELOG.md entry');
    expect(comment).toContain('feat: add timeout flag');
  });

  it('includes readme issues when present', () => {
    const analysis: AnalysisResult = {
      ...baseAnalysis,
      overallImpact: 'minor',
      readmeIssues: ['Missing installation section'],
      docsNeedingUpdate: [
        { file: 'README.md', reason: 'r', suggestedChange: 's', priority: 'low' },
      ],
    };
    const comment = buildComment(analysis, 1);
    expect(comment).toContain('README issues found');
    expect(comment).toContain('Missing installation section');
  });
});

describe('shouldPostComment', () => {
  const noImpactAnalysis: AnalysisResult = {
    summary: 'No docs drift detected',
    docsNeedingUpdate: [],
    changelogEntry: '',
    readmeIssues: [],
    overallImpact: 'none',
  };

  it('is quiet by default for no-impact analyses', () => {
    expect(shouldPostComment(noImpactAnalysis, false)).toBe(false);
  });

  it('can opt in to no-impact comments', () => {
    expect(shouldPostComment(noImpactAnalysis, true)).toBe(true);
  });

  it('still posts when docs need updates', () => {
    expect(
      shouldPostComment(
        {
          ...noImpactAnalysis,
          overallImpact: 'moderate',
          docsNeedingUpdate: [
            {
              file: 'README.md',
              reason: 'New flag added',
              suggestedChange: 'Document the new flag',
              priority: 'high',
            },
          ],
        },
        false
      )
    ).toBe(true);
  });
});

describe('syncComment', () => {
  const noImpactAnalysis: AnalysisResult = {
    summary: 'No docs drift detected',
    docsNeedingUpdate: [],
    changelogEntry: '',
    readmeIssues: [],
    overallImpact: 'none',
  };

  function createOctokitMock(existingBody?: string) {
    return {
      rest: {
        issues: {
          listComments: jest.fn().mockResolvedValue({
            data: existingBody
              ? [{ id: 42, body: existingBody }]
              : [],
          }),
          createComment: jest.fn().mockResolvedValue({}),
          updateComment: jest.fn().mockResolvedValue({}),
          deleteComment: jest.fn().mockResolvedValue({}),
        },
      },
    } as any;
  }

  it('does not create a comment for no-impact analyses by default', async () => {
    const octokit = createOctokitMock();

    await syncComment(octokit, 'goat-ai-claw', 'docpilot', 1, noImpactAnalysis, false);

    expect(octokit.rest.issues.createComment).not.toHaveBeenCalled();
    expect(octokit.rest.issues.updateComment).not.toHaveBeenCalled();
    expect(octokit.rest.issues.deleteComment).not.toHaveBeenCalled();
  });

  it('deletes an existing DocPilot comment when a PR becomes no-impact', async () => {
    const octokit = createOctokitMock('<!-- docpilot-v1 -->\nOld comment');

    await syncComment(octokit, 'goat-ai-claw', 'docpilot', 1, noImpactAnalysis, false);

    expect(octokit.rest.issues.deleteComment).toHaveBeenCalledWith({
      owner: 'goat-ai-claw',
      repo: 'docpilot',
      comment_id: 42,
    });
    expect(octokit.rest.issues.createComment).not.toHaveBeenCalled();
    expect(octokit.rest.issues.updateComment).not.toHaveBeenCalled();
  });

  it('creates a comment when impact is non-zero', async () => {
    const octokit = createOctokitMock();
    const analysis: AnalysisResult = {
      ...noImpactAnalysis,
      overallImpact: 'minor',
      docsNeedingUpdate: [
        {
          file: 'README.md',
          reason: 'New flag added',
          suggestedChange: 'Document the new flag',
          priority: 'medium',
        },
      ],
    };

    await syncComment(octokit, 'goat-ai-claw', 'docpilot', 1, analysis, false);

    expect(octokit.rest.issues.createComment).toHaveBeenCalled();
    expect(octokit.rest.issues.deleteComment).not.toHaveBeenCalled();
  });
});

describe('parseDocPaths', () => {
  it('includes upgrade guides in the default doc surfaces', () => {
    expect(parseDocPaths(DEFAULT_DOC_PATHS)).toEqual([
      'README.md',
      'docs/',
      'CHANGELOG.md',
      'UPGRADING.md',
    ]);
  });

  it('splits comma-separated paths', () => {
    expect(parseDocPaths('README.md,docs/,CHANGELOG.md')).toEqual([
      'README.md',
      'docs/',
      'CHANGELOG.md',
    ]);
  });

  it('trims whitespace', () => {
    expect(parseDocPaths(' README.md , docs/ ')).toEqual(['README.md', 'docs/']);
  });

  it('filters empty strings', () => {
    expect(parseDocPaths('README.md,,docs/')).toEqual(['README.md', 'docs/']);
  });
});

describe('prioritizeDocFiles', () => {
  it('keeps authoritative nested docs when a directory has more than five matches', () => {
    const files = [
      'docs/nav.md',
      'docs/sidebar.md',
      'docs/snippets.md',
      'docs/template.md',
      'docs/changelog/README.md',
      'docs/guide/README.md',
      'docs/migration.md',
      'docs/getting-started.md',
      'docs/installation.md',
    ];

    expect(prioritizeDocFiles(files, 5)).toEqual([
      'docs/changelog/README.md',
      'docs/guide/README.md',
      'docs/migration.md',
      'docs/getting-started.md',
      'docs/installation.md',
    ]);
  });

  it('deprioritizes nav and summary docs behind release and upgrade surfaces', () => {
    const files = [
      'docs/SUMMARY.md',
      'docs/sidebar.md',
      'docs/release-notes.md',
      'docs/configuration.md',
      'docs/upgrade.md',
    ];

    expect(prioritizeDocFiles(files, 3)).toEqual([
      'docs/release-notes.md',
      'docs/upgrade.md',
      'docs/configuration.md',
    ]);
  });
});

describe('truncate', () => {
  it('returns text unchanged if under limit', () => {
    expect(truncate('short', 100)).toBe('short');
  });

  it('truncates long text with indicator', () => {
    const result = truncate('a'.repeat(200), 50);
    expect(result.length).toBeLessThan(200);
    expect(result).toContain('[truncated');
  });
});
