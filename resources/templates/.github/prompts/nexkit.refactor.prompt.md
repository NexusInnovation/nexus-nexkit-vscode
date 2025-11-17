---
description: Safe refactoring workflow with mandatory test coverage verification, before/after validation, and user approval gates.
---

Given the refactoring description provided as an $ARGUMENTS, execute the following comprehensive refactoring workflow:

## Phase 0 (optional): Look for work item reference

1. **IF work item reference is provided**
   - **Fetch work item details**: Use the MCP Azure DevOps tools to fetch work item details for the given work item ID:
   - Call `mcp_azure-devops_wit_get_work_item` with the work item ID and current project
   - Extract: id, title, description, work item type, state, assigned to, acceptance criteria, area path, iteration path
   - Look for attached file to get more information about refactoring details.
   - Read all child and related work items and related work items to gather more context about the refactoring request.
2. **Create or use existing feature branch**
   - If the current branch is not the feature branch then
     Run the script `.specify.specify/scripts/powershell/create-new-feature.ps1 -Json -WorkItemId "$ARGUMENTS"` from repo root and parse its JSON output for BRANCH_NAME. All file paths must be absolute.
   - else
     Use the current branch and set BRANCH_NAME to current branch name

## Phase 1: Analysis and Test Coverage Verification

1. **Analyze the Refactoring Request**

   - Use sequential-thinking to understand the current code structure and refactoring goals
   - Identify the specific code components that need refactoring
   - Understand the motivation: performance, maintainability, readability, design patterns, etc.
   - Assess the scope and complexity of the refactoring
   - Map dependencies and potential impact areas

2. **Mandatory Test Coverage Verification**

   - **CRITICAL**: Examine existing test coverage for all code that will be modified
   - Identify gaps in test coverage that could lead to regression risks
   - Run existing tests to establish baseline functionality
   - **If insufficient test coverage exists:**
     - Create comprehensive unit tests for the code to be refactored
     - Add integration tests for critical workflows
     - Ensure edge cases and error conditions are covered
     - **DO NOT PROCEED** with refactoring until adequate test coverage exists

3. **Current State Analysis**
   - Document the current code structure and architecture
   - Identify code smells, anti-patterns, or technical debt being addressed
   - Map current functionality and behavior that must be preserved
   - Analyze performance characteristics if applicable
   - Document any existing workarounds or special handling

## Phase 2: Refactoring Plan and Before/After Validation

4. **Create Detailed Refactoring Plan**

   - Define the target architecture and structure
   - Break down refactoring into safe, incremental steps
   - Plan for maintaining functionality throughout the process
   - Identify potential risks and mitigation strategies
   - Estimate effort and complexity for each refactoring step

5. **Present Before/After Comparison**

   - **Show current code structure**: Present the existing code that will be modified
   - **Show proposed refactored structure**: Present the planned code after refactoring
   - **Explain changes clearly**:
     - What will change and why
     - What will remain the same
     - How functionality will be preserved
     - What improvements will be achieved
   - **Highlight potential risks** and how they will be mitigated
   - **Show test strategy** for validating the refactoring

6. **Mandatory User Approval Gate**
   - Present the complete before/after analysis
   - **WAIT for explicit user approval before proceeding**
   - Allow user to request modifications to the plan
   - Confirm understanding of scope and approach
   - **DO NOT PROCEED** without clear user consent

## Phase 3: Safe Refactoring Implementation

7. **Gather Context and Documentation**

   - Use Context7 to retrieve up-to-date documentation for any libraries involved
   - Read existing code to understand current patterns and conventions
   - Identify reusable components and established patterns in the codebase
   - Review architectural guidelines and coding standards

8. **Execute Incremental Refactoring**

   - Follow the approved plan step by step
   - Make small, atomic changes that can be easily validated
   - **Run tests after each significant change** to catch regressions early
   - Preserve functionality at each step - no behavior changes
   - Maintain backward compatibility where applicable
   - Add inline documentation for complex refactoring decisions

