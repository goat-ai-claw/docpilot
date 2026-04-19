import type { AnalysisResult } from '../src/analyzer';
import {
  assertValidMode,
  assertValidFailOnImpact,
  buildReportBody,
  publishAnalysisResult,
  shouldFailForImpact,
} from '../src/publish';

describe('assertValidMode', () => {
  it('accepts report mode', () => {
    expect(() => assertValidMode('report')).not.toThrow();
  });

  it('rejects invalid modes', () => {
    expect(() => assertValidMode('comment-only')).toThrow('Invalid mode');
  });
});

describe('assertValidFailOnImpact', () => {
  it('accepts empty and known impact thresholds', () => {
    expect(() => assertValidFailOnImpact('')).not.toThrow();
    expect(() => assertValidFailOnImpact('moderate')).not.toThrow();
  });

  it('rejects invalid thresholds', () => {
    expect(() => assertValidFailOnImpact('none')).toThrow('Invalid fail_on_impact');
    expect(() => assertValidFailOnImpact('urgent')).toThrow('Invalid fail_on_impact');
  });
});

describe('shouldFailForImpact', () => {
  it('returns false when threshold is disabled', () => {
    expect(shouldFailForImpact('major', '')).toBe(false);
  });

  it('returns true when impact meets the configured threshold', () => {
    expect(shouldFailForImpact('moderate', 'moderate')).toBe(true);
    expect(shouldFailForImpact('major', 'moderate')).toBe(true);
  });

  it('returns false when impact is below the configured threshold', () => {
    expect(shouldFailForImpact('minor', 'moderate')).toBe(false);
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

  it('marks the run failed when impact meets fail_on_impact threshold', async () => {
    const syncCommentFn = jest.fn().mockResolvedValue(undefined);
    const autoUpdateDocsFn = jest.fn().mockResolvedValue(undefined);
    const summaryWriteFn = jest.fn().mockResolvedValue(undefined);
    const setFailedFn = jest.fn();

    await publishAnalysisResult({
      mode: 'report',
      octokit: {} as any,
      owner: 'goat-ai-claw',
      repo: 'docpilot',
      prNumber: 12,
      headRef: 'feature/report-mode',
      analysis,
      commentOnNoImpact: false,
      autoUpdateDocsFn,
      syncCommentFn,
      summaryWriteFn,
      failOnImpact: 'moderate',
      setFailedFn,
    });

    expect(summaryWriteFn).toHaveBeenCalledTimes(1);
    expect(setFailedFn).toHaveBeenCalledWith(
      'DocPilot detected moderate documentation impact, meeting the fail_on_impact threshold of moderate.'
    );
  });

  it('still marks the run failed in auto-update mode when impact meets the threshold', async () => {
    const syncCommentFn = jest.fn().mockResolvedValue(undefined);
    const autoUpdateDocsFn = jest.fn().mockResolvedValue(undefined);
    const summaryWriteFn = jest.fn().mockResolvedValue(undefined);
    const setFailedFn = jest.fn();

    await publishAnalysisResult({
      mode: 'auto-update',
      octokit: {} as any,
      owner: 'goat-ai-claw',
      repo: 'docpilot',
      prNumber: 12,
      headRef: 'feature/report-mode',
      analysis,
      commentOnNoImpact: false,
      autoUpdateDocsFn,
      syncCommentFn,
      summaryWriteFn,
      failOnImpact: 'minor',
      setFailedFn,
    });

    expect(autoUpdateDocsFn).toHaveBeenCalledTimes(1);
    expect(syncCommentFn).toHaveBeenCalledTimes(1);
    expect(summaryWriteFn).not.toHaveBeenCalled();
    expect(setFailedFn).toHaveBeenCalledWith(
      'DocPilot detected moderate documentation impact, meeting the fail_on_impact threshold of minor.'
    );
  });
});
