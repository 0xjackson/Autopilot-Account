/**
 * B3: Auto-rebalance Scheduler
 *
 * A lightweight scheduler that periodically checks wallets and triggers
 * maintenance actions like rebalance() or flushToChecking().
 *
 * NOTE: Tasks are stored in-memory and will reset on server restart.
 * TODO: Persist tasks to database or config file for production use.
 */

import {
  RebalanceTask,
  RebalanceTaskInput,
  TaskStatus,
  TaskAction,
  SchedulerStatus,
  TaskExecutionResult,
  RiskTier,
} from "./types";
import { getBestStrategy, getRecommendedStrategies, DEFAULTS } from "./strategyService";

// ============================================================================
// Configuration
// ============================================================================

/** Default interval between scheduler ticks (30 seconds) */
const DEFAULT_TICK_INTERVAL_MS = 30 * 1000;

/** Default interval between task runs (5 minutes) */
const DEFAULT_TASK_INTERVAL_MS = 5 * 60 * 1000;

/** Maximum consecutive errors before disabling a task */
const MAX_ERROR_COUNT = 5;

// ============================================================================
// In-memory storage
// ============================================================================

/** Map of task ID -> RebalanceTask */
const tasks: Map<string, RebalanceTask> = new Map();

/** Scheduler interval handle */
let schedulerInterval: NodeJS.Timeout | null = null;

/** Whether the scheduler is currently running */
let isRunning = false;

/** Timestamp of last scheduler tick */
let lastTickAt: Date | undefined;

/** Current tick interval */
let tickIntervalMs = DEFAULT_TICK_INTERVAL_MS;

// ============================================================================
// Utility functions
// ============================================================================

/**
 * Generate a unique task ID
 */
function generateTaskId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Validate wallet address format (basic check)
 */
export function isValidWalletAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Validate task action
 */
export function isValidTaskAction(action: string): action is TaskAction {
  return action === "rebalance" || action === "flushToChecking" || action === "sweepDust";
}

/**
 * Format timestamp for logging
 */
function formatTime(date: Date): string {
  return date.toISOString().replace("T", " ").substring(0, 19);
}

/**
 * Log a scheduler message with timestamp
 */
function log(source: string, message: string): void {
  const timestamp = formatTime(new Date());
  console.log(`[${timestamp}] [scheduler${source ? ":" + source : ""}] ${message}`);
}

// ============================================================================
// Task management
// ============================================================================

/**
 * Add a new rebalance task
 */
export function addTask(input: RebalanceTaskInput): RebalanceTask {
  // Validate wallet address
  if (!isValidWalletAddress(input.wallet)) {
    throw new Error(`Invalid wallet address: ${input.wallet}`);
  }

  // Validate action if provided
  if (input.action && !isValidTaskAction(input.action)) {
    throw new Error(`Invalid action: ${input.action}. Must be one of: rebalance, flushToChecking, sweepDust`);
  }

  const now = new Date();
  const intervalMs = input.intervalMs || DEFAULT_TASK_INTERVAL_MS;

  const task: RebalanceTask = {
    id: generateTaskId(),
    wallet: input.wallet.toLowerCase(),
    token: (input.token || DEFAULTS.TOKEN).toUpperCase(),
    chainId: input.chainId || DEFAULTS.CHAIN_ID,
    preferredStrategyId: input.preferredStrategyId,
    riskTolerance: input.riskTolerance || DEFAULTS.RISK_TOLERANCE,
    intervalMs,
    action: input.action || "rebalance",
    status: "idle",
    errorCount: 0,
    createdAt: now,
    nextRunAt: new Date(now.getTime() + intervalMs),
    enabled: true,
  };

  tasks.set(task.id, task);
  log("add", `Added task ${task.id} for wallet ${task.wallet} (${task.token}, ${task.action})`);

  return task;
}

/**
 * Remove a task by ID
 */
export function removeTask(taskId: string): boolean {
  const task = tasks.get(taskId);
  if (!task) {
    return false;
  }

  tasks.delete(taskId);
  log("remove", `Removed task ${taskId} for wallet ${task.wallet}`);
  return true;
}

