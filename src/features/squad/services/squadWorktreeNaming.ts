import * as crypto from "crypto";
import * as path from "path";

export interface SquadWorktreeNames {
  slug: string;
  branch: string;
  worktreePath: string;
}

const MAX_SLUG_LENGTH = 50;

export class SquadWorktreeNaming {
  public static slugify(title: string): string {
    const normalized = title
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    const fallback = normalized || "issue";
    if (fallback.length <= MAX_SLUG_LENGTH) {
      return fallback;
    }

    const cut = fallback.slice(0, MAX_SLUG_LENGTH + 1);
    const boundary = cut.lastIndexOf("-");
    const bounded = boundary >= 10 ? cut.slice(0, boundary) : fallback.slice(0, MAX_SLUG_LENGTH);
    return bounded.replace(/-+$/g, "") || "issue";
  }

  public static branchName(issueNumber: number, title: string): string {
    return `squad/${issueNumber}-${this.slugify(title)}`;
  }

  public static branchPrefix(issueNumber: number): string {
    return `squad/${issueNumber}-`;
  }

  public static parseIssueFromBranch(branch: string | null): number | null {
    if (!branch) {
      return null;
    }
    const match = /^squad\/([1-9][0-9]*)-/.exec(branch);
    return match ? Number(match[1]) : null;
  }

  public static worktreePath(mainRoot: string, issueNumber: number, parentDirectory?: string): string {
    const parent = parentDirectory && parentDirectory.trim() ? parentDirectory.trim() : path.dirname(mainRoot);
    return path.join(parent, `${path.basename(mainRoot)}-${issueNumber}`);
  }

  public static mainRootFromCommonDir(commonDir: string): string {
    const normalized = path.resolve(commonDir);
    return path.basename(normalized) === ".git" ? path.dirname(normalized) : path.dirname(normalized);
  }

  public static opaqueId(fsPath: string): string {
    return crypto.createHash("sha256").update(path.normalize(fsPath).toLowerCase()).digest("hex").slice(0, 16);
  }

  public static buildNames(options: {
    mainRoot: string;
    issueNumber: number;
    title: string;
    parentDirectory?: string;
  }): SquadWorktreeNames {
    return {
      slug: this.slugify(options.title),
      branch: this.branchName(options.issueNumber, options.title),
      worktreePath: this.worktreePath(options.mainRoot, options.issueNumber, options.parentDirectory),
    };
  }
}

