export const context = {
  repo: { owner: 'test-owner', repo: 'test-repo' },
  payload: {
    pull_request: {
      number: 42,
      head: { ref: 'feature-branch', sha: 'abc123' },
      base: { sha: 'def456' },
    },
  },
};

export function getOctokit(token: string) {
  return {};
}