/**
 * Get a task by ID
 */
export function getTask(taskId: string): RebalanceTask | undefined {
  return tasks.get(taskId);
}

/**
 * List all tasks
 */
export function listTasks(): RebalanceTask[] {
  return Array.from(tasks.values());
}

/**
 * Update a task's properties
 */
export function updateTask(taskId: string, updates: Partial<RebalanceTask>): RebalanceTask | undefined {
  const task = tasks.get(taskId);
  if (!task) {
    return undefined;
  }

  // Apply updates (excluding id and createdAt)
  const { id, createdAt, ...allowedUpdates } = updates as RebalanceTask;
  Object.assign(task, allowedUpdates);

  return task;
}

/**
 * Enable or disable a task
 */
export function setTaskEnabled(taskId: string, enabled: boolean): RebalanceTask | undefined {
  const task = tasks.get(taskId);
  if (!task) {
    return undefined;
  }

  task.enabled = enabled;
  if (enabled && task.status === "error") {
    task.status = "idle";
    task.errorCount = 0;
  }

  log("update", `Task ${taskId} ${enabled ? "enabled" : "disabled"}`);
  return task;
}

// ============================================================================
// Task execution
// ============================================================================

/**
 * Execute a single task
 *
 * This function:
 * 1. Fetches the best strategy for the task's token/chain
 * 2. Logs what action would be taken
 * 3. Updates task status and timestamps
 *
 * TODO (B5): Actually compose and submit userOp via bundler
 */
