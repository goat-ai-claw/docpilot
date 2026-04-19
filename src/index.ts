import * as core from '@actions/core';
import { getOctokit } from '@actions/github';
import { analyzeDiff } from './analyzer';
import {
  DEFAULT_DOC_PATHS,
  getPRContext,
  logError,
  logInfo,
  parseDocPaths,
  prioritizeDocFiles,
  resolveDocPathsForCollection,
} from './utils';
import { assertValidMode, assertValidFailOnImpact, publishAnalysisResult } from './publish';

async function getPRDiff(
  octokit: ReturnType<typeof getOctokit>,
  owner: string,
  repo: string,
  prNumber: number
): Promise<string> {
  // Request the diff media type
  const response = await octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}', {
    owner,
    repo,
    pull_number: prNumber,
    headers: {
      accept: 'application/vnd.github.v3.diff',
    },
  });
  return response.data as unknown as string;
}

async function getFileContent(
  octokit: ReturnType<typeof getOctokit>,
  owner: string,
  repo: string,
  path: string,
  ref: string
): Promise<string | null> {
  try {
    const response = await octokit.rest.repos.getContent({ owner, repo, path, ref });
    const data = response.data;
    if (!Array.isArray(data) && data.type === 'file' && 'content' in data) {
      return Buffer.from(data.content, 'base64').toString('utf-8');
    }
    return null;
  } catch {
    return null;
  }
}

async function getRepoTree(
  octokit: ReturnType<typeof getOctokit>,
  owner: string,
  repo: string,
  sha: string
): Promise<string[]> {
  try {
    const response = await octokit.rest.git.getTree({
      owner,
      repo,
      tree_sha: sha,
      recursive: '1',
    });
    return response.data.tree
      .filter(item => item.type === 'blob' && item.path)
      .map(item => item.path!);
  } catch {
    return [];
  }
}

async function collectDocFiles(
  octokit: ReturnType<typeof getOctokit>,
  owner: string,
  repo: string,
  headSha: string,
  docPaths: string[],
  allowAutoDiscovery: boolean
): Promise<Record<string, string>> {
  const allFiles = await getRepoTree(octokit, owner, repo, headSha);
  const docs: Record<string, string> = {};
  const effectiveDocPaths = resolveDocPathsForCollection(allFiles, docPaths, allowAutoDiscovery);

  for (const docPath of effectiveDocPaths) {
    if (docPath.endsWith('/')) {
      // Directory — collect all markdown/text files inside
      const matches = allFiles.filter(
        f =>
          f.startsWith(docPath) &&
          (f.endsWith('.md') || f.endsWith('.mdx') || f.endsWith('.txt') || f.endsWith('.rst'))
      );
      for (const match of prioritizeDocFiles(matches)) {
        const content = await getFileContent(octokit, owner, repo, match, headSha);
        if (content) docs[match] = content;
      }
    } else {
      const content = await getFileContent(octokit, owner, repo, docPath, headSha);
      if (content) docs[docPath] = content;
    }
  }

  return docs;
}

async function autoUpdateDocs(
  octokit: ReturnType<typeof getOctokit>,
  owner: string,
  repo: string,
  headRef: string,
  suggestions: Array<{ file: string; suggestedChange: string }>
): Promise<void> {
  for (const suggestion of suggestions) {
    try {
      const existing = await octokit.rest.repos.getContent({
        owner,
        repo,
        path: suggestion.file,
        ref: headRef,
      });

      const data = existing.data;
      if (Array.isArray(data) || data.type !== 'file' || !('sha' in data)) {
        logError(`Cannot auto-update ${suggestion.file}: not a regular file`);
        continue;
      }

      const currentContent = Buffer.from(data.content, 'base64').toString('utf-8');

      // Append the suggestion with a clear marker so authors can review and edit
      const updatedContent =
        currentContent.trimEnd() +
        '\n\n<!-- DocPilot: review and integrate this suggestion -->\n' +
        suggestion.suggestedChange +
        '\n<!-- /DocPilot -->\n';

      await octokit.rest.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: suggestion.file,
        message: `docs: DocPilot suggestions for ${suggestion.file}`,
        content: Buffer.from(updatedContent).toString('base64'),
        sha: data.sha,
        branch: headRef,
      });

      logInfo(`Auto-updated ${suggestion.file}`);
    } catch (err) {
      logError(`Failed to auto-update ${suggestion.file}: ${String(err)}`);
    }
  }
}

