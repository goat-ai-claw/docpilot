import { getOctokit } from '@actions/github';
import type { AnalysisResult } from './analyzer';
export declare function buildComment(analysis: AnalysisResult, prNumber: number): string;
export declare function shouldPostComment(analysis: AnalysisResult, commentOnNoImpact: boolean): boolean;
export declare function syncComment(octokit: ReturnType<typeof getOctokit>, owner: string, repo: string, prNumber: number, analysis: AnalysisResult, commentOnNoImpact: boolean): Promise<void>;
