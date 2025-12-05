/**
 * Auto-rebalance Scheduler
 *
 * Periodically checks wallets and triggers maintenance actions.
 * Submits real UserOperations when bundler is configured.
 */

import {
  RebalanceTask,
  RebalanceTaskInput,
  TaskStatus,
  TaskAction,
  SchedulerStatus,
  TaskExecutionResult,
  RiskTier,
  DataSource,
} from "./types";
import { getExecutableRecommendedStrategies, DEFAULTS } from "./strategyService";
import {
  submitRebalanceUserOp,
  submitMigrateStrategyUserOp,
  submitSweepDustUserOp,
  USDC_ADDRESS,
} from "./bundler/index";
import {
  checkWalletsForRebalance,
  initChainReader,
  formatUSDC,
  WalletCheckResult,
} from "./chainReader";
import { getRegisteredWallets } from "./server";
import { getDustSources } from "./dustService";
import type { Address } from "viem";

const DEFAULT_TICK_INTERVAL_MS = 30 * 1000;
const DEFAULT_REGISTRY_CHECK_INTERVAL_MS = 10 * 1000;
const DEFAULT_TASK_INTERVAL_MS = 5 * 60 * 1000;
const MAX_ERROR_COUNT = 5;

function isBundlerConfigured(): boolean {
  return !!(
    process.env.PIMLICO_API_KEY &&
    process.env.AUTOMATION_PRIVATE_KEY
  );
}

let bundlerEnabled = false;
const tasks: Map<string, RebalanceTask> = new Map();
let schedulerInterval: NodeJS.Timeout | null = null;
let isRunning = false;
let lastTickAt: Date | undefined;
let tickIntervalMs = DEFAULT_TICK_INTERVAL_MS;
let registryCheckInterval: NodeJS.Timeout | null = null;
let registryCheckIntervalMs = DEFAULT_REGISTRY_CHECK_INTERVAL_MS;
let lastRegistryCheckAt: Date | undefined;
let chainReaderInitialized = false;

function generateTaskId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export function isValidWalletAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

export function isValidTaskAction(action: string): action is TaskAction {
  return action === "rebalance" || action === "flushToChecking" || action === "sweepDust";
}

function formatTime(date: Date): string {
  return date.toISOString().replace("T", " ").substring(0, 19);
}

function log(source: string, message: string): void {
  const timestamp = formatTime(new Date());
  console.log(`[${timestamp}] [scheduler${source ? ":" + source : ""}] ${message}`);
}

