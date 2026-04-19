import { getOctokit } from '@actions/github';
import type { AnalysisResult } from './analyzer';
export type DocPilotMode = 'suggest' | 'auto-update' | 'report';
type AutoUpdateDocsFn = (octokit: ReturnType<typeof getOctokit>, owner: string, repo: string, headRef: string, suggestions: Array<{
    file: string;
    suggestedChange: string;
}>) => Promise<void>;
type SyncCommentFn = (octokit: ReturnType<typeof getOctokit>, owner: string, repo: string, prNumber: number, analysis: AnalysisResult, commentOnNoImpact: boolean) => Promise<void>;
type SummaryWriteFn = (markdown: string) => Promise<void>;
export interface PublishAnalysisOptions {
    mode: DocPilotMode;
    octokit: ReturnType<typeof getOctokit>;
    owner: string;
    repo: string;
    prNumber: number;
    headRef: string;
    analysis: AnalysisResult;
    commentOnNoImpact: boolean;
    autoUpdateDocsFn: AutoUpdateDocsFn;
    syncCommentFn?: SyncCommentFn;
    summaryWriteFn?: SummaryWriteFn;
}
export declare function assertValidMode(mode: string): asserts mode is DocPilotMode;
export declare function buildReportBody(analysis: AnalysisResult): string;
export declare function publishAnalysisResult({ mode, octokit, owner, repo, prNumber, headRef, analysis, commentOnNoImpact, autoUpdateDocsFn, syncCommentFn, summaryWriteFn, }: PublishAnalysisOptions): Promise<void>;
export {};
