---
name: Git Work Item Extraction
description: Extract work item or issue IDs from branch names and commit messages
---

# Git Work Item Extraction

This skill provides instructions for extracting work item or issue references from git context.

## Supported patterns

| Platform      | Pattern        | Example        |
|---------------|----------------|----------------|
| Azure DevOps  | `AB#<number>`  | `AB#12345`     |
| GitHub        | `#<number>`    | `#123`         |

## Where to look

1. **Branch name** — e.g., `feature/AB#12345-add-login`
2. **Commit messages** — scan `git log` output for patterns above

## Usage

Extract references using the branch name and commit log:

```
git branch --show-current
git log <base>...HEAD --oneline
```

If a work item or issue ID is found, include it in the output for traceability. If none is found, note `N/A`.
