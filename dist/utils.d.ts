export interface PRContext {
    owner: string;
    repo: string;
    prNumber: number;
    headRef: string;
    headSha: string;
    baseSha: string;
}
export declare const DEFAULT_DOC_PATHS = "README.md,docs/,CHANGELOG.md,UPGRADING.md";
export declare const DOC_FILES_PER_DIRECTORY_LIMIT = 5;
export declare function expandDocPathsWithAutoDiscovery(allFiles: string[], docPaths: string[]): string[];
export declare function resolveDocPathsForCollection(allFiles: string[], docPaths: string[], allowAutoDiscovery?: boolean): string[];
export declare function isSupportedDocFile(path: string): boolean;
export declare function prioritizeDocFiles(paths: string[], limit?: number): string[];
export declare function getPRContext(): PRContext;
export declare function parseDocPaths(docPathsInput: string): string[];
export declare function truncate(text: string, maxChars: number): string;
export declare function logInfo(message: string): void;
export declare function logWarning(message: string): void;
export declare function logError(message: string): void;
