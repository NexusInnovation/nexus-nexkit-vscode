---
name: Git Diff Analysis
description: Gather and analyze git changes between two branches
---

# Git Diff Analysis

This skill provides instructions for gathering and summarizing git changes between two branches.

## Usage

Given a `<base>` branch (e.g., `main`) and the current `HEAD`:

### Get the commit log

```
git log <base>...HEAD --oneline
```

### Get the change summary (files modified, added, deleted)

```
git diff <base>...HEAD --stat
```

### Get the full diff

```
git diff <base>...HEAD
```

## Guidelines

- Summarize the key changes (files modified, added, deleted) and understand the intent behind them.
- Group related changes together under a common area or theme.
- Focus on meaningful logical changes — do **not** list every single file.
- If the diff is too large to analyze fully, focus on the most impactful changes and mention that additional minor changes exist.
