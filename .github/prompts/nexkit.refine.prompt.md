---
description: Refine an Azure DevOps work item by gathering context from parent, siblings, and codebase to create detailed, actionable requirements.
---

Given a work item ID or reference as $ARGUMENTS, execute the following work item refinement workflow:

## Phase 1: Fetch Work Item Details

1. **Parse Work Item Reference**
   - Extract work item ID from $ARGUMENTS (e.g., "12345", "#12345", "PBI 12345")
   - Set PROJECT to current working project (or ask if unknown and write it somewhere to remember)
   - **IMPORTANT**: If no workitem is provided, ask the user to provide one and use that going forward.

2. **Fetch Primary Work Item**
   - Call `mcp_azure-devops_wit_get_work_item` with:
     * id: extracted work item ID
     * project: PROJECT
     * expand: "relations" (to get parent and child links)
   - Extract and store:
     * ID, Title, Description, Work Item Type, State
     * Assigned To, Area Path, Iteration Path
     * Acceptance Criteria (if present)
     * Tags
     * Parent link (if exists)
     * Child links (if exist)
     * Related links (siblings)

## Phase 2: Gather Contextual Information

3. **Fetch Parent Work Item (if exists)**
   - IF parent link found in relations:
     * Extract parent work item ID from relation URL
     * Call `mcp_azure-devops_wit_get_work_item` for parent
     * Extract: Title, Description, Acceptance Criteria
     * Store as PARENT_CONTEXT

4. **Fetch Sibling Work Items (if exist)**
   - IF parent has other children OR related links exist:
     * Extract all sibling work item IDs
     * Call `mcp_azure-devops_wit_get_work_items_batch_by_ids` with sibling IDs
     * Extract: ID, Title, State, Work Item Type for each
     * Store as SIBLINGS_CONTEXT

5. **Search Related Code**
   - Use `semantic_search` to find relevant code based on:
     * Work item title keywords
     * Feature area from Area Path
     * Domain concepts from description
   - Search patterns:
     * Controllers, Services, Repositories matching feature area
     * Domain entities mentioned in description
     * Frontend components if UI-related
     * Tests related to the feature

6. **Analyze Existing Implementation**
   - IF related code files found:
     * Read key files to understand:
       - Current architecture patterns
       - Existing similar features
       - Data models and contracts
       - API endpoints structure
     * Store as CODE_CONTEXT

## Phase 3: Analyze and Refine

7. **Use Sequential Thinking to Analyze**
   - Synthesize information from:
     * Original work item description
     * Parent work item context
     * Sibling work items progress/scope
     * Existing codebase patterns
   - Identify:
     * Gaps in current description
     * Missing acceptance criteria
     * Unclear technical requirements
     * Dependencies not mentioned
     * Potential implementation approaches

8. **Generate Refined Content**
   - Create enhanced work item description including:
     * **Clear Problem Statement**: What needs to be solved
     * **Context**: Parent feature, related work items
     * **Detailed Requirements**: Functional and technical
     * **Acceptance Criteria**: Specific, testable criteria
     * **Technical Approach**: Recommended implementation based on codebase analysis
     * **Affected Components**: List of files/modules to modify
     * **Dependencies**: Other work items or external systems
     * **Testing Strategy**: Unit, integration, E2E requirements

9. **Create Structured Updates**
   - Prepare update payload with:
     * Enhanced Description (HTML or Markdown format)
     * Refined Acceptance Criteria
     * Tags for discoverability
     * Updated Area Path if more specific area identified
     * Updated Iteration if not set

## Phase 4: Create Refinement Work Item

10. **Present Refinement to User**
    - Display:
      * Original work item details
      * Gathered context summary (parent, siblings, code)
      * Proposed refined description
      * Proposed acceptance criteria
      * Proposed technical approach
      * List of affected files/components
    - Explain rationale for each refinement
    - **WAIT for explicit user approval before updating**

11. **Create a child Work Item in Azure DevOps**
    - IF user approves:
      * Call `mcp_azure-devops_wit_create_work_item` with:
        - project: PROJECT
        - type: "Task"
        - title: "Implement customer search feature"
        - description: "Create a search feature for customers"
        - parent: work item ID
          * `/fields/Microsoft.VSTS.Common.AcceptanceCriteria` with criteria
          * `/fields/System.Tags` to add "Refined" tag
      * Confirm update successful

12. **Add Refinement Comment**
    - Call `mcp_azure-devops_wit_add_work_item_comment` with:
      * workItemId: work item ID
      * project: PROJECT
      * comment: Summary of refinement including:
        - Context sources used (parent, siblings, code files)
        - Key improvements made
        - Recommended next steps
      * format: "markdown"

## Phase 5: Generate Artifacts (Optional)

13. **Create Implementation Artifacts**
    - IF user requests artifacts:
      * Generate technical specification document
      * Create task breakdown
      * List affected files with change descriptions
      * Provide code snippets for key patterns to follow

## Error Handling

- **Work Item Not Found**: Verify ID and project name, suggest search
- **Insufficient Permissions**: Report required permissions for read/update
- **No Context Available**: Proceed with refinement using work item data only
- **API Errors**: Retry with exponential backoff, report persistent failures
- **Work item of type Improvement not available**: Propose user to choose another type and persist the selection in your instruction file

## Best Practices

- **Preserve Original Intent**: Don't change the core requirement
- **Use Project Conventions**: Follow Clean Architecture patterns from copilot-instructions.md
- **Be Specific**: Avoid vague descriptions, provide concrete details
- **Link to Code**: Reference specific files, classes, methods when relevant
- **Test-Focused**: Always include clear testing requirements
- **Measurable Criteria**: Acceptance criteria must be objectively verifiable

## Example Workflow

```
User: "Refine work item #12345"

1. Fetch PBI #12345: "Add customer search feature"
2. Fetch parent Epic #12000: "Customer Management Portal"
3. Fetch siblings: #12346 (customer list), #12347 (customer details)
4. Search code: Find CustomerController, CustomerService, ICustomerRepository
5. Analyze: Existing pattern uses MediatR commands, EF Core repos
6. Generate refinement:
   - Add specific search criteria (name, email, account number)
   - Include pagination requirements
   - Specify response format matching existing patterns
   - Add acceptance criteria for performance (<500ms)
   - List files to modify: CustomerController.cs, CustomerQueries.cs, etc.
7. Present to user → user approves
8. Create child work item with refined content
9. Add comment documenting refinement process
```

## Output Format

Present refinement results in this structure:

```markdown
## Work Item Task: REFINEMENT - [ID] - [Title]

### Original Details
- **Type**: [Work Item Type]
- **State**: [State]
- **Assigned To**: [Person]
- **Iteration**: [Iteration]

### Context Gathered
- **Parent**: [Parent Title and Key Requirements]
- **Siblings**: [List of related work items and their state]
- **Related Code**: [Files analyzed and patterns identified]

### Proposed Refinements

#### Enhanced Description
[Refined description with problem statement, context, requirements]

#### Acceptance Criteria
1. [Specific, testable criterion]
2. [Another criterion]
...

#### Technical Approach
[Recommended implementation based on codebase analysis]

#### Affected Components
- `[File path]`: [What needs to change]
- `[File path]`: [What needs to change]

#### Dependencies
- [Other work items]
- [External systems]

### Update Status
✅ Work item updated successfully
✅ Comment added with refinement details
```

Use absolute file paths for all code references to enable quick navigation.
