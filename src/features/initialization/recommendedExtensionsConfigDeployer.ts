import * as fs from "fs";
import * as path from "path";
import { fileExists } from "../../shared/utils/fileHelper";

/**
 * Template for VS Code extensions recommendations
 */
const EXTENSIONS_TEMPLATE = {
  recommendations: ["ms-vscode.vscode-typescript-next", "ms-vscode.vscode-json", "esbenp.prettier-vscode"],
};

/**
 * Service for deploying recommended VS Code extensions to workspace
 */
export class RecommendedExtensionsConfigDeployer {
  /**
   * Deploy VS Code extensions recommendations to the target workspace root
   * NON-DESTRUCTIVE: Merges with existing extensions, avoiding duplicates
   * @param targetRoot Root directory of the workspace
   */
  public async deployVscodeExtensions(targetRoot: string): Promise<void> {
    const targetPath = path.join(targetRoot, ".vscode", "extensions.json");
    const targetDir = path.dirname(targetPath);

    await fs.promises.mkdir(targetDir, { recursive: true });

    const templateExtensions = EXTENSIONS_TEMPLATE;

    // Merge with existing extensions if they exist
    let extensions = templateExtensions;
    if (await fileExists(targetPath)) {
      const existingContent = await fs.promises.readFile(targetPath, "utf8");
      try {
        const existingExtensions = JSON.parse(existingContent);

        // Merge recommendations, avoiding duplicates
        const combinedRecommendations = new Set([
          ...(templateExtensions.recommendations || []),
          ...(existingExtensions.recommendations || []),
        ]);

        extensions = {
          ...existingExtensions,
          recommendations: Array.from(combinedRecommendations),
        };
      } catch (error) {
        // If existing extensions are invalid JSON, log warning but use template
        console.warn("Existing .vscode/extensions.json is invalid JSON. Using template extensions.", error);
      }
    }

    await fs.promises.writeFile(targetPath, JSON.stringify(extensions, null, 2), "utf8");
  }
}
