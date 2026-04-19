export interface PRContext {
    owner: string;
    repo: string;
    prNumber: number;
    headRef: string;
    headSha: string;
    baseSha: string;
}
export declare const DEFAULT_DOC_PATHS = "README.md,docs/,CHANGELOG.md,UPGRADING.md";
export declare function getPRContext(): PRContext;
export declare function parseDocPaths(docPathsInput: string): string[];
export declare function truncate(text: string, maxChars: number): string;
export declare function logInfo(message: string): void;
export declare function logWarning(message: string): void;
export declare function logError(message: string): void;
