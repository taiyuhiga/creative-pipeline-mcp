import { ToolRegistry } from "./toolRegistry.js";
import type { ToolExecutionContext, ToolResult } from "./types.js";

export class Router {
  constructor(private readonly registry: ToolRegistry) {}

  async run(
    name: string,
    context: ToolExecutionContext,
    input: Record<string, unknown>
  ): Promise<ToolResult> {
    const tool = this.registry.get(name);
    await context.approvalPolicy.assertAllowed(tool.name, tool.risk);
    context.logger.log("tool.start", { name, input });
    const result = await tool.execute(context, input);
    context.logger.log("tool.finish", { name, ok: result.ok, artifacts: result.artifacts ?? [] });
    return result;
  }
}

