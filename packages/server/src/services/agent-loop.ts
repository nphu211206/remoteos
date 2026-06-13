/**
 * Agent Loop v2 — Autonomous Multi-Step Execution Engine
 *
 * Features:
 * - Parallel execution of independent actions
 * - Smart error recovery with AI analysis
 * - Feedback loop (result of step N → context for step N+1)
 * - Up to 20 steps with 3 retries per step
 * - Progress tracking and reporting
 */

import { AIService, type MatchedIntent } from './ai-service.js';
import { DeviceService } from './device-service.js';
import { CommandService } from './command-service.js';
import { logger } from '../config/logger.js';

// ─── Types ────────────────────────────────────────────────────────

interface ActionResult {
  step: number;
  actionType: string;
  actionParams: Record<string, unknown>;
  success: boolean;
  output: unknown;
  error?: string;
  executionTimeMs: number;
  recovered?: boolean;
}

export interface AgentLoopResult {
  response: string;
  actions: ActionResult[];
  totalSteps: number;
  success: boolean;
  totalTimeMs: number;
  progress?: string[];
}

export interface AgentLoopOptions {
  maxSteps?: number;
  stepTimeoutMs?: number;
  showProgress?: boolean;
  parallel?: boolean;
}

// ─── Dependency Graph ─────────────────────────────────────────────

/** Check if two actions can run in parallel (no dependency) */
function canRunParallel(a: { type: string; params: Record<string, unknown> }, b: { type: string; params: Record<string, unknown> }): boolean {
  // File operations that depend on each other can't run in parallel
  const writeTypes = ['create_file', 'create_files', 'edit_file', 'file_delete'];
  const readTypes = ['file_read', 'process_file', 'file_search', 'file_info'];

  // If both are write operations on the same file, they conflict
  if (writeTypes.includes(a.type) && writeTypes.includes(b.type)) {
    const pathA = (a.params.filename ?? a.params.path ?? '') as string;
    const pathB = (b.params.filename ?? b.params.path ?? '') as string;
    if (pathA && pathB && pathA === pathB) return false;
  }

  // If one reads and one writes the same file, they conflict
  if (writeTypes.includes(a.type) && readTypes.includes(b.type)) {
    const pathA = (a.params.filename ?? a.params.path ?? '') as string;
    const pathB = (b.params.path ?? '') as string;
    if (pathA && pathB && pathA === pathB) return false;
  }

  // Status/screenshot/process_list are always safe to parallelize
  const safeParallel = ['status', 'screenshot', 'process_list', 'system_info', 'notify', 'get_clipboard'];
  if (safeParallel.includes(a.type) && safeParallel.includes(b.type)) return true;

  // Shell commands are generally independent
  if (a.type === 'shell' && b.type === 'shell') return true;

  // Different types are generally safe
  return a.type !== b.type;
}

// ─── Agent Loop Class ─────────────────────────────────────────────

export class AgentLoop {
  private aiService: AIService;
  private deviceService: DeviceService;
  private commandService: CommandService;

  constructor() {
    this.aiService = new AIService();
    this.deviceService = new DeviceService();
    this.commandService = new CommandService();
  }