async function run(): Promise<void> {
  try {
    const openaiApiKey = core.getInput('openai_api_key', { required: true });
    const githubToken = core.getInput('github_token', { required: true });
    const model = core.getInput('model') || 'gpt-4o-mini';
    const docPathsInput = core.getInput('doc_paths');
    const docPaths = parseDocPaths(docPathsInput || DEFAULT_DOC_PATHS);
    const allowAutoDiscovery = docPathsInput.trim().length === 0;
    const mode = core.getInput('mode') || 'suggest';
    const failOnImpact = (core.getInput('fail_on_impact') || '').toLowerCase();
    const commentOnNoImpact = (core.getInput('comment_on_no_impact') || 'false').toLowerCase() === 'true';

    assertValidMode(mode);
    assertValidFailOnImpact(failOnImpact);

    const octokit = getOctokit(githubToken);
    const prContext = getPRContext();

    logInfo(`Running in "${mode}" mode on PR #${prContext.prNumber}`);
    logInfo(`Model: ${model}`);
    logInfo(`Watching doc paths: ${docPaths.join(', ')}`);
    logInfo(`Fail on impact threshold: ${failOnImpact || 'disabled'}`);
    logInfo(`Comment on no impact: ${commentOnNoImpact}`);

    // Fetch PR metadata
    const { data: pr } = await octokit.rest.pulls.get({
      owner: prContext.owner,
      repo: prContext.repo,
      pull_number: prContext.prNumber,
    });

    // Fetch diff
    logInfo('Fetching PR diff...');
    const diff = await getPRDiff(
      octokit,
      prContext.owner,
      prContext.repo,
      prContext.prNumber
    );

    if (!diff || diff.trim().length === 0) {
      logInfo('Empty diff — nothing to analyze.');
      core.setOutput('impact', 'none');
      core.setOutput('docs_updated', '0');
      core.setOutput('summary', 'No changes detected.');
      return;
    }

    // Collect existing docs
    logInfo('Collecting existing documentation...');
    const existingDocs = await collectDocFiles(
      octokit,
      prContext.owner,
      prContext.repo,
      prContext.headSha,
      docPaths,
      allowAutoDiscovery
    );
    logInfo(`Found ${Object.keys(existingDocs).length} doc file(s): ${Object.keys(existingDocs).join(', ') || 'none'}`);

    // Analyze
    logInfo(`Sending diff to ${model} for analysis...`);
    const analysis = await analyzeDiff(
      openaiApiKey,
      model,
      diff,
      existingDocs,
      prContext.prNumber,
      pr.title
    );

    logInfo(`Impact: ${analysis.overallImpact} | Docs needing updates: ${analysis.docsNeedingUpdate.length}`);

    await publishAnalysisResult({
      mode,
      octokit,
      owner: prContext.owner,
      repo: prContext.repo,
      prNumber: prContext.prNumber,
      headRef: prContext.headRef,
      analysis,
      commentOnNoImpact,
      failOnImpact,
      autoUpdateDocsFn: autoUpdateDocs,
    });

    // Expose outputs
    core.setOutput('impact', analysis.overallImpact);
    core.setOutput('docs_updated', String(analysis.docsNeedingUpdate.length));
    core.setOutput('summary', analysis.summary);

    logInfo('Done.');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    core.setFailed(`DocPilot failed: ${message}`);
  }
}

run();
