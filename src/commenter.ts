import { getOctokit } from '@actions/github';
import type { AnalysisResult } from './analyzer';
import { logInfo } from './utils';

const COMMENT_MARKER = '<!-- docpilot-v1 -->';

const IMPACT_EMOJI: Record<string, string> = {
  none: '✅',
  minor: '📝',
  moderate: '⚠️',
  major: '🚨',
};

const IMPACT_LABEL: Record<string, string> = {
  none: 'No documentation impact',
  minor: 'Minor documentation impact',
  moderate: 'Moderate documentation impact',
  major: 'Major documentation impact',
};

export function buildComment(analysis: AnalysisResult, prNumber: number): string {
  const emoji = IMPACT_EMOJI[analysis.overallImpact] ?? '📝';
  const label = IMPACT_LABEL[analysis.overallImpact] ?? 'Documentation impact';

  const lines: string[] = [
    COMMENT_MARKER,
    `## ${emoji} DocPilot — ${label}`,
    '',
    `> ${analysis.summary}`,
    '',
  ];

  if (analysis.overallImpact === 'none') {
    lines.push(
      'No documentation updates appear to be needed for this PR. ' +
        'All existing docs look accurate against the changes.'
    );
    lines.push('');
    lines.push('---');
    lines.push(
      '*Powered by [DocPilot](https://github.com/goat-ai-claw/docpilot) — AI docs that stay fresh*'
    );
    return lines.join('\n');
  }

  // Per-file suggestions
  if (analysis.docsNeedingUpdate.length > 0) {
    const count = analysis.docsNeedingUpdate.length;
    lines.push(`### 📄 ${count} file${count !== 1 ? 's' : ''} need${count === 1 ? 's' : ''} updating`);
    lines.push('');

    // Sort by priority: high → medium → low
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    const sorted = [...analysis.docsNeedingUpdate].sort(
      (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]
    );

    for (const suggestion of sorted) {
      const priorityBadge =
        suggestion.priority === 'high'
          ? '🔴 **High priority**'
          : suggestion.priority === 'medium'
          ? '🟡 **Medium priority**'
          : '🟢 **Low priority**';

      lines.push('<details>');
      lines.push(
        `<summary><code>${suggestion.file}</code> — ${priorityBadge}</summary>`
      );
      lines.push('');
      lines.push(`**Why this needs updating:** ${suggestion.reason}`);
      lines.push('');
      lines.push('**Suggested change:**');
      lines.push('');
      lines.push('```markdown');
      lines.push(suggestion.suggestedChange);
      lines.push('```');
      lines.push('');
      lines.push('</details>');
      lines.push('');
    }
  }

  // README issues
  if (analysis.readmeIssues.length > 0) {
    lines.push('<details>');
    lines.push(`<summary>🔍 README issues found (${analysis.readmeIssues.length})</summary>`);
    lines.push('');
    for (const issue of analysis.readmeIssues) {
      lines.push(`- ${issue}`);
    }
    lines.push('');
    lines.push('</details>');
    lines.push('');
  }

  // Changelog entry
  if (analysis.changelogEntry) {
    lines.push('<details>');
    lines.push('<summary>📋 Suggested CHANGELOG.md entry</summary>');
    lines.push('');
    lines.push('```markdown');
    lines.push(analysis.changelogEntry);
    lines.push('```');
    lines.push('');
    lines.push('</details>');
    lines.push('');
  }

  lines.push('---');
  lines.push(
    '*Powered by [DocPilot](https://github.com/goat-ai-claw/docpilot) — AI docs that stay fresh*'
  );

  return lines.join('\n');
}

export async function postComment(
  octokit: ReturnType<typeof getOctokit>,
  owner: string,
  repo: string,
  prNumber: number,
  analysis: AnalysisResult
): Promise<void> {
  const body = buildComment(analysis, prNumber);

  // Check for an existing DocPilot comment to update instead of creating a new one
  const { data: comments } = await octokit.rest.issues.listComments({
    owner,
    repo,
    issue_number: prNumber,
    per_page: 100,
  });

  const existing = comments.find(c => c.body?.includes(COMMENT_MARKER));

  if (existing) {
    logInfo(`Updating existing DocPilot comment (id: ${existing.id})`);
    await octokit.rest.issues.updateComment({
      owner,
      repo,
      comment_id: existing.id,
      body,
    });
  } else {
    logInfo('Creating new DocPilot comment');
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body,
    });
  }
}