  /**
   * Execute an agent loop for a user request
   */
  async execute(
    userId: string,
    message: string,
    deviceId: string,
    options: AgentLoopOptions = {},
  ): Promise<AgentLoopResult> {
    const startTime = Date.now();
    const maxSteps = options.maxSteps ?? 20;
    const stepTimeoutMs = options.stepTimeoutMs ?? 60_000;
    const enableParallel = options.parallel ?? true;

    const actions: ActionResult[] = [];
    const progress: string[] = [];
    let finalResponse = '';

    logger.info({ userId, deviceId, message: message.slice(0, 100) }, 'Agent loop v2 started');

    // Step 1: Ask AI to create a plan with function calls
    const planResponse = await this.aiService.interpretWithUserAI(
      `Thực hiện yêu cầu sau. Sử dụng function calls để thực hiện hành động. Nếu cần nhiều bước, hãy gọi nhiều functions.\n\n"${message}"`,
      userId
    );

    if (!planResponse) {
      return {
        response: 'Xin lỗi, tôi không hiểu yêu cầu. Bạn có thể nói rõ hơn được không?',
        actions: [],
        totalSteps: 0,
        success: false,
        totalTimeMs: Date.now() - startTime,
        progress,
      };
    }

    // Step 2: Extract all actions from the response
    const allActions = this.extractAllActions(planResponse, message);

    if (allActions.length === 0) {
      // No actions — pure conversation
      return {
        response: planResponse.response ?? 'Không có phản hồi.',
        actions: [],
        totalSteps: 0,
        success: true,
        totalTimeMs: Date.now() - startTime,
        progress,
      };
    }

    progress.push(`📋 Plan: ${allActions.length} bước`);

    // Step 3: Execute actions (with parallel execution if enabled)
    const actionsToExecute = allActions.slice(0, maxSteps);

    if (enableParallel && actionsToExecute.length > 1) {
      // Group actions into parallel batches
      const batches = this.createParallelBatches(actionsToExecute);
      let stepCounter = 0;

      for (const batch of batches) {
        if (batch.length === 1) {
          // Single action — execute sequentially
          const action = batch[0]!;
          progress.push(`⚡ Bước ${stepCounter + 1}: ${action.type}`);

          const result = await this.executeWithRetry(
            action, deviceId, stepTimeoutMs, userId, stepCounter, message
          );

          actions.push({
            step: stepCounter,
            actionType: action.type,
            actionParams: action.params ?? {},
            success: result.success,
            output: result.output,
            error: result.error,
            executionTimeMs: result.executionTimeMs,
            recovered: result.recovered,
          });

          if (!result.success) {
            finalResponse = `❌ Bước ${stepCounter + 1} thất bại: ${result.error ?? 'Lỗi không xác định'}`;
            break;
          }

          stepCounter++;
        } else {
          // Multiple actions — execute in parallel
          progress.push(`⚡ Bước ${stepCounter + 1}-${stepCounter + batch.length}: chạy song song ${batch.length} lệnh`);

          const parallelResults = await Promise.allSettled(
            batch.map((action, idx) =>
              this.executeWithRetry(action, deviceId, stepTimeoutMs, userId, stepCounter + idx, message)
            )
          );

          for (let idx = 0; idx < batch.length; idx++) {
            const action = batch[idx]!;
            const result = parallelResults[idx];

            if (result.status === 'fulfilled') {
              actions.push({
                step: stepCounter + idx,
                actionType: action.type,
                actionParams: action.params ?? {},
                success: result.value.success,
                output: result.value.output,
                error: result.value.error,
                executionTimeMs: result.value.executionTimeMs,
                recovered: result.value.recovered,
              });

              if (!result.value.success) {
                finalResponse = `❌ Bước ${stepCounter + idx + 1} thất bại: ${result.value.error ?? 'Lỗi không xác định'}`;
              }
            } else {
              actions.push({
                step: stepCounter + idx,
                actionType: action.type,
                actionParams: action.params ?? {},
                success: false,
                output: null,
                error: result.reason?.message ?? 'Unknown error',
                executionTimeMs: 0,
              });
            }
          }

          stepCounter += batch.length;

          // If any action in the batch failed, stop
          if (actions.some(a => !a.success)) break;
        }
      }
    } else {
      // Sequential execution
      for (let i = 0; i < actionsToExecute.length; i++) {
        const action = actionsToExecute[i]!;
        progress.push(`⚡ Bước ${i + 1}: ${action.type}`);

        const result = await this.executeWithRetry(
          action, deviceId, stepTimeoutMs, userId, i, message
        );

        actions.push({
          step: i,
          actionType: action.type,
          actionParams: action.params ?? {},
          success: result.success,
          output: result.output,
          error: result.error,
          executionTimeMs: result.executionTimeMs,
          recovered: result.recovered,
        });

        if (!result.success) {
          finalResponse = `❌ Bước ${i + 1} thất bại: ${result.error ?? 'Lỗi không xác định'}`;
          break;
        }
      }
    }

    // Step 4: Generate final response
    if (!finalResponse) {
      const successCount = actions.filter(a => a.success).length;
      const totalCount = actions.length;
      const recoveredCount = actions.filter(a => a.recovered).length;

      if (successCount === totalCount) {
        finalResponse = `✅ Đã hoàn thành ${successCount}/${totalCount} bước!`;
        if (recoveredCount > 0) {
          finalResponse += ` (đã tự sửa ${recoveredCount} lỗi)`;
        }
      } else {
        finalResponse = `⚠️ Hoàn thành ${successCount}/${totalCount} bước.`;
      }
    }

    const totalTimeMs = Date.now() - startTime;

    logger.info({
      userId,
      deviceId,
      totalSteps: actions.length,
      successCount: actions.filter(a => a.success).length,
      totalTimeMs,
      parallel: enableParallel,
    }, 'Agent loop v2 completed');

    return {
      response: finalResponse,
      actions,
      totalSteps: actions.length,
      success: actions.every(a => a.success),
      totalTimeMs,
      progress,
    };
  }

