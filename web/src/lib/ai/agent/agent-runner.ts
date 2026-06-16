/**
 * Agent runtime harness (OB-212, N1).
 *
 * The ONLY place the tool-use/tool-result loop lives. An agent is a structural
 * definition {name, systemPrompt, tools, handlers, maxTurns, model?}; runAgent
 * drives the multi-turn loop, calling the configured provider through the AI
 * service layer (AIService.executeAgentTurn — the AIService mandate; this file
 * never opens its own fetch). It is above the Deterministic Calculation Boundary:
 * handlers read facts and return them; the model reasons; nothing here writes a
 * calculation table.
 *
 * Korean Test: this file carries no domain vocabulary — agent names, tool names,
 * and schemas are supplied by the caller (the agent definition) and are structural.
 */

import { getAIService } from '../ai-service';
import type { AgentToolDefinition, AgentTurnMessage } from '../types';

/** Thrown when an agent exhausts maxTurns without a final text turn (HALT-RUNAWAY).
 *  The route catches this and writes the invocation row as status='failed'. Carries the
 *  partial trajectory + token usage so the failed row stays debuggable (additive). */
export class AgentRunawayError extends Error {
  turns: AgentTurn[];
  turnCount: number;
  tokenUsage: { input: number; output: number };
  constructor(message: string, turns: AgentTurn[] = [], turnCount = 0, tokenUsage: { input: number; output: number } = { input: 0, output: 0 }) {
    super(message);
    this.name = 'AgentRunawayError';
    this.turns = turns;
    this.turnCount = turnCount;
    this.tokenUsage = tokenUsage;
  }
}

/** A turn that cannot be trusted as a clean answer: a refusal, an empty/blocked
 *  turn, a max_tokens truncation mid-tool_use, or a malformed tool_use block. The
 *  route catches this and writes the invocation row as status='failed' — an
 *  above-DCB agent must never return a truncated/refused turn as a diagnosis. Carries
 *  the partial trajectory + token usage (additive) for the failed row. */
export class AgentTurnError extends Error {
  reason: 'refusal' | 'empty' | 'max_tokens' | 'malformed';
  turns: AgentTurn[];
  turnCount: number;
  tokenUsage: { input: number; output: number };
  constructor(
    message: string,
    reason: 'refusal' | 'empty' | 'max_tokens' | 'malformed',
    turns: AgentTurn[] = [],
    turnCount = 0,
    tokenUsage: { input: number; output: number } = { input: 0, output: 0 },
  ) {
    super(message);
    this.name = 'AgentTurnError';
    this.reason = reason;
    this.turns = turns;
    this.turnCount = turnCount;
    this.tokenUsage = tokenUsage;
  }
}

export interface AgentDefinition {
  /** structural agent id, persisted to agent_invocations.agent_name */
  name: string;
  systemPrompt: string;
  tools: AgentToolDefinition[];
  /** structural tool-name -> handler. Handlers are bounded, read-only DB wrappers. */
  handlers: Record<string, (input: Record<string, unknown>) => Promise<unknown>>;
  /** HALT-RUNAWAY guard; the loop throws AgentRunawayError if exceeded. */
  maxTurns: number;
  /** optional model override; default = adapter's resolved model. */
  model?: string;
}

/** One recorded step of the trajectory. outputSummary is BOUNDED (the full tool
 *  result goes to the model, but the persisted trajectory stores a summary so
 *  agent_invocations.tool_calls stays small at scale). */
export interface AgentTurn {
  turn: number;
  tool: string | null;     // null on the final text turn
  input: Record<string, unknown> | null;
  outputSummary: string;
}

export interface AgentRunResult {
  finalText: string;
  turns: AgentTurn[];
  turnCount: number;
  tokenUsage: { input: number; output: number };
}

const MAX_SUMMARY_CHARS = 800;

