import { access, copyFile, mkdir, realpath, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { basename, delimiter, dirname, isAbsolute, relative, resolve } from "node:path";

export class ArtifactStore {
  public readonly root: string;
  public readonly workspaceRoots: string[];
  private readonly allowSymlinks: boolean;

  constructor(
    root = process.env.CREATIVE_MCP_ARTIFACTS ?? "artifacts",
    workspaceRoots = process.env.CREATIVE_MCP_WORKSPACE_ROOTS ?? process.cwd()
  ) {
    this.root = resolve(root);
    this.workspaceRoots = workspaceRoots
      .split(delimiter)
      .filter(Boolean)
      .map((workspaceRoot) => resolve(workspaceRoot));
    this.allowSymlinks = process.env.CREATIVE_MCP_ALLOW_SYMLINKS === "true";
  }

  async writeJson(relativePath: string, value: unknown): Promise<string> {
    return this.writeText(relativePath, `${JSON.stringify(value, null, 2)}\n`);
  }

  async writeText(relativePath: string, value: string): Promise<string> {
    const target = this.resolveSafe(relativePath);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, value, "utf8");
    return target;
  }

  async writeBytes(relativePath: string, value: Uint8Array): Promise<string> {
    const target = this.resolveSafe(relativePath);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, value);
    return target;
  }

  async copyIn(sourcePath: string, relativePath: string): Promise<string> {
    const source = await this.assertReadableFile(sourcePath);
    const target = this.resolveSafe(relativePath || basename(sourcePath));
    await mkdir(dirname(target), { recursive: true });
    await copyFile(source, target);
    return target;
  }

  async assertReadableFile(sourcePath: string): Promise<string> {
    const source = resolve(sourcePath);
    if (!this.isInsideAllowedRoot(source)) {
      throw new Error(
        `Input path is outside CREATIVE_MCP_WORKSPACE_ROOTS: ${sourcePath}. ` +
          `Allowed roots: ${this.workspaceRoots.join(", ")}`
      );
    }
    await access(source, constants.R_OK);
    if (!this.allowSymlinks) {
      const realSource = await realpath(source);
      const realRoots = await Promise.all(this.workspaceRoots.map((workspaceRoot) => realpath(workspaceRoot)));
      if (!this.isInsideAnyRoot(realSource, realRoots)) {
        throw new Error(
          `Input path resolves outside CREATIVE_MCP_WORKSPACE_ROOTS: ${sourcePath}. ` +
            "Set CREATIVE_MCP_ALLOW_SYMLINKS=true only for trusted workspaces."
        );
      }
      return realSource;
    }
    return source;
  }

  private resolveSafe(relativePath: string): string {
    if (isAbsolute(relativePath)) {
      throw new Error("Artifact paths must be relative");
    }
    const target = resolve(this.root, relativePath);
    const rel = relative(this.root, target);
    if (rel.startsWith("..") || isAbsolute(rel)) {
      throw new Error(`Unsafe artifact path: ${relativePath}`);
    }
    return target;
  }

  private isInsideAllowedRoot(path: string): boolean {
    return this.isInsideAnyRoot(path, this.workspaceRoots);
  }

  private isInsideAnyRoot(path: string, roots: string[]): boolean {
    return roots.some((root) => {
      const rel = relative(root, path);
      return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
    });
  }
}
