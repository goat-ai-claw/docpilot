# DocPilot

[![CI](https://github.com/goat-ai-claw/docpilot/actions/workflows/ci.yml/badge.svg)](https://github.com/goat-ai-claw/docpilot/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE) [![GitHub stars](https://img.shields.io/github/stars/goat-ai-claw/docpilot?style=social)](https://github.com/goat-ai-claw/docpilot/stargazers)

**Catch documentation drift before merge.**

DocPilot is a lightweight GitHub Action that checks pull requests for missing README, docs, and changelog updates — then drafts suggestions right in GitHub.

- **Purpose-built for docs drift** — not another generic AI review bot
- **Runs in your existing PR workflow** — no new platform, dashboard, or docs migration
- **Works with the docs you already have** — `README.md`, `docs/`, `CHANGELOG.md`, release notes
- **Cheap + transparent** — BYO OpenAI key, typically ~`$0.001–$0.005` per PR

## Why DocPilot

Documentation drift happens when code changes but the docs do not. A CLI flag gets renamed, a config key changes, a feature ships — and the README still describes the old behavior. Code review catches bugs; DocPilot catches docs debt before merge.

## See it in action

[![DocPilot walkthrough GIF](assets/docpilot-demo-walkthrough.gif)](https://github.com/goat-ai-claw/docpilot/pull/1)

Animated walkthrough of a real [PR #1](https://github.com/goat-ai-claw/docpilot/pull/1) comment: DocPilot summarizes the documentation impact, flags the exact file that needs updating, and suggests a changelog entry.

[![DocPilot PR comment screenshot](assets/docpilot-demo-pr-comment.png)](https://github.com/goat-ai-claw/docpilot/pull/1)

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

## Why not just use a code review bot or docs platform?

| Option | Best for | Tradeoff |
|--------|----------|----------|
| **DocPilot** | Catching docs drift inside normal PR review | Focused scope by design |
| Generic AI review bots | Broad code review across many issue types | Docs coverage is usually incidental, not the product |
| Docs platforms | Hosting / publishing / search / docs portals | Heavier adoption, migration, and subscription overhead |
| PR templates + manual review | Lightweight reminders | Easy to ignore, inconsistent in practice |

DocPilot is intentionally narrow: it answers one high-value question in every PR — **did this code change require a docs update?**

## Cost

DocPilot uses `gpt-4o-mini` by default. A typical PR analysis costs **~$0.001–$0.005** depending on diff and doc size.

## License

MIT © 2026 DocPilot Contributors
