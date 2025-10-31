---
description: Refine an Azure DevOps work item by gathering context to create actionable requirements.
---

Given a work item ID as $ARGUMENTS, execute this refinement workflow:

## Phase 1: Gather Context

1. **Fetch Work Item Details**

   - Extract work item ID from $ARGUMENTS (e.g., "12345", "#12345")
   - Set PROJECT to current project (ask if unknown)
   - Call `mcp_azure-devops_wit_get_work_item` with expand: "relations"
   - Extract: ID, Title, Description, Type, State, Assigned To, Acceptance Criteria, Tags, Parent/Child/Related links

2. **Fetch Related Work Items**

   - IF parent exists: Fetch parent for broader context
   - IF siblings exist: Batch fetch siblings to understand parallel work
   - Store as context for refinement

3. **Search Codebase**
   - Use `semantic_search` with work item title and area path keywords
   - Find: Controllers, Services, Repositories, Domain entities, Frontend components, Tests
   - Read key files to identify: architecture patterns, similar features, data models, API structure

## Phase 2: Analyze and Refine

4. **Synthesize Information**

   - Use sequential-thinking to analyze work item, parent, siblings, and code patterns
   - Identify gaps: missing criteria, unclear requirements, dependencies, implementation approaches

5. **Generate Refined Content**
   Create concise refinement including:
   - **Problem Statement**: What needs solving
   - **Requirements**: Functional and technical specifics
   - **Acceptance Criteria**: Testable criteria
   - **Technical Approach**: Implementation based on codebase patterns
   - **Affected Components**: Files/modules to modify
   - **Dependencies**: Other work items or systems

## Phase 3: Create Child Task

6. **Present Refinement**

   - Show: original details, context summary, proposed refinements, affected files
   - **WAIT for user approval**

7. **Create Child Work Item**
   - Call `mcp_azure-devops_wit_create_work_item`:
     - type: "Task"
     - title: "[Brief implementation title]"
     - description: Refined requirements
     - parent: work item ID
     - fields: Acceptance Criteria, Tags ("Refined")
   - Add comment with refinement summary using `mcp_azure-devops_wit_add_work_item_comment`

## Output Format (Concise)

```markdown
## Refinement: #[ID] - [Title]

**Original**: [Brief original description]
**Context**: Parent: [title] | Siblings: [count] related tasks
**Code**: Found [X] files - [key pattern identified]

### Refined Requirements

#### Problem Statement

[Concise problem statement and specifics]

#### Acceptance Criteria

[acceptance criteria]

- [Testable criterion 1]
- [Testable criterion 2]

#### Implementation Plan

[technical approach, affected components, dependencies]

✅ Child task created: #[new ID]
```

## Guidelines

- Keep refinements concise but actionable
- Follow Clean Architecture patterns from copilot-instructions.md
- Use absolute file paths
- Make criteria objectively verifiable
- Preserve original intent
