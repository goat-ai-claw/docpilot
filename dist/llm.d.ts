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
export declare function callLLM(apiKey: string, model: string, messages: LLMMessage[], maxTokens?: number): Promise<LLMResponse>;
