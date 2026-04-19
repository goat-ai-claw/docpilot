export interface DocSuggestion {
    file: string;
    reason: string;
    suggestedChange: string;
    priority: 'high' | 'medium' | 'low';
}
export interface AnalysisResult {
    summary: string;
    docsNeedingUpdate: DocSuggestion[];
    changelogEntry: string;
    readmeIssues: string[];
    overallImpact: 'none' | 'minor' | 'moderate' | 'major';
}
export declare class AnalysisParseError extends Error {
    constructor(message: string);
}
export declare function analyzeDiff(apiKey: string, model: string, diff: string, existingDocs: Record<string, string>, prNumber: number, prTitle: string): Promise<AnalysisResult>;
