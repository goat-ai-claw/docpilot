import type { AnalysisResult } from '../src/analyzer';
import { assertValidMode, buildReportBody, publishAnalysisResult } from '../src/publish';

describe('assertValidMode', () => {
  it('accepts report mode', () => {
    expect(() => assertValidMode('report')).not.toThrow();
  });

  it('rejects invalid modes', () => {
    expect(() => assertValidMode('comment-only')).toThrow('Invalid mode');
  });
});

describe('buildReportBody', () => {
  const analysis: AnalysisResult = {
    summary: 'CLI flag changed and docs need an update',
    overallImpact: 'moderate',
    readmeIssues: ['README example still uses the old flag'],
    changelogEntry: '- feat: document the new timeout flag (#12)',
    docsNeedingUpdate: [
      {
        file: 'README.md',
        reason: 'New --timeout flag is not documented',
        suggestedChange: 'Add a section for the timeout flag',
        priority: 'high',
      },
    ],
  };

  it('includes impact, summary, suggested files, and changelog entry', () => {
    const report = buildReportBody(analysis);

    expect(report).toContain('## DocPilot report');
    expect(report).toContain('**Impact:** `moderate`');
    expect(report).toContain('CLI flag changed and docs need an update');
    expect(report).toContain('`README.md`');
    expect(report).toContain('README example still uses the old flag');
    expect(report).toContain('document the new timeout flag');
  });
});

describe('publishAnalysisResult', () => {
  const analysis: AnalysisResult = {
    summary: 'Config rename needs README changes',
    overallImpact: 'moderate',
    readmeIssues: [],
    changelogEntry: '',
    docsNeedingUpdate: [
      {
        file: 'README.md',
        reason: 'Config key changed from foo to bar',
        suggestedChange: 'Update the configuration section',
        priority: 'high',
      },
    ],
  };

  it('report mode skips comments and auto-updates but writes a summary', async () => {
    const syncCommentFn = jest.fn().mockResolvedValue(undefined);
    const autoUpdateDocsFn = jest.fn().mockResolvedValue(undefined);
    const summaryWriteFn = jest.fn().mockResolvedValue(undefined);

    await publishAnalysisResult({
      mode: 'report',
      octokit: {} as any,
      owner: 'goat-ai-claw',
      repo: 'docpilot',
      prNumber: 12,
      headRef: 'feature/report-mode',
      analysis,
      commentOnNoImpact: false,
      syncCommentFn,
      autoUpdateDocsFn,
      summaryWriteFn,
    });

    expect(syncCommentFn).not.toHaveBeenCalled();
    expect(autoUpdateDocsFn).not.toHaveBeenCalled();
    expect(summaryWriteFn).toHaveBeenCalledTimes(1);
    expect(summaryWriteFn.mock.calls[0][0]).toContain('## DocPilot report');
  });

  it('auto-update mode still updates docs and synchronizes the PR comment', async () => {
    const syncCommentFn = jest.fn().mockResolvedValue(undefined);
    const autoUpdateDocsFn = jest.fn().mockResolvedValue(undefined);
    const summaryWriteFn = jest.fn().mockResolvedValue(undefined);

    await publishAnalysisResult({
      mode: 'auto-update',
      octokit: {} as any,
      owner: 'goat-ai-claw',
      repo: 'docpilot',
      prNumber: 12,
      headRef: 'feature/report-mode',
      analysis,
      commentOnNoImpact: false,
      syncCommentFn,
      autoUpdateDocsFn,
      summaryWriteFn,
    });

    expect(autoUpdateDocsFn).toHaveBeenCalledWith(
      {},
      'goat-ai-claw',
      'docpilot',
      'feature/report-mode',
      [
        {
          file: 'README.md',
          suggestedChange: 'Update the configuration section',
        },
      ]
    );
    expect(syncCommentFn).toHaveBeenCalledWith({}, 'goat-ai-claw', 'docpilot', 12, analysis, false);
    expect(summaryWriteFn).not.toHaveBeenCalled();
  });
});
