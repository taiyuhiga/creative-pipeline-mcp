import { randomUUID } from "node:crypto";
import { ToolRegistry } from "./toolRegistry.js";
import type { ToolExecutionContext, ToolResult } from "./types.js";
import { ApprovalRequiredError } from "./approvalPolicy.js";
import { validateToolInput } from "./schemaValidator.js";
import { STRUCTURED_TOOL_ERROR_CODES, structuredToolError } from "./jsonRpcErrors.js";

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
        data: {
          error: structuredToolError(
            STRUCTURED_TOOL_ERROR_CODES.invalidToolInput,
            `Invalid input for ${tool.name}`,
            { tool: tool.name, errors: validation.errors }
          ),
          errors: validation.errors
        }
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
        const structuredError = structuredToolError(
          STRUCTURED_TOOL_ERROR_CODES.approvalRequired,
          `Approval required for ${tool.name}`,
          {
            tool: tool.name,
            risk: error.risk,
            currentPermission: error.permissionLevel,
            approvalToken: request.approvalToken
          }
        );
        const audit = await context.artifactStore.writeJson(
          `approvals/audit/${Date.now()}-${tool.name.replaceAll(".", "_")}.json`,
          {
            schema: "creative.pipeline.approval_audit.v1",
            event: "approval_required",
            tool: tool.name,
            risk: error.risk,
            currentPermission: error.permissionLevel,
            approvalToken: request.approvalToken,
            artifact,
            requestedAt: request.requestedAt
          }
        );
        return {
          ok: false,
          message: `Approval request written for ${tool.name}`,
          artifacts: [artifact, audit],
          data: { ...request, error: structuredError, approval: request, audit }
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