export function addTask(input: RebalanceTaskInput): RebalanceTask {
  if (!isValidWalletAddress(input.wallet)) {
    throw new Error(`Invalid wallet address: ${input.wallet}`);
  }

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

export function removeTask(taskId: string): boolean {
  const task = tasks.get(taskId);
  if (!task) return false;

  tasks.delete(taskId);
  log("remove", `Removed task ${taskId} for wallet ${task.wallet}`);
  return true;
}

export function getTask(taskId: string): RebalanceTask | undefined {
  return tasks.get(taskId);
}

export function listTasks(): RebalanceTask[] {
  return Array.from(tasks.values());
}

export function updateTask(taskId: string, updates: Partial<RebalanceTask>): RebalanceTask | undefined {
  const task = tasks.get(taskId);
  if (!task) return undefined;

  const { id, createdAt, ...allowedUpdates } = updates as RebalanceTask;
  Object.assign(task, allowedUpdates);

  return task;
}

export function setTaskEnabled(taskId: string, enabled: boolean): RebalanceTask | undefined {
  const task = tasks.get(taskId);
  if (!task) return undefined;

  task.enabled = enabled;
  if (enabled && task.status === "error") {
    task.status = "idle";
    task.errorCount = 0;
  }

  log("update", `Task ${taskId} ${enabled ? "enabled" : "disabled"}`);
  return task;
}

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

  task.status = "running";
  const startTime = new Date();

  log(logSource, `Executing task ${taskId} for wallet ${task.wallet} (${task.token})`);

  try {
    let strategyId: string;
    let strategyScore: number | undefined;
    let dataSource: DataSource = "mock";

    if (task.preferredStrategyId) {
      strategyId = task.preferredStrategyId;
      log(logSource, `  Using preferred strategy: ${strategyId}`);
    } else {
      const result = await getExecutableRecommendedStrategies(
        task.token,
        task.chainId,
        task.riskTolerance,
        0
      );

      if (!result.bestStrategy) {
        throw new Error(`No executable strategy found for ${task.token} on chain ${task.chainId}`);
      }

      strategyId = result.bestStrategy.id;
      strategyScore = result.bestStrategy.score;
      dataSource = result.metadata.dataSource;

      const adapterAddr = result.bestStrategy.adapterAddress || "none";
      const shortAdapter = adapterAddr.length > 20
        ? `${adapterAddr.substring(0, 16)}...${adapterAddr.substring(adapterAddr.length - 4)}`
        : adapterAddr;

      log(logSource, `  Best strategy: ${strategyId} (APY: ${(result.bestStrategy.apy * 100).toFixed(1)}%)`);
      log(logSource, `  Adapter: ${shortAdapter}`);
    }

    const actionMessage = getActionMessage(task.action, task.wallet, strategyId);
    log(logSource, `  ${actionMessage}`);

    let userOpHash: string | undefined;
    let adapterUsed: string | undefined;

    if (bundlerEnabled) {
      let adapterAddress: Address | undefined;
      if (task.action === "rebalance" || task.action === "flushToChecking") {
        const result = await getExecutableRecommendedStrategies(task.token, task.chainId, task.riskTolerance, 0);
        if (result.bestStrategy?.adapterAddress) {
          adapterAddress = result.bestStrategy.adapterAddress as Address;
        }
      }

      log(logSource, `  Submitting UserOp to CDP bundler...`);

      switch (task.action) {
        case "rebalance":
          userOpHash = await submitRebalanceUserOp(task.wallet as Address, USDC_ADDRESS);
          break;
        case "flushToChecking":
          userOpHash = await submitRebalanceUserOp(task.wallet as Address, USDC_ADDRESS);
          break;
        case "sweepDust":
          // Get dust token addresses for Base mainnet (8453)
          const dustTokenAddresses = getDustSources(8453).map(t => t.tokenAddress as Address);
          if (dustTokenAddresses.length > 0) {
            userOpHash = await submitSweepDustUserOp(task.wallet as Address, dustTokenAddresses);
          } else {
            throw new Error("No dust tokens configured for sweep");
          }
          break;
        default:
          throw new Error(`Unknown action: ${task.action}`);
      }

      adapterUsed = adapterAddress;
      log(logSource, `  UserOp submitted: ${userOpHash}`);
    } else {
      log(logSource, `  [SIMULATION] Bundler not configured`);
      userOpHash = `0xsimulated_${Date.now().toString(16)}`;
    }

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
      adapterUsed,
      message: actionMessage,
      timestamp: startTime,
      userOpHash,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    task.status = "error";
    task.lastRunAt = startTime;
    task.nextRunAt = new Date(Date.now() + task.intervalMs);
    task.errorCount++;
    task.lastError = errorMessage;

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

export async function runTaskNow(taskId: string): Promise<TaskExecutionResult> {
  return executeTask(taskId, true);
}

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

async function checkRegistryWallets(): Promise<void> {
  if (!chainReaderInitialized) return;

  const now = new Date();
  lastRegistryCheckAt = now;

  const wallets = getRegisteredWallets();
  if (wallets.length === 0) return;

  log("registry", `Checking ${wallets.length} registered wallet(s) for rebalance/migration`);

  try {
    const results = await checkWalletsForRebalance(wallets);
    const needsRebalance = results.filter((r) => r.needsRebalance);

    const bestStrategyResult = await getExecutableRecommendedStrategies("USDC", DEFAULTS.CHAIN_ID, DEFAULTS.RISK_TOLERANCE, 0);
    const bestVault = bestStrategyResult.bestStrategy?.vaultAddress as Address | undefined;

    if (needsRebalance.length > 0) {
      log("registry", `Found ${needsRebalance.length} wallet(s) needing rebalance:`);

      for (const result of needsRebalance) {
        const shortWallet = `${result.wallet.substring(0, 6)}...${result.wallet.substring(38)}`;
        log(
          "registry",
          `  ${shortWallet}: balance=${formatUSDC(result.checkingBalance)} USDC, ` +
          `threshold=${formatUSDC(result.threshold)} USDC, ` +
          `surplus=${formatUSDC(result.surplus)} USDC`
        );

        if (bundlerEnabled) {
          try {
            log("registry", `  Submitting rebalance UserOp for ${shortWallet}...`);
            const userOpHash = await submitRebalanceUserOp(result.wallet as Address, USDC_ADDRESS);
            log("registry", `  UserOp submitted: ${userOpHash}`);
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            log("registry", `  ERROR submitting UserOp: ${errorMsg}`);
          }
        } else {
          log("registry", `  [SIMULATION] Would submit rebalance userOp for ${shortWallet}`);
        }
      }
    }

    // Handle wallets with surplus but NO vault (first-time deposits)
    if (bestVault) {
      const needsInitialVault = results.filter((r) => r.surplus > 0n && !r.hasVault);

      if (needsInitialVault.length > 0) {
        log("registry", `Found ${needsInitialVault.length} wallet(s) needing initial vault assignment:`);

        for (const result of needsInitialVault) {
          const shortWallet = `${result.wallet.substring(0, 6)}...${result.wallet.substring(38)}`;
          log(
            "registry",
            `  ${shortWallet}: surplus=${formatUSDC(result.surplus)} USDC, no vault -> assigning ${bestVault.substring(0, 10)}...`
          );

          if (bundlerEnabled) {
            try {
              log("registry", `  Submitting initial migrate UserOp for ${shortWallet}...`);
              const userOpHash = await submitMigrateStrategyUserOp(result.wallet as Address, USDC_ADDRESS, bestVault);
              log("registry", `  UserOp submitted: ${userOpHash}`);
            } catch (error) {
              const errorMsg = error instanceof Error ? error.message : String(error);
              log("registry", `  ERROR submitting initial vault UserOp: ${errorMsg}`);
            }
          } else {
            log("registry", `  [SIMULATION] Would submit initial vault userOp for ${shortWallet}`);
          }
        }
      }
    }

    // Handle wallets that need migration to a better vault
    if (bestVault) {
      const needsMigration = results.filter(
        (r) => r.hasVault && r.currentVault && r.currentVault.toLowerCase() !== bestVault.toLowerCase()
      );

      if (needsMigration.length > 0) {
        log("registry", `Found ${needsMigration.length} wallet(s) needing vault migration to ${bestVault.substring(0, 10)}...`);

        for (const result of needsMigration) {
          const shortWallet = `${result.wallet.substring(0, 6)}...${result.wallet.substring(38)}`;
          log(
            "registry",
            `  ${shortWallet}: current vault ${result.currentVault?.substring(0, 10)}... -> ${bestVault.substring(0, 10)}...`
          );

          if (bundlerEnabled) {
            try {
              log("registry", `  Submitting migrate UserOp for ${shortWallet}...`);
              const userOpHash = await submitMigrateStrategyUserOp(result.wallet as Address, USDC_ADDRESS, bestVault);
              log("registry", `  UserOp submitted: ${userOpHash}`);
            } catch (error) {
              const errorMsg = error instanceof Error ? error.message : String(error);
              log("registry", `  ERROR submitting migration UserOp: ${errorMsg}`);
            }
          } else {
            log("registry", `  [SIMULATION] Would submit migrate userOp for ${shortWallet}`);
          }
        }
      }
    }

    if (needsRebalance.length === 0) {
      log("registry", `All ${wallets.length} wallet(s) balanced (no action needed)`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log("registry", `ERROR checking wallets: ${errorMessage}`);
  }
}

export function startScheduler(options?: {
  tickIntervalMs?: number;
  registryCheckIntervalMs?: number;
  rpcUrl?: string;
}): void {
  if (isRunning) {
    log("start", "Scheduler already running");
    return;
  }

  tickIntervalMs = options?.tickIntervalMs || DEFAULT_TICK_INTERVAL_MS;
  registryCheckIntervalMs = options?.registryCheckIntervalMs || DEFAULT_REGISTRY_CHECK_INTERVAL_MS;
  isRunning = true;

  bundlerEnabled = isBundlerConfigured();

  if (bundlerEnabled) {
    log("start", `Bundler ENABLED - will submit real UserOperations via Pimlico`);
  } else {
    log("start", `WARNING: Bundler NOT configured - running in SIMULATION mode`);
    if (!process.env.PIMLICO_API_KEY) log("start", `  Missing: PIMLICO_API_KEY`);
    if (!process.env.AUTOMATION_PRIVATE_KEY) log("start", `  Missing: AUTOMATION_PRIVATE_KEY`);
  }

  log("start", `Scheduler started (task tick: ${tickIntervalMs / 1000}s, registry check: ${registryCheckIntervalMs / 1000}s)`);

  if (options?.rpcUrl) {
    initChainReader({ rpcUrl: options.rpcUrl });
    chainReaderInitialized = true;
    log("start", "Chain reader initialized for registry wallet checks");
  } else {
    log("start", "No RPC URL provided - registry wallet checks disabled");
  }

  schedulerTick();
  schedulerInterval = setInterval(() => schedulerTick(), tickIntervalMs);

  if (chainReaderInitialized) {
    checkRegistryWallets();
    registryCheckInterval = setInterval(() => checkRegistryWallets(), registryCheckIntervalMs);
  }
}

export function stopScheduler(): void {
  if (!isRunning) {
    log("stop", "Scheduler not running");
    return;
  }

  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }

  if (registryCheckInterval) {
    clearInterval(registryCheckInterval);
    registryCheckInterval = null;
  }

  isRunning = false;
  chainReaderInitialized = false;
  log("stop", "Scheduler stopped");
}

export function getSchedulerStatus(): SchedulerStatus & {
  registryCheckIntervalMs: number;
  lastRegistryCheckAt?: Date;
  chainReaderInitialized: boolean;
} {
  return {
    isRunning,
    bundlerEnabled,
    tickIntervalMs,
    taskCount: tasks.size,
    lastTickAt,
    nextTickAt: lastTickAt ? new Date(lastTickAt.getTime() + tickIntervalMs) : undefined,
    registryCheckIntervalMs,
    lastRegistryCheckAt,
    chainReaderInitialized,
  };
}
