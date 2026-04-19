import { buildComment } from '../src/commenter';
import { parseDocPaths, truncate } from '../src/utils';
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

describe('parseDocPaths', () => {
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