export async function executeTask(
  taskId: string,
  isManual: boolean = false
): Promise<TaskExecutionResult> {
  const task = tasks.get(taskId);
  const logSource = isManual ? "manual" : "auto";

  if (!task) {
    return {
      taskId,
      success: false,
      message: `Task not found: ${taskId}`,
      timestamp: new Date(),
    };
  }

  // Mark task as running
  task.status = "running";
  const startTime = new Date();

  log(logSource, `Executing task ${taskId} for wallet ${task.wallet} (${task.token})`);

  try {
    // Get the best strategy for this task
    let strategyId: string;
    let strategyScore: number | undefined;

    if (task.preferredStrategyId) {
      // Use preferred strategy if specified
      strategyId = task.preferredStrategyId;
      log(logSource, `  Using preferred strategy: ${strategyId}`);
    } else {
      // Find best strategy based on risk tolerance
      const result = getRecommendedStrategies(
        task.token,
        task.chainId,
        task.riskTolerance,
        0 // No minimum APY filter
      );

      if (!result.bestStrategy) {
        throw new Error(`No suitable strategy found for ${task.token} on chain ${task.chainId}`);
      }

      strategyId = result.bestStrategy.id;
      strategyScore = result.bestStrategy.score;
      log(
        logSource,
        `  Best strategy: ${strategyId} (score: ${strategyScore.toFixed(2)}, APY: ${(result.bestStrategy.apy * 100).toFixed(1)}%)`
      );
    }

    // Simulate the action
    // TODO (B5): Replace with actual bundler integration
    // const userOp = await composeBundlerUserOp(task.wallet, task.action, strategyId);
    // const userOpHash = await submitUserOp(userOp);

    const actionMessage = getActionMessage(task.action, task.wallet, strategyId);
    log(logSource, `  ${actionMessage}`);
    log(logSource, `  [SIMULATED] Would submit userOp for ${task.action} here`);

    // Update task status
    task.status = "completed";
    task.lastRunAt = startTime;
    task.nextRunAt = new Date(Date.now() + task.intervalMs);
    task.errorCount = 0;
    task.lastError = undefined;

    return {
      taskId,
      success: true,
      strategyUsed: strategyId,
      strategyScore,
      message: actionMessage,
      timestamp: startTime,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Update task with error
    task.status = "error";
    task.lastRunAt = startTime;
    task.nextRunAt = new Date(Date.now() + task.intervalMs);
    task.errorCount++;
    task.lastError = errorMessage;

    // Disable task if too many errors
    if (task.errorCount >= MAX_ERROR_COUNT) {
      task.enabled = false;
      log(logSource, `  Task ${taskId} disabled after ${MAX_ERROR_COUNT} consecutive errors`);
    }

    log(logSource, `  ERROR: ${errorMessage}`);

    return {
      taskId,
      success: false,
      message: `Error: ${errorMessage}`,
      timestamp: startTime,
    };
  }
}

/**
 * Generate a human-readable action message
 */
function getActionMessage(action: TaskAction, wallet: string, strategyId: string): string {
  const shortWallet = `${wallet.substring(0, 6)}...${wallet.substring(38)}`;

  switch (action) {
    case "rebalance":
      return `Wallet ${shortWallet} -> rebalance to strategy ${strategyId}`;
    case "flushToChecking":
      return `Wallet ${shortWallet} -> flush yield to checking balance`;
    case "sweepDust":
      return `Wallet ${shortWallet} -> sweep dust tokens and compound`;
    default:
      return `Wallet ${shortWallet} -> ${action} with strategy ${strategyId}`;
  }
}

/**
 * Force-run a task immediately (manual trigger)
 */
export async function runTaskNow(taskId: string): Promise<TaskExecutionResult> {
  return executeTask(taskId, true);
}

// ============================================================================
// Scheduler loop
// ============================================================================

/**
 * Main scheduler tick - checks all tasks and runs those that are due
 */
async function schedulerTick(): Promise<void> {
  const now = new Date();
  lastTickAt = now;

  const enabledTasks = Array.from(tasks.values()).filter((t) => t.enabled);
  const dueTasks = enabledTasks.filter(
    (t) => t.status !== "running" && t.nextRunAt && t.nextRunAt <= now
  );

  if (dueTasks.length > 0) {
    log("tick", `Processing ${dueTasks.length} due task(s) out of ${enabledTasks.length} enabled`);

    for (const task of dueTasks) {
      await executeTask(task.id, false);
    }
  }
}

/**
 * Start the scheduler
 */
export function startScheduler(intervalMs?: number): void {
  if (isRunning) {
    log("start", "Scheduler already running");
    return;
  }

  tickIntervalMs = intervalMs || DEFAULT_TICK_INTERVAL_MS;
  isRunning = true;

  log("start", `Scheduler started (tick interval: ${tickIntervalMs / 1000}s)`);

  // Run first tick immediately
  schedulerTick();

  // Set up interval for subsequent ticks
  schedulerInterval = setInterval(() => {
    schedulerTick();
  }, tickIntervalMs);
}

/**
 * Stop the scheduler
 */
export function stopScheduler(): void {
  if (!isRunning) {
    log("stop", "Scheduler not running");
    return;
  }

  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }

  isRunning = false;
  log("stop", "Scheduler stopped");
}

/**
 * Get scheduler status
 */
export function getSchedulerStatus(): SchedulerStatus {
  return {
    isRunning,
    tickIntervalMs,
    taskCount: tasks.size,
    lastTickAt,
    nextTickAt: lastTickAt ? new Date(lastTickAt.getTime() + tickIntervalMs) : undefined,
  };
}

// ============================================================================
// TODO: Future bundler integration (B5)
// ============================================================================

// TODO (B5): Implement bundler integration
// async function composeBundlerUserOp(
//   wallet: string,
//   action: TaskAction,
//   strategyId: string
// ): Promise<UserOperation> {
//   // Compose the userOp calldata based on action type
//   // For rebalance: call AutoYieldModule.rebalance()
//   // For flushToChecking: call AutoYieldModule.flushToChecking(token)
//   // For sweepDust: call AutoYieldModule.sweepDustAndCompound()
//   throw new Error("Not implemented");
// }

// TODO (B5): Submit userOp to bundler
// async function submitUserOp(userOp: UserOperation): Promise<string> {
//   // Send to Pimlico or other bundler
//   // Return userOpHash
//   throw new Error("Not implemented");
// }

// TODO: Persist tasks to database
// async function persistTasks(): Promise<void> {
//   // Save tasks to database or file
// }

// TODO: Load tasks from database on startup
// async function loadTasks(): Promise<void> {
//   // Load tasks from database or file
// }