9. **Continuous Validation During Refactoring**
   - Run full test suite after major refactoring steps
   - Verify no functional regressions have been introduced
   - Check performance impact if relevant
   - Validate that new structure follows established patterns
   - Ensure error handling and edge cases still work correctly

## Phase 4: Final Validation and Quality Assurance

10. **Comprehensive Testing**

    - Run complete test suite to ensure no regressions
    - Execute integration tests for end-to-end validation
    - Test edge cases and error conditions
    - Verify performance characteristics meet expectations
    - Check memory usage and resource consumption if applicable

11. **Code Quality Verification**

    - Verify refactored code follows project style guidelines
    - Check for improved maintainability and readability
    - Ensure proper separation of concerns
    - Validate that design patterns are correctly implemented
    - Review for potential security improvements

12. **Documentation and Knowledge Transfer**
    - Update relevant documentation to reflect structural changes
    - Document any architectural decisions made during refactoring
    - Update inline code comments where necessary
    - Create migration notes if interfaces have changed
    - Update any relevant design documents or architectural diagrams

## Phase 5: Review and Validation

13. **Implementation Review**

    - Compare final result with original refactoring goals
    - Verify all functionality has been preserved
    - Assess the improvement in code quality, maintainability, or performance
    - Check for any unintended side effects or new technical debt

14. **Final Validation with User**

    - Present the completed refactoring with before/after comparison
    - Demonstrate that functionality has been preserved
    - Show improvements achieved (performance, maintainability, etc.)
    - Report test results and coverage metrics
    - Highlight any discoveries or additional improvements made

15. **Next Steps and Recommendations**
    - Suggest any follow-up refactoring opportunities discovered
    - Recommend monitoring for performance or behavior changes
    - Propose additional tests or documentation improvements
    - Identify any related technical debt that could be addressed
    - **IMPORTANT**: Write a clear commit message summarizing the refactoring changes

## Safety Guidelines and Best Practices

- **Check for instruction files in this order**: `.github/copilot-instructions.md`, `copilot-instructions.md`, `.vscode/copilot-instructions.md`, and any language-specific `{language}.instructions.md` files. Follow the guidance in these files when generating code or providing assistan
- **Test-First Approach**: Never refactor code without adequate test coverage
- **Incremental Changes**: Make small, verifiable changes rather than large rewrites
- **Preserve Functionality**: Refactoring should improve structure without changing behavior
- **User Validation**: Always get explicit approval before making changes
- **Continuous Testing**: Run tests frequently during refactoring process
- **Rollback Strategy**: Be prepared to revert changes if issues are discovered
- **Documentation**: Keep documentation in sync with structural changes
- **Ask Questions**: If any part of the change request is unclear, ask clarifying questions **one at the time** before proceeding

## Refactoring-Specific Principles

- **Single Responsibility**: Improve adherence to SOLID principles
- **DRY (Don't Repeat Yourself)**: Eliminate code duplication
- **KISS (Keep It Simple, Stupid)**: Simplify complex logic where possible
- **Composition over Inheritance**: Prefer composition for better flexibility
- **Interface Segregation**: Create focused, specific interfaces
- **Dependency Injection**: Improve testability and loose coupling

## Error Handling

- If test coverage is insufficient, stop and create tests first
- If any tests fail during refactoring, investigate and fix immediately
- If user doesn't approve the plan, revise and present alternatives
- If functional regressions are detected, rollback and reassess
- Provide clear error messages and suggested solutions for any issues

## Success Criteria

The refactoring is considered complete when:

- All existing functionality is preserved (verified by tests)
- Code structure and quality have been improved
- All tests pass (existing and any new ones)
- User has validated the before/after comparison
- Documentation has been updated appropriately
- Performance characteristics are maintained or improved
- Technical debt has been reduced
- Code follows established patterns and conventions

## Red Flags - Stop Refactoring If:

- Test coverage is insufficient and tests cannot be added
- Functional behavior changes unexpectedly
- Performance degrades significantly
- Breaking changes are introduced unintentionally
- User expresses concerns about the proposed changes
- Complexity increases rather than decreases
- New bugs are introduced that didn't exist before

Remember: Refactoring is about improving code structure while preserving functionality. Safety and validation are paramount.
