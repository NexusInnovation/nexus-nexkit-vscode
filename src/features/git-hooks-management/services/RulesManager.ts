import * as fs from 'fs';
import * as path from 'path';
import { getWorkspaceRoot } from '../../../shared/utils/fileHelper';
import { GitHooksRuleset } from '../types';

/**
 * Manages loading and saving git hooks rulesets locally
 * Handles reading/writing githooks-rulesets.json in the workspace root
 */
export class RulesManager {
  private static readonly RULESET_FILENAME = 'githooks-rulesets.json';

  /**
   * Load ruleset from workspace root
   * Returns empty ruleset if file doesn't exist
   */
  public async loadRuleset(): Promise<GitHooksRuleset> {
    const rulesPath = this.getRulesetPath();
    
    try {
      if (!fs.existsSync(rulesPath)) {
        return { rules: [] };
      }
      
      const content = await fs.promises.readFile(rulesPath, 'utf8');
      const ruleset: GitHooksRuleset = JSON.parse(content);
      return ruleset;
    } catch (error) {
      console.error('Error loading git hooks ruleset:', error);
      return { rules: [] };
    }
  }

  /**
   * Save ruleset to workspace root
   */
  public async saveRuleset(ruleset: GitHooksRuleset): Promise<void> {
    const rulesPath = this.getRulesetPath();
    const workspaceRoot = getWorkspaceRoot();
    
    if (!workspaceRoot) {
      throw new Error('No workspace root found');
    }
    
    // Ensure directory exists
    await fs.promises.mkdir(workspaceRoot, { recursive: true });
    
    // Write ruleset file with pretty formatting
    await fs.promises.writeFile(rulesPath, JSON.stringify(ruleset, null, 2), 'utf8');
  }

  /**
   * Get the full path to the ruleset file
   */
  public getRulesetPath(): string {
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
      throw new Error('No workspace root found');
    }
    return path.join(workspaceRoot, RulesManager.RULESET_FILENAME);
  }

  /**
   * Get the number of rules loaded
   */
  public async getRulesCount(): Promise<number> {
    const ruleset = await this.loadRuleset();
    return ruleset.rules?.length || 0;
  }

  /**
   * Clear all rules
   */
  public async clearRules(): Promise<void> {
    await this.saveRuleset({ rules: [] });
  }
}
