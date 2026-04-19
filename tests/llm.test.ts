const createMock = jest.fn();

jest.mock('openai', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: createMock,
        },
      },
    })),
  };
});

import { callLLM } from '../src/llm';

describe('callLLM', () => {
  beforeEach(() => {
    createMock.mockReset();
  });

  it('does not retry non-transient auth failures', async () => {
    const error = Object.assign(new Error('401 invalid api key'), { status: 401 });
    createMock.mockRejectedValue(error);

    await expect(
      callLLM('bad-key', 'gpt-4o-mini', [{ role: 'user', content: 'hello' }], 32)
    ).rejects.toThrow('401 invalid api key');

    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it('retries transient rate-limit failures and eventually succeeds', async () => {
    const rateLimitError = Object.assign(new Error('rate limited'), { status: 429 });
    createMock
      .mockRejectedValueOnce(rateLimitError)
      .mockResolvedValueOnce({
        choices: [{ message: { content: '{"ok":true}' } }],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
      });

    await expect(
      callLLM('test-key', 'gpt-4o-mini', [{ role: 'user', content: 'hello' }], 32)
    ).resolves.toEqual({
      content: '{"ok":true}',
      usage: {
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
      },
    });

    expect(createMock).toHaveBeenCalledTimes(2);
  });
});
