import * as fs from "fs/promises";
import { IFileSystem } from "./types";

/**
 * Default {@link IFileSystem} backed by Node's promise API.
 */
export class NodeFileSystem implements IFileSystem {
  public async fileExists(fsPath: string): Promise<boolean> {
    try {
      const stats = await fs.stat(fsPath);
      return stats.isFile();
    } catch {
      return false;
    }
  }

  public async readTextFile(fsPath: string): Promise<string> {
    return fs.readFile(fsPath, "utf8");
  }

  public async fileSizeBytes(fsPath: string): Promise<number> {
    const stats = await fs.stat(fsPath);
    return stats.size;
  }

  public async realPath(fsPath: string): Promise<string> {
    return fs.realpath(fsPath);
  }
}
