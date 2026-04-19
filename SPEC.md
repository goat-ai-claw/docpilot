# DocPilot — AI-Powered Documentation That Stays Fresh

## What It Does
DocPilot is a GitHub Action that automatically analyzes PRs and generates/updates documentation. When a developer opens a PR, DocPilot:

1. Analyzes the diff to understand what changed
2. Checks if existing docs (README, API docs, changelogs) need updates
3. Suggests doc changes as a PR comment OR opens a companion docs PR
4. Generates changelogs from commit history

## Core Features (MVP — ship in 3 days)

### Feature 1: PR Doc Analysis
- Triggered on PR open/update
- Reads the diff + existing docs
- Posts a comment: "These docs may need updating: [list]"
- Suggests specific doc changes inline

### Feature 2: Auto-Changelog
- Triggered on PR merge to main
- Reads conventional commits since last release
- Generates/updates CHANGELOG.md
- Opens a PR with the changelog update

### Feature 3: README Sync Check
- Checks if README references match actual exports/APIs
- Flags stale examples, wrong function signatures, missing new features

## Technical Architecture

- **GitHub Action** (TypeScript) — runs in CI
- **LLM Backend**: OpenAI API (gpt-4o-mini for cost efficiency)
- Users provide their own OpenAI API key as a GitHub secret
- No server infrastructure needed — runs entirely in GitHub Actions

## File Structure
```
docpilot/
├── action.yml           # GitHub Action definition
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts         # Entry point
│   ├── analyzer.ts      # Diff analysis engine
│   ├── changelog.ts     # Changelog generation
│   ├── commenter.ts     # PR comment posting
│   ├── llm.ts           # OpenAI API wrapper
│   └── utils.ts         # Helpers
├── dist/                # Compiled output (committed for Actions)
├── README.md
├── LICENSE
└── .github/
    └── workflows/
        └── test.yml     # Self-test workflow
```

## Pricing Model (Future)
- Open source GitHub Action (free, drives adoption)
- Paid hosted version: $19/repo/mo — no API key needed, better models, analytics
- Team plan: $49/mo for unlimited repos

## Distribution
1. GitHub Marketplace (free Action)
2. Show HN post
3. Dev Twitter / Reddit r/programming
4. Product Hunt launch

## MVP Success Criteria
- Action works on a real repo
- Generates useful doc suggestions (not garbage)
- README is compelling enough to get GitHub stars
- < 3 days to ship v0.1
