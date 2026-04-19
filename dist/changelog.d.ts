export interface ChangelogSection {
    version: string;
    date: string;
    added: string[];
    changed: string[];
    fixed: string[];
    removed: string[];
    breaking: string[];
}
export declare function generateChangelogSection(apiKey: string, model: string, commits: string[], version: string): Promise<ChangelogSection>;
export declare function formatChangelogSection(section: ChangelogSection): string;
export declare function prependToChangelog(existing: string, newSection: string): string;
