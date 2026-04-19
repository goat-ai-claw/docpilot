import OpenAI from 'openai';
import { logWarning } from './utils';

const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 1000;

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function shouldRetryLLMError(error: Error): boolean {
  const status = (error as Error & { status?: number }).status;

  if (typeof status === 'number') {
    if (status === 408 || status === 409 || status === 429 || status >= 500) {
      return true;
    }

    return false;
  }

  return true;
}

export async function callLLM(
  apiKey: string,
  model: string,
  messages: LLMMessage[],
  maxTokens = 2048
): Promise<LLMResponse> {
  const client = new OpenAI({ apiKey });

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await client.chat.completions.create({
        model,
        messages,
        max_tokens: maxTokens,
        temperature: 0.2,
      });

      const content = response.choices[0]?.message?.content ?? '';
      const usage = response.usage
        ? {
            promptTokens: response.usage.prompt_tokens,
            completionTokens: response.usage.completion_tokens,
            totalTokens: response.usage.total_tokens,
          }
        : undefined;

      return { content, usage };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (!shouldRetryLLMError(lastError)) {
        throw lastError;
      }

      if (attempt < MAX_RETRIES) {
        const delay = BASE_RETRY_DELAY_MS * attempt;
        logWarning(
          `LLM call failed (attempt ${attempt}/${MAX_RETRIES}): ${lastError.message}. Retrying in ${delay}ms...`
        );
        await sleep(delay);
      }
    }
  }

  throw new Error(`LLM call failed after ${MAX_RETRIES} attempts: ${lastError?.message}`);
}
