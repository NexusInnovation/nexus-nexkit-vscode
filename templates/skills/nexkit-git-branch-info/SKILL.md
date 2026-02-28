---
name: Git Branch Info
description: Detect the current git branch and list available branches for comparison
---

# Git Branch Info

This skill provides instructions for detecting the current git branch and listing available branches.

## Usage

### Get the current branch

```
git branch --show-current
```

### List all branches sorted by most recent activity

```
git branch -a --sort=-committerdate
```

### Suggest a base branch

After listing branches, suggest the most likely base branch from common defaults (`main`, `develop`, `master`). Let the user confirm or pick a different one.

> **Example:** "Your current branch is `feature/my-feature`. Which base branch should I compare against? (default: `main`)"
