/**
 * Minimal Azure DevOps work item data required to build a branch name.
 */
export interface AzureDevOpsWorkItem {
  id: number;
  type: string;
  title: string;
  organization: string;
}
