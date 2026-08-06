/**
 * Azure DevOps organization/project resolved for a branch-creation request,
 * along with how it was determined.
 */
export interface ResolvedDevOpsTarget {
  organization: string;
  project?: string;
  resolutionSource: "gitRemote" | "activeConnection" | "pickedConnection";
}
