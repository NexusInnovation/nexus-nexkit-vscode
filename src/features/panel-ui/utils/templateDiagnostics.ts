import { AITemplateFileType, OperationMode, RepositoryTemplatesMap } from "../../ai-template-files/models/aiTemplateFile";

export interface ApmAgentDiagnostics {
  apmRepositoryCount: number;
  apmAgentCount: number;
  apmRepositories: Array<{
    name: string;
    modes?: OperationMode[];
    agentCount: number;
    countsByType: Record<AITemplateFileType, number>;
  }>;
}

function getCountsByType(repo: RepositoryTemplatesMap): Record<AITemplateFileType, number> {
  return {
    agents: repo.types.agents.length,
    prompts: repo.types.prompts.length,
    skills: repo.types.skills.length,
    instructions: repo.types.instructions.length,
    chatmodes: repo.types.chatmodes.length,
  };
}

/**
 * Returns diagnostics for why APM "Agent Templates" may be empty.
 *
 * Webview filtering rules require explicit APM opt-in:
 * a repository is visible in APM only when its `modes` includes `OperationMode.APM`.
 */
export function getApmAgentDiagnostics(repositories: RepositoryTemplatesMap[]): ApmAgentDiagnostics {
  const apmRepositories = repositories
    .filter((repo) => repo.modes?.includes(OperationMode.APM) ?? false)
    .map((repo) => {
      const countsByType = getCountsByType(repo);
      return {
        name: repo.name,
        modes: repo.modes,
        agentCount: countsByType.agents,
        countsByType,
      };
    });

  const apmAgentCount = apmRepositories.reduce((sum, repo) => sum + repo.agentCount, 0);

  return {
    apmRepositoryCount: apmRepositories.length,
    apmAgentCount,
    apmRepositories,
  };
}