function boundedSummary(value: unknown): string {
  const s = typeof value === 'string' ? value : safeStringify(value);
  return s.length > MAX_SUMMARY_CHARS
    ? `${s.slice(0, MAX_SUMMARY_CHARS)}…(+${s.length - MAX_SUMMARY_CHARS} chars)`
    : s;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

interface RawToolUseBlock extends Record<string, unknown> {
  type: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

/**
 * Run an agent to completion (a final text turn) or HALT-RUNAWAY.
 * @param def the agent definition (tools + handlers + system prompt + guards)
 * @param initialUserContent the kickoff message (subject refs only — never row payloads)
 */
export async function runAgent(
  def: AgentDefinition,
  initialUserContent: string,
): Promise<AgentRunResult> {
  const ai = getAIService();
  const messages: AgentTurnMessage[] = [{ role: 'user', content: initialUserContent }];
  const turns: AgentTurn[] = [];
  let inputTokens = 0;
  let outputTokens = 0;

  for (let turn = 1; turn <= def.maxTurns; turn++) {
    const resp = await ai.executeAgentTurn({
      system: def.systemPrompt,
      messages,
      tools: def.tools,
      model: def.model,
    });
    inputTokens += resp.tokenUsage.input;
    outputTokens += resp.tokenUsage.output;

    const toolUses = resp.content.filter(
      (b): b is RawToolUseBlock => (b as RawToolUseBlock)?.type === 'tool_use',
    );

    // No tool call -> the model produced its final answer (or refused / was blocked).
    // Branch on stop_reason BEFORE trusting content as a clean answer — a refusal or
    // an empty turn must surface, not masquerade as a successful empty diagnosis.
    if (toolUses.length === 0) {
      if (resp.stopReason === 'refusal') {
        throw new AgentTurnError(`Agent "${def.name}" turn ${turn} was refused (stop_reason=refusal)`, 'refusal', turns, turn, { input: inputTokens, output: outputTokens });
      }
      const finalText = resp.content
        .filter((b) => (b as { type?: string }).type === 'text')
        .map((b) => String((b as { text?: string }).text ?? ''))
        .join('\n')
        .trim();
      if (finalText === '') {
        throw new AgentTurnError(
          `Agent "${def.name}" turn ${turn} produced no text (stop_reason=${resp.stopReason ?? 'unknown'})`,
          'empty',
          turns,
          turn,
          { input: inputTokens, output: outputTokens },
        );
      }
      return { finalText, turns, turnCount: turn, tokenUsage: { input: inputTokens, output: outputTokens } };
    }

    // There ARE tool_use blocks. If the turn hit max_tokens, the tool_use JSON is
    // truncated/partial — executing it (or threading it back) is unsafe. Surface it.
    if (resp.stopReason === 'max_tokens') {
      throw new AgentTurnError(
        `Agent "${def.name}" turn ${turn} truncated at max_tokens mid-tool_use`,
        'max_tokens',
        turns,
        turn,
        { input: inputTokens, output: outputTokens },
      );
    }

    // Thread the assistant turn (full content, so tool_use ids resolve) then the
    // tool_result(s) as the next user turn.
    messages.push({ role: 'assistant', content: resp.content });

    const toolResults: Array<Record<string, unknown>> = [];
    for (const tu of toolUses) {
      // Every tool_use must carry an id, or its tool_result is un-matchable and the
      // next request 400s. Anthropic always sends one; guard defensively.
      if (!tu.id) {
        throw new AgentTurnError(`Agent "${def.name}" turn ${turn} emitted a tool_use without an id`, 'malformed', turns, turn, { input: inputTokens, output: outputTokens });
      }
      const handler = tu.name ? def.handlers[tu.name] : undefined;
      let result: unknown;
      try {
        result = handler
          ? await handler((tu.input ?? {}) as Record<string, unknown>)
          : { error: `no handler registered for tool "${tu.name}"` };
      } catch (e) {
        result = { error: e instanceof Error ? e.message : String(e) };
      }
      toolResults.push({
        type: 'tool_result',
        tool_use_id: tu.id,
        content: typeof result === 'string' ? result : safeStringify(result),
      });
      turns.push({
        turn,
        tool: tu.name ?? null,
        input: (tu.input ?? {}) as Record<string, unknown>,
        outputSummary: boundedSummary(result),
      });
    }
    messages.push({ role: 'user', content: toolResults });
  }

  throw new AgentRunawayError(
    `Agent "${def.name}" exceeded maxTurns=${def.maxTurns} without a final text turn`,
    turns,
    def.maxTurns,
    { input: inputTokens, output: outputTokens },
  );
}
