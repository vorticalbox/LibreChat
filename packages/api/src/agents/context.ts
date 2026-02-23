import type { Agent } from 'librechat-data-provider';
import type { Logger } from 'winston';

/**
 * Agent type with optional tools array that can contain DynamicStructuredTool or string.
 * For context operations, we only require id and instructions, other Agent fields are optional.
 */
export type AgentWithTools = Pick<Agent, 'id'> &
  Partial<Omit<Agent, 'id' | 'tools'>> & {
    tools?: Array<unknown>;
  };

/**
 * Builds final instructions for an agent by combining shared run context and agent-specific context.
 * Order: sharedRunContext -> baseInstructions
 *
 * @param {Object} params
 * @param {string} [params.sharedRunContext] - Run-level context shared by all agents (file context, RAG, memory)
 * @param {string} [params.baseInstructions] - Agent's base instructions
 * @returns {string | undefined} Combined instructions, or undefined if empty
 */
export function buildAgentInstructions({
  sharedRunContext,
  baseInstructions,
}: {
  sharedRunContext?: string;
  baseInstructions?: string;
}): string | undefined {
  const parts = [sharedRunContext, baseInstructions].filter(Boolean);
  const combined = parts.join('\n\n').trim();
  return combined || undefined;
}

/**
 * Applies run context to an agent's configuration.
 * Mutates the agent object in place.
 *
 * @param {Object} params
 * @param {Agent} params.agent - The agent to update
 * @param {string} params.sharedRunContext - Run-level shared context
 * @param {string} [params.agentId] - Agent ID for logging
 * @param {Logger} [params.logger] - Optional logger instance
 * @returns {Promise<void>}
 */
export async function applyContextToAgent({
  agent,
  sharedRunContext,
  agentId,
  logger,
}: {
  agent: AgentWithTools;
  sharedRunContext: string;
  agentId?: string;
  logger?: Logger;
}): Promise<void> {
  const baseInstructions = agent.instructions || '';

  try {
    agent.instructions = buildAgentInstructions({
      sharedRunContext,
      baseInstructions,
    });

    if (agentId && logger) {
      logger.debug(`[AgentContext] Applied context to agent: ${agentId}`);
    }
  } catch (error) {
    agent.instructions = buildAgentInstructions({
      sharedRunContext,
      baseInstructions,
    });

    if (logger) {
      logger.error(
        `[AgentContext] Failed to apply context to agent${agentId ? ` ${agentId}` : ''}, using base instructions only:`,
        error,
      );
    }
  }
}
