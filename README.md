# DocPilot

**AI-powered documentation that stays in sync with your code.**

DocPilot is a GitHub Action that analyzes every pull request and tells you exactly which docs need updating — before you merge stale documentation into main.

## Why DocPilot

Documentation drift is inevitable. Functions get renamed, config keys change, new features ship — and the README still describes the old behavior. Code review catches bugs; DocPilot catches docs debt.

- **Instant analysis** — posts a structured comment on every PR with specific, file-level suggestions
- **No server required** — runs entirely in GitHub Actions using your own OpenAI key
- **Auto-update mode** — optionally commits doc suggestions directly to the PR branch
- **Changelog generation** — drafts Keep-a-Changelog entries from your diff automatically

## Quickstart

**Step 1** — Add your OpenAI key as a GitHub secret named `OPENAI_API_KEY`.

**Step 2** — Create `.github/workflows/docpilot.yml`:

```yaml
name: DocPilot

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  docs:
    runs-on: ubuntu-latest
    permissions:
      contents: write      # needed for auto-update mode
      pull-requests: write # needed to post comments
    steps:
      - uses: actions/checkout@v4
      - uses: goat-ai-claw/docpilot@v1
        with:
          openai_api_key: ${{ secrets.OPENAI_API_KEY }}
```

**Step 3** — Open a pull request. DocPilot posts a comment like this:

> ⚠️ **DocPilot — Moderate documentation impact**
>
> Added a new `--timeout` flag to the CLI that isn't documented in README.md.
>
> 📄 **1 file needs updating**
> - `README.md` — 🔴 High priority

## Configuration

| Input | Default | Description |
|-------|---------|-------------|
| `openai_api_key` | — | **Required.** Your OpenAI API key. Store as a GitHub secret. |
| `github_token` | `github.token` | GitHub token for posting comments and reading PRs. |
| `model` | `gpt-4o-mini` | OpenAI model. Use `gpt-4o` for higher quality. |
| `doc_paths` | `README.md,docs/,CHANGELOG.md` | Comma-separated files or directories to analyze. Directories end with `/`. |
| `mode` | `suggest` | `suggest` posts a PR comment. `auto-update` commits suggestions to the PR branch. |

## Outputs

| Output | Description |
|--------|-------------|
| `impact` | `none`, `minor`, `moderate`, or `major` |
| `docs_updated` | Number of files flagged for updates |
| `summary` | One-line summary of the PR's documentation impact |

## Example: Gate merges on major doc impact

```yaml
- uses: goat-ai-claw/docpilot@v1
  id: docpilot
  with:
    openai_api_key: ${{ secrets.OPENAI_API_KEY }}

- name: Block merge on major doc impact
  if: steps.docpilot.outputs.impact == 'major'
  run: |
    echo "Major documentation impact detected. Please update docs before merging."
    exit 1
```

## Example: Auto-update mode

```yaml
- uses: goat-ai-claw/docpilot@v1
  with:
    openai_api_key: ${{ secrets.OPENAI_API_KEY }}
    mode: auto-update
    doc_paths: 'README.md,docs/'
```

In `auto-update` mode, DocPilot commits suggestions directly to the PR branch wrapped in review markers. Authors merge, edit, or discard them as needed.

## Cost

DocPilot uses `gpt-4o-mini` by default. A typical PR analysis costs **~$0.001–$0.005** depending on diff and doc size.

## License

MIT © 2026 DocPilot Contributors