  /**
   * Execute an action with retry and smart error recovery
   */
  private async executeWithRetry(
    action: { type: string; params: Record<string, unknown> },
    deviceId: string,
    timeoutMs: number,
    userId: string,
    step: number,
    originalMessage: string,
  ): Promise<{ success: boolean; output: unknown; error?: string; executionTimeMs: number; recovered?: boolean }> {
    const maxRetries = 3;
    const stepStartTime = Date.now();

    const intent: MatchedIntent = {
      type: action.type,
      params: action.params,
      confidence: 0.95,
      source: 'ai',
      originalInput: originalMessage,
    };

    // First attempt
    let result = await this.executeAction(intent, deviceId, timeoutMs, userId);

    if (result.success) {
      return { ...result, executionTimeMs: Date.now() - stepStartTime };
    }

    // Retry with same action
    for (let retry = 0; retry < maxRetries; retry++) {
      logger.info({ step, retry: retry + 1, type: action.type }, 'Retrying failed action');
      result = await this.executeAction(intent, deviceId, timeoutMs, userId);

      if (result.success) {
        return { ...result, executionTimeMs: Date.now() - stepStartTime };
      }
    }

    // Smart Error Recovery — ask AI to analyze and suggest fix
    logger.info({ step, error: result.error, type: action.type }, 'Attempting AI error recovery');

    try {
      const recoveryResult = await this.attemptRecovery(
        action, result.error ?? 'Unknown error', deviceId, timeoutMs, userId, originalMessage
      );

      if (recoveryResult.success) {
        logger.info({ step, recoveryType: recoveryResult.recoveryType }, 'AI recovery succeeded');
        return {
          success: true,
          output: recoveryResult.output,
          error: undefined,
          executionTimeMs: Date.now() - stepStartTime,
          recovered: true,
        };
      }
    } catch (recoveryErr) {
      logger.warn({ step, recoveryErr }, 'AI recovery failed');
    }

    return {
      success: false,
      output: result.output,
      error: result.error,
      executionTimeMs: Date.now() - stepStartTime,
    };
  }

  /**
   * Attempt AI-powered error recovery
   */
  private async attemptRecovery(
    originalAction: { type: string; params: Record<string, unknown> },
    errorMsg: string,
    deviceId: string,
    timeoutMs: number,
    userId: string,
    _originalMessage: string,
  ): Promise<{ success: boolean; output: unknown; recoveryType?: string }> {
    // Ask AI to analyze the error and suggest a fix
    const recoveryPrompt = `The command "${originalAction.type}" failed with error: "${errorMsg}".
Original params: ${JSON.stringify(originalAction.params)}.

Analyze the error and suggest a fix. Try a different approach if needed.
Use function calls to execute the fix.`;

    const recoveryResponse = await this.aiService.interpretWithUserAI(recoveryPrompt, userId);

    if (!recoveryResponse || recoveryResponse.type === 'free_response') {
      return { success: false, output: null };
    }

    // Execute the recovery action
    const recoveryIntent: MatchedIntent = {
      type: recoveryResponse.type,
      params: recoveryResponse.params,
      confidence: 0.8,
      source: 'ai',
      originalInput: recoveryPrompt,
    };

    const result = await this.executeAction(recoveryIntent, deviceId, timeoutMs, userId);

    return {
      success: result.success,
      output: result.output,
      recoveryType: recoveryResponse.type,
    };
  }

  /**
   * Create parallel batches from a list of actions
   */
  private createParallelBatches(
    actions: Array<{ type: string; params: Record<string, unknown> }>
  ): Array<Array<{ type: string; params: Record<string, unknown> }>> {
    const batches: Array<Array<{ type: string; params: Record<string, unknown> }>> = [];
    let currentBatch: Array<{ type: string; params: Record<string, unknown> }> = [];

    for (const action of actions) {
      if (currentBatch.length === 0) {
        currentBatch.push(action);
        continue;
      }

      // Check if this action can run with all actions in current batch
      const canParallel = currentBatch.every(existing => canRunParallel(existing, action));

      if (canParallel) {
        currentBatch.push(action);
      } else {
        batches.push(currentBatch);
        currentBatch = [action];
      }
    }

    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }

