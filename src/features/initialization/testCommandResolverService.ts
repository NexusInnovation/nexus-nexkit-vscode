import { ProjectType } from "./projectTypeDetectorService";
import { LoggingService } from "../../shared/services/loggingService";

/**
 * Resolved test command for a project type
 */
export interface TestCommand {
  bash: string;
  powershell: string;
  timeoutSec: number;
}

/**
 * Default test commands per project type
 */
const DEFAULT_TEST_COMMANDS: Record<ProjectType, TestCommand> = {
  nodejs: {
    bash: "npm test",
    powershell: "npm test",
    timeoutSec: 120,
  },
  dotnet: {
    bash: "dotnet test",
    powershell: "dotnet test",
    timeoutSec: 180,
  },
  python: {
    bash: "pytest",
    powershell: "pytest",
    timeoutSec: 120,
  },
  unknown: {
    bash: "echo 'No test command configured for this project type'",
    powershell: "Write-Host 'No test command configured for this project type'",
    timeoutSec: 10,
  },
};

/**
 * Service that resolves the appropriate test command for a given project type.
 * Uses defaults that can be overridden by a workspace-level configuration file.
 */
export class TestCommandResolverService {
  private readonly _logging = LoggingService.getInstance();

  /**
   * Resolve the test command for a given project type.
   * @param projectType The detected project type
   * @returns The test command to execute
   */
  public resolveTestCommand(projectType: ProjectType): TestCommand {
    const command = DEFAULT_TEST_COMMANDS[projectType];

    this._logging.info(`Resolved test command for '${projectType}': ${command.bash}`);
    return command;
  }
}
