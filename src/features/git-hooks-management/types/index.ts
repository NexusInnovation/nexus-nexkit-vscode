/**
 * Git hooks management types and interfaces
 */

export interface GitHookRule {
  type: string;
  parameters: {
    operator: 'regex' | 'starts_with' | 'ends_with' | 'contains';
    pattern: string;
    negate?: boolean;
  };
}

export interface GitHooksRuleset {
  id?: string;
  rules: GitHookRule[];
}

export interface GitHooksStatus {
  isInstalled: boolean;
  isEnabled: boolean;
  rulesLoaded: number;
  lastSync?: Date;
  pythonAvailable: boolean;
  message?: string;
}

export interface GitHooksConfig {
  enabled: boolean;
  autoSync: boolean;
  scope?: string;
}
