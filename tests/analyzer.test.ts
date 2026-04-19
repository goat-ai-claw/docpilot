import { analyzeDiff } from '../src/analyzer';
import { callLLM } from '../src/llm';

jest.mock('../src/llm', () => ({
  callLLM: jest.fn(),
}));

const mockedCallLLM = callLLM as jest.MockedFunction<typeof callLLM>;

describe('analyzeDiff', () => {
  beforeEach(() => {
    mockedCallLLM.mockReset();
  });

  it('parses valid JSON and substitutes PR_NUMBER in changelog entries', async () => {
    mockedCallLLM.mockResolvedValue({
      content: JSON.stringify({
        summary: 'Adds a timeout flag for the CLI.',
        overallImpact: 'moderate',
        docsNeedingUpdate: [
          {
            file: 'README.md',
            reason: 'The new flag is not documented.',
            suggestedChange: 'Document the new `--timeout` flag.',
            priority: 'high',
          },
        ],
        changelogEntry: '- feat: add timeout flag (#PR_NUMBER)',
        readmeIssues: ['CLI flags table is stale'],
      }),
    });

    await expect(
      analyzeDiff('test-key', 'gpt-4o-mini', 'diff --git a b', { 'README.md': '# Docs' }, 17, 'Add timeout flag')
    ).resolves.toEqual({
      summary: 'Adds a timeout flag for the CLI.',
      overallImpact: 'moderate',
      docsNeedingUpdate: [
        {
          file: 'README.md',
          reason: 'The new flag is not documented.',
          suggestedChange: 'Document the new `--timeout` flag.',
          priority: 'high',
        },
      ],
      changelogEntry: '- feat: add timeout flag (#17)',
      readmeIssues: ['CLI flags table is stale'],
    });
  });

  it('rejects malformed LLM output instead of pretending there is no documentation impact', async () => {
    mockedCallLLM.mockResolvedValue({
      content: 'not valid json',
    });

    await expect(
      analyzeDiff('test-key', 'gpt-4o-mini', 'diff --git a b', { 'README.md': '# Docs' }, 3, 'Bad response')
    ).rejects.toThrow(/invalid structured response/i);
  });

  it('rejects schema-invalid JSON instead of accepting incomplete analysis', async () => {
    mockedCallLLM.mockResolvedValue({
      content: JSON.stringify({
        overallImpact: 'moderate',
        docsNeedingUpdate: [],
        changelogEntry: '',
        readmeIssues: [],
      }),
    });

    await expect(
      analyzeDiff('test-key', 'gpt-4o-mini', 'diff --git a b', { 'README.md': '# Docs' }, 4, 'Incomplete response')
    ).rejects.toThrow(/invalid structured response/i);
  });

  it('retries once when the first structured response is invalid and accepts a valid retry', async () => {
    mockedCallLLM
      .mockResolvedValueOnce({
        content: 'not valid json',
      })
      .mockResolvedValueOnce({
        content: JSON.stringify({
          summary: 'Adds a new webhook event.',
          overallImpact: 'minor',
          docsNeedingUpdate: [],
          changelogEntry: '- feat: add webhook event (#PR_NUMBER)',
          readmeIssues: [],
        }),
      });

    await expect(
      analyzeDiff('test-key', 'gpt-4o-mini', 'diff --git a b', { 'README.md': '# Docs' }, 9, 'Retry success')
    ).resolves.toMatchObject({
      summary: 'Adds a new webhook event.',
      overallImpact: 'minor',
      changelogEntry: '- feat: add webhook event (#9)',
    });

    expect(mockedCallLLM).toHaveBeenCalledTimes(2);
  });

  it('surfaces real LLM call failures directly instead of relabeling them as structured-output errors', async () => {
    mockedCallLLM.mockRejectedValue(new Error('401 invalid api key'));

    await expect(
      analyzeDiff('test-key', 'gpt-4o-mini', 'diff --git a b', { 'README.md': '# Docs' }, 11, 'Transport failure')
    ).rejects.toThrow('401 invalid api key');

    expect(mockedCallLLM).toHaveBeenCalledTimes(1);
  });
});