    return batches;
  }

  /**
   * Extract all actions from AI response
   */
  private extractAllActions(
    aiResponse: MatchedIntent,
    _originalMessage: string,
  ): Array<{ type: string; params: Record<string, unknown> }> {
    const actions: Array<{ type: string; params: Record<string, unknown> }> = [];

    // Direct type (not free_response)
    if (aiResponse.type !== 'free_response' && aiResponse.type !== 'clarification') {
      actions.push({
        type: aiResponse.type,
        params: aiResponse.params ?? {},
      });
    }

    // Embedded <action> blocks in response
    const responseText = aiResponse.response ?? '';
    const actionRegex = /<action>([\s\S]*?)<\/action>/g;
    let match;

    while ((match = actionRegex.exec(responseText)) !== null) {
      try {
        const actionJson = JSON.parse(match[1]!.trim());
        if (actionJson.type) {
          actions.push({
            type: actionJson.type,
            params: actionJson.params ?? (actionJson.filename ? { filename: actionJson.filename, content: actionJson.content } : {}),
          });
        }
      } catch {
        // Ignore parse errors
      }
    }

    // allIntents
    if (aiResponse.allIntents) {
      for (const intent of aiResponse.allIntents) {
        actions.push({
          type: intent.type,
          params: intent.params ?? {},
        });
      }
    }

    return actions;
  }

  /**
   * Execute a single action
   */
  private async executeAction(
    intent: MatchedIntent,
    deviceId: string,
    timeoutMs: number,
    userId: string,
  ): Promise<{ success: boolean; output: unknown; error?: string }> {
    try {
      // Server-side actions
      if (intent.type === 'create_file' || intent.type === 'create_files') {
        return this.executeServerSideAction(intent);
      }

      // Agent-side actions
      const result = await this.commandService.create(userId, {
        deviceId,
        type: intent.type as any,
        params: intent.params ?? {},
        priority: 'normal',
        timeoutMs,
      });

      if (!result.success) {
        return { success: false, output: null, error: result.error ?? 'Failed to create command' };
      }

      const commandId = result.command?.id;
      if (!commandId) {
        return { success: false, output: null, error: 'No command ID returned' };
      }

      // Poll for result
      const pollStartTime = Date.now();
      while (Date.now() - pollStartTime < timeoutMs) {
        const commandResult = await this.commandService.getById(commandId);
        if (commandResult?.result) {
          return {
            success: commandResult.result.status === 'completed',
            output: commandResult.result.output,
            error: commandResult.result.error?.message,
          };
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      return { success: false, output: null, error: 'Command timed out' };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ err: message, type: intent.type }, 'Action execution failed');
      return { success: false, output: null, error: message };
    }
  }

  /**
   * Execute server-side actions (file creation, etc.)
   */
  private async executeServerSideAction(
    intent: MatchedIntent,
  ): Promise<{ success: boolean; output: unknown; error?: string }> {
    try {
      const { writeFileSync, mkdirSync, existsSync } = await import('node:fs');
      const { join, dirname, isAbsolute } = await import('node:path');

      if (intent.type === 'create_file') {
        const { filename, content } = intent.params as { filename: string; content: string };

        const desktop = join(process.env.USERPROFILE || process.env.HOME || '', 'Desktop');
        const filepath = isAbsolute(filename) ? filename : join(desktop, filename);
        const dir = dirname(filepath);

        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }

        writeFileSync(filepath, content, 'utf-8');
        logger.info({ filepath, size: content.length }, 'File created by Agent Loop');

        return {
          success: true,
          output: { filepath, size: content.length, filename },
        };
      }

      if (intent.type === 'create_files') {
        const { files } = intent.params as { files: Array<{ filename: string; content: string }> };

        const desktop = join(process.env.USERPROFILE || process.env.HOME || '', 'Desktop');
        const created: Array<{ filename: string; filepath: string; size: number }> = [];

        for (const file of files) {
          const filepath = isAbsolute(file.filename) ? file.filename : join(desktop, file.filename);
          const dir = dirname(filepath);

          if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
          }

          writeFileSync(filepath, file.content, 'utf-8');
          created.push({ filename: file.filename, filepath, size: file.content.length });
        }

        return {
          success: true,
          output: { files: created, count: created.length },
        };
      }

      return { success: false, output: null, error: `Unsupported server-side action: ${intent.type}` };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ err: message, type: intent.type }, 'Server-side action failed');
      return { success: false, output: null, error: message };
    }
  }
}
