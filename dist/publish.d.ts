import { getOctokit } from '@actions/github';
import type { AnalysisResult } from './analyzer';
export type DocPilotMode = 'suggest' | 'auto-update' | 'report';
export type FailOnImpact = '' | Exclude<AnalysisResult['overallImpact'], 'none'>;
type AutoUpdateDocsFn = (octokit: ReturnType<typeof getOctokit>, owner: string, repo: string, headRef: string, suggestions: Array<{
    file: string;
    suggestedChange: string;
}>) => Promise<void>;
type SyncCommentFn = (octokit: ReturnType<typeof getOctokit>, owner: string, repo: string, prNumber: number, analysis: AnalysisResult, commentOnNoImpact: boolean) => Promise<void>;
type SummaryWriteFn = (markdown: string) => Promise<void>;
type SetFailedFn = (message: string) => void;
export interface PublishAnalysisOptions {
    mode: DocPilotMode;
    octokit: ReturnType<typeof getOctokit>;
    owner: string;
    repo: string;
    prNumber: number;
    headRef: string;
    analysis: AnalysisResult;
    commentOnNoImpact: boolean;
    failOnImpact?: FailOnImpact;
    autoUpdateDocsFn: AutoUpdateDocsFn;
    syncCommentFn?: SyncCommentFn;
    summaryWriteFn?: SummaryWriteFn;
    setFailedFn?: SetFailedFn;
}
export declare function assertValidMode(mode: string): asserts mode is DocPilotMode;
export declare function assertValidFailOnImpact(value: string): asserts value is FailOnImpact;
export declare function shouldFailForImpact(impact: AnalysisResult['overallImpact'], threshold: FailOnImpact): boolean;
export declare function buildReportBody(analysis: AnalysisResult): string;
export declare function publishAnalysisResult({ mode, octokit, owner, repo, prNumber, headRef, analysis, commentOnNoImpact, failOnImpact, autoUpdateDocsFn, syncCommentFn, summaryWriteFn, setFailedFn, }: PublishAnalysisOptions): Promise<void>;
export {};
