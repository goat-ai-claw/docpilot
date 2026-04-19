import { getOctokit } from '@actions/github';
import type { AnalysisResult } from './analyzer';
export declare function buildComment(analysis: AnalysisResult, prNumber: number): string;
export declare function postComment(octokit: ReturnType<typeof getOctokit>, owner: string, repo: string, prNumber: number, analysis: AnalysisResult): Promise<void>;
