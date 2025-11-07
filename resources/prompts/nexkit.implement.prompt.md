---
description: Complete implementation workflow for code changes with planning, development, testing, and review phases.
---

Given the change description provided as an $ARGUMENTS, execute the following comprehensive implementation workflow:

## Phase 0 (optional): Look for work item reference

1. **IF work item reference is provided**
   - **Fetch work item details**: Use the MCP Azure DevOps tools to fetch work item details for the given work item ID:
   - Call `mcp_azure-devops_wit_get_work_item` with the work item ID and current project
   - Extract: id, title, description, work item type, state, assigned to, acceptance criteria, area path, iteration path
   - Look for attached file to get more information about implementation details.
   - Read all child and related work items and related work items to gather more context about the change request.
   - Read all comments to gather additional context.
2. **Create or use existing feature branch**
   - If the current branch is not the feature branch then
     Run the script `.specify.specify/scripts/powershell/create-new-feature.ps1 -Json -WorkItemId "$ARGUMENTS"` from repo root and parse its JSON output for BRANCH_NAME. All file paths must be absolute.
   - else
     Use the current branch and set BRANCH_NAME to current branch name

## Phase 1: Planning and Validation

1. **Analyze the Change Request**

   - Use sequential-thinking to explore multiple possible approaches
   - Consider different implementation strategies and choose the optimal one
   - Identify affected components, files, and dependencies
   - Assess the scope and complexity of the change

2. **Create Implementation Plan**

   - Break down the change into logical, manageable steps
   - Identify files that need to be created, modified, or deleted
   - Map out dependencies between different parts of the implementation
   - Consider potential risks and mitigation strategies
   - Estimate effort and complexity for each step

3. **Present Plan for User Approval**
   - Clearly present the proposed implementation approach
   - Explain the rationale behind chosen strategy
   - Highlight any trade-offs or considerations
   - List all files and components that will be affected
   - **WAIT for explicit user approval before proceeding**

## Phase 2: Implementation

4. **Gather Context and Documentation**

   - Use Context7 to retrieve up-to-date documentation for any libraries involved
   - Read existing code to understand current patterns and conventions
   - Identify reusable components and established patterns in the codebase

5. **Implement the Change**

   - Follow the approved plan step by step
   - Write clean, maintainable code following project conventions
   - Add appropriate error handling and logging
   - Include inline documentation and comments where necessary
   - Ensure backward compatibility where applicable

6. **Create Comprehensive Tests**
   - Write unit tests for new functionality
   - Create integration tests for end-to-end scenarios
   - Add test cases for edge cases and error conditions
   - Ensure test coverage meets project standards
   - Include both positive and negative test scenarios

## Phase 3: Validation and Quality Assurance

7. **Build and Test Execution**

   - Build the entire project to ensure no compilation errors
   - Run all existing tests to ensure no regressions
   - Execute new tests to validate the implementation
   - Run integration tests if applicable
   - Address any test failures or build issues

8. **Code Quality Checks**
   - Verify code follows project style guidelines
   - Check for potential security vulnerabilities
   - Ensure proper error handling and logging
   - Validate performance considerations
   - Review for maintainability and readability

## Phase 4: Review and Recommendations

9. **Implementation Review**

   - Analyze the completed implementation for potential issues
   - Check for code smells or anti-patterns
   - Verify all requirements have been met
   - Assess the solution's scalability and maintainability

10. **Identify Improvements and Next Steps**

    - Detect any potential problems or areas for optimization
    - Suggest additional enhancements or follow-up work
    - Recommend monitoring or observability improvements
    - Propose documentation updates if needed

11. **Present Final Results**
    - Summarize what was implemented
    - Highlight key changes and their impact
    - Report test results and coverage metrics
    - Present any recommendations for future improvements
    - Provide clear next steps if additional work is needed
    - **IMPORTANT** : Write a clear commit message summarizing the changes made

## Guidelines and Best Practices

- **Check for instruction files in this order**: `.github/copilot-instructions.md`, `copilot-instructions.md`, `.vscode/copilot-instructions.md`, and any language-specific `{language}.instructions.md` files. Follow the guidance in these files when generating code or providing assistance.
- **Use Sequential-Thinking**: For complex decisions, use sequential-thinking to explore multiple options and select the best approach
- **Leverage Context7**: Always consult Context7 for the latest documentation of libraries and frameworks being used
- **Maintain Quality**: Ensure all changes meet or exceed existing code quality standards
- **Test-Driven Approach**: Write tests early and ensure comprehensive coverage
- **Documentation**: Update relevant documentation as part of the implementation
- **Communication**: Keep the user informed of progress and any roadblocks encountered
- **Ask Questions**: If any part of the change request is unclear, ask clarifying questions **one at the time** before proceeding

## Error Handling

- If any phase fails, stop and report the issue to the user
- Provide clear error messages and suggested solutions
- Offer alternative approaches if the initial plan encounters problems
- Always validate user input and confirm understanding before proceeding

## Success Criteria

The implementation is considered complete when:

- All planned changes have been successfully implemented
- All tests pass (existing and new)
- Code builds without errors or warnings
- Implementation has been reviewed and potential issues identified
- User has been provided with clear summary and next steps
