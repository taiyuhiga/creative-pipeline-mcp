import { randomUUID } from "node:crypto";
import { ToolRegistry } from "./toolRegistry.js";
import type { ToolExecutionContext, ToolResult } from "./types.js";
import { ApprovalRequiredError } from "./approvalPolicy.js";
import { validateToolInput } from "./schemaValidator.js";

export class Router {
  constructor(private readonly registry: ToolRegistry) {}

  async run(
    name: string,
    context: ToolExecutionContext,
    input: Record<string, unknown>
  ): Promise<ToolResult> {
    const tool = this.registry.get(name);
    const validation = validateToolInput(tool, input);
    if (!validation.ok) {
      return {
        ok: false,
        message: `Invalid input for ${tool.name}: ${validation.errors.join("; ")}`,
        data: { errors: validation.errors }
      };
    }
    try {
      await context.approvalPolicy.assertAllowed(tool.name, tool.risk);
    } catch (error) {
      if (error instanceof ApprovalRequiredError) {
        const request = {
          action: error.action,
          risk: error.risk,
          currentPermission: error.permissionLevel,
          requestedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          approvalToken: randomUUID(),
          artifactRoot: context.artifactStore.root,
          workspaceRoots: context.artifactStore.workspaceRoots ?? [],
          expectedOutputs: {
            artifacts: "tool-dependent",
            sideEffects: error.risk
          },
          input
        };
        const artifact = await context.artifactStore.writeJson(
          `approvals/pending/${Date.now()}-${tool.name.replaceAll(".", "_")}.json`,
          request
        );
        return {
          ok: false,
          message: `Approval request written for ${tool.name}`,
          artifacts: [artifact],
          data: request
        };
      }
      throw error;
    }
    context.logger.log("tool.start", { name, input });
    const result = await tool.execute(context, input);
    context.logger.log("tool.finish", { name, ok: result.ok, artifacts: result.artifacts ?? [] });
    return result;
  }
}
