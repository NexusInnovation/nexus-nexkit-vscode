---
description: Generate intelligent commit messages and commit staged changes
model: GPT-5 mini (copilot)
---

## Quick Commit Workflow

1. **Check git status** - Run `git status` to identify:

   - Staged files (under "Changes to be committed")
   - Unstaged files (under "Changes not staged for commit")
   - Untracked files

2. **Analyze changes** - Run `git diff --cached` (for staged) or `git diff HEAD` (for all changes):

   - Identify change type: feat, fix, refactor, docs, test, chore, style, perf
   - Determine scope: component/module affected
   - Understand what and why

3. **Extract work item context** (if available):

   - Parse branch name for work item ID (e.g., `feature/12345-description`)
   - If found, use `mcp_azure-devops_wit_get_work_item` to get title and description
   - If not found or fails, proceed without work item context

4. **Generate and display commit message** using Conventional Commits format:

   ```
   type(scope): description

   - Key change details

   Work Item: #12345 - Title (if available)
   ```

5. **Commit strategy**:

   - **If staged files exist**: Commit them with `git commit -m "message"` (DO NOT run `git add`)
   - **If no staged files**: Ask user if they want to stage all changes first
   - **If no changes**: Inform user and exit

6. **Display summary**:

   ```
   ✅ Commit Analysis Complete
   📋 Work Item: #12345 - Feature title (if found)
   📝 Commit Message: type(scope): description

   📜 Git Status Analysis:
   - Staged files: N files ready for commit
   - Unstaged files: N files modified but not staged
   - Strategy: Committing staged files only

   🔄 Committing staged changes...
   ✅ Commit successful: abc1234 - type(scope): description

   📊 Summary:
   - Files committed: N staged files
   - Remaining unstaged: N files
   - Tip: Review unstaged changes and stage manually if needed
   ```

**Important**: Respect existing staging - never run `git add` when staged files exist.
