# Team Task Breakdown

This document explains what each team member needs to build, how the pieces connect, and how to mock dependencies that don't exist yet.

---

## How Everything Connects

```
USER CLICKS "CREATE WALLET"
         |
         v
[Frontend: Logan's createSmartWallet()]
         |
         |-- 1. Fetches session key from backend (Robby's API call)
         |-- 2. Calls factory contract (Logan's viem code)
         |-- 3. Gets new wallet address back
         |
         v
[Frontend: Robby's AutopilotContext]
         |
         |-- Saves wallet address to localStorage
         |-- Provides wallet address to all components
         |-- Polls for balances (later)
         |
         v
[User can now use dashboard, send money, etc.]
         |
         v
[Backend: Bryce's scheduler detects rebalance opportunity]
         |
         |-- Calls getBestVault() from yieldAggregator
         |-- Builds UserOp for rebalance/migrate
         |-- Signs with session key
         |-- Submits to CDP bundler
         |
         v
[User's wallet automatically moves funds to better yield]
```

---

## Jackson (Contracts) - The Foundation

> **STATUS: ✅ DEPLOYED TO BASE MAINNET (Dec 3, 2024)**
>
> See `contracts/DEPLOYMENTS.md` for all addresses.

### Deployed Contract Addresses

| Contract | Address | Status |
|----------|---------|--------|
| **AutoYieldModule** | `0xdC5ec0628ff1c0063A2d2B13B3FbBD9431aE4a10` | ✅ Verified |
| **MorphoAdapter** | `0x33fD350a1ecE1239B880B3b3f91eb39407A7eDf9` | ✅ Verified |
| **AutopilotFactory** | `0xa508485E1F6990255B17063C5368BC02eACffa6f` | ⚠️ Needs Fix |

### What's Working

- ✅ AutoYieldModule responds correctly (`isModuleType(EXECUTOR) = true`)
- ✅ MorphoAdapter points to correct vault (Moonwell Flagship USDC)
- ✅ AutopilotFactory configured with correct module/adapter/threshold
- ✅ Fork tests pass (16/16) against real Morpho vaults
- ✅ Unit tests pass (17/17)

### Known Issue

⚠️ **Factory wallet creation is broken** - `factory.getAddress()` reverts when predicting wallet addresses. Root cause: `_buildInitData()` format doesn't match what ZeroDev Kernel Factory v3.1 expects.

**Next step:** Debug the Kernel Factory integration and redeploy AutopilotFactory.

### What Was Built

| Contract | File | Description |
|----------|------|-------------|
| IYieldAdapter | `src/interfaces/IYieldAdapter.sol` | Simplified interface (1 adapter = 1 vault) |
| MockYieldVault | `src/mocks/MockYieldVault.sol` | Test vault with `accrueYield()` |
| MorphoAdapter | `src/adapters/MorphoAdapter.sol` | Wraps ERC-4626 Morpho vaults, holds shares internally |
| AutoYieldModule | `src/AutoYieldModule.sol` | ERC-7579 executor with `rebalance()`, `migrateStrategy()`, `executeWithAutoYield()`, `flushToChecking()` |
| AutopilotFactory | `src/AutopilotFactory.sol` | Deploys Kernel wallets with module pre-installed |

**Dust sweeping:** Not implemented (stretch goal). Core flow works first.

---

## Bryce (Backend) - The Automation Engine

Your job is to make the backend actually submit transactions instead of simulating them.

### Task 1: Generate the Global Session Key

Run this script once and save the output:

```typescript
// Run with: npx ts-node scripts/generateSessionKey.ts

import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const privateKey = generatePrivateKey();
const account = privateKeyToAccount(privateKey);

console.log("=== SESSION KEY GENERATED ===");
console.log("");
console.log("Add this to backend/.env:");
console.log(`AUTOMATION_PRIVATE_KEY=${privateKey}`);
console.log("");
console.log("Send this to Jackson to hardcode in AutopilotFactory.sol:");
console.log(`AUTOMATION_PUBLIC_ADDRESS=${account.address}`);
console.log("");
console.log("Add this to backend/.env for the frontend to fetch:");
console.log(`AUTOMATION_PUBLIC_ADDRESS=${account.address}`);
```

**Why this matters:** This key is how the backend signs automation transactions. Every wallet deployed by the factory will trust this key to call rebalance/migrateStrategy. The key is restricted - it cannot transfer funds or change settings, only optimize yield.

### Task 2: Set Up CDP Bundler/Paymaster

1. Go to https://portal.cdp.coinbase.com
2. Create account or sign in
3. Navigate to Paymaster section
4. Get your endpoint URL (it handles both bundling AND gas sponsorship)
5. Add to `.env`:

```env
CDP_BUNDLER_URL=https://api.developer.coinbase.com/rpc/v1/base/your-api-key-here
```

6. Later (after Jackson deploys): Add contract addresses to the allowlist in CDP dashboard

### Task 3: Add Session Key Endpoint

Add this to `server.ts`:

```typescript
/**
 * GET /automation-key
 * Returns the public address of the automation session key.
 * Frontend needs this to pass to the factory during wallet creation.
 */
app.get("/automation-key", (_req: Request, res: Response) => {
  const publicAddress = process.env.AUTOMATION_PUBLIC_ADDRESS;

  if (!publicAddress) {
    return res.status(500).json({
      error: "Automation key not configured"
    });
  }

  return res.json({
    address: publicAddress,
    // These are the functions this key is authorized to call
    permissions: ["rebalance", "migrateStrategy", "sweepDustAndCompound"]
  });
});
```

### Task 4: Filter Strategies to Morpho-Only for Execution

We only built the Morpho adapter, so the scheduler should only pick Morpho vaults. Update `strategyService.ts` or create a helper:

```typescript
/**
 * Get strategies that can actually be executed (have deployed adapters)
 * For MVP, this is Morpho only
 */
export function getExecutableStrategies(
  token: string,
  chainId: number
): Strategy[] {
  const allStrategies = getStrategiesForToken(token, chainId);
  return allStrategies.filter(s => s.protocolName === "Morpho");
}
```

Use this in the scheduler instead of the full list.

### Task 5: Create bundler.ts

Create `backend/src/bundler.ts`:

```typescript
/**
 * Bundler Service
 *
 * Builds and submits UserOperations for automation tasks.
 * Uses ZeroDev SDK with CDP Bundler/Paymaster.
 */

import { createKernelAccountClient } from "@zerodev/sdk";
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator";
import { KERNEL_V3_1 } from "@zerodev/sdk/constants";
import { http, createPublicClient, encodeFunctionData, type Hex, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";

// =============================================================================
// Configuration (from environment)
// =============================================================================

const CDP_BUNDLER_URL = process.env.CDP_BUNDLER_URL!;
const AUTOMATION_PRIVATE_KEY = process.env.AUTOMATION_PRIVATE_KEY as Hex;

// Contract addresses - Jackson will provide these after deployment
const AUTO_YIELD_MODULE_ADDRESS = (process.env.AUTO_YIELD_MODULE_ADDRESS ||
  "0x1111111111111111111111111111111111111111") as Address;

// USDC on Base
const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address;

// =============================================================================
// ABI Fragments
// =============================================================================

const AUTO_YIELD_MODULE_ABI = [
  {
    name: "rebalance",
    type: "function",
    inputs: [{ name: "token", type: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "migrateStrategy",
    type: "function",
    inputs: [
      { name: "token", type: "address" },
      { name: "newAdapter", type: "address" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "sweepDustAndCompound",
    type: "function",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

// =============================================================================
// Session Key Signing (Jackson may need to adjust this)
// =============================================================================

/**
 * Sign a UserOp with the automation session key
 *
 * TODO: Jackson - verify this works with Kernel's session key validation
 * The session key should only be valid for rebalance/migrateStrategy/sweepDust
 */
async function signWithSessionKey(userOp: any): Promise<any> {
  const signer = privateKeyToAccount(AUTOMATION_PRIVATE_KEY);
  // TODO: Implement actual signing logic based on Kernel's requirements
  // This is a placeholder - the actual implementation depends on how
  // Kernel validates session keys
  console.log("[bundler] Signing with session key:", signer.address);
  return userOp;
}

// =============================================================================
// Client Setup
// =============================================================================

const publicClient = createPublicClient({
  chain: base,
  transport: http("https://mainnet.base.org"),
});

/**
 * Create a Kernel account client for a specific wallet
 */
async function createAutomationClient(walletAddress: Address) {
  const signer = privateKeyToAccount(AUTOMATION_PRIVATE_KEY);

  const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    signer,
    kernelVersion: KERNEL_V3_1,
  });

  const kernelClient = await createKernelAccountClient({
    account: walletAddress,
    chain: base,
    bundlerTransport: http(CDP_BUNDLER_URL),
    // CDP endpoint handles both bundling and paymaster
  });

  return kernelClient;
}

// =============================================================================
// UserOp Submission Functions
// =============================================================================

/**
 * Submit a rebalance UserOp
 * Moves excess checking balance into yield
 */
export async function submitRebalanceUserOp(
  walletAddress: Address,
  tokenAddress: Address = USDC_ADDRESS
): Promise<Hex> {
  console.log(`[bundler] Building rebalance UserOp for ${walletAddress}`);

  const client = await createAutomationClient(walletAddress);

  const callData = encodeFunctionData({
    abi: AUTO_YIELD_MODULE_ABI,
    functionName: "rebalance",
    args: [tokenAddress],
  });

  const userOpHash = await client.sendUserOperation({
    callData: {
      to: AUTO_YIELD_MODULE_ADDRESS,
      data: callData,
      value: 0n,
    },
  });

  console.log(`[bundler] Submitted rebalance UserOp: ${userOpHash}`);

  const receipt = await client.waitForUserOperationReceipt({ hash: userOpHash });
  console.log(`[bundler] Confirmed in tx: ${receipt.receipt.transactionHash}`);

  return userOpHash;
}

/**
 * Submit a migrateStrategy UserOp
 * Moves funds from current vault to a better one
 */
export async function submitMigrateStrategyUserOp(
  walletAddress: Address,
  tokenAddress: Address,
  newAdapterAddress: Address
): Promise<Hex> {
  console.log(`[bundler] Building migrateStrategy UserOp for ${walletAddress}`);
  console.log(`[bundler] Migrating to adapter: ${newAdapterAddress}`);

  const client = await createAutomationClient(walletAddress);

  const callData = encodeFunctionData({
    abi: AUTO_YIELD_MODULE_ABI,
    functionName: "migrateStrategy",
    args: [tokenAddress, newAdapterAddress],
  });

  const userOpHash = await client.sendUserOperation({
    callData: {
      to: AUTO_YIELD_MODULE_ADDRESS,
      data: callData,
      value: 0n,
    },
  });

  console.log(`[bundler] Submitted migrateStrategy UserOp: ${userOpHash}`);

  const receipt = await client.waitForUserOperationReceipt({ hash: userOpHash });
  console.log(`[bundler] Confirmed in tx: ${receipt.receipt.transactionHash}`);

  return userOpHash;
}

/**
 * Submit a sweepDustAndCompound UserOp
 * Swaps dust tokens to USDC and deposits into yield
 */
export async function submitSweepDustUserOp(
  walletAddress: Address
): Promise<Hex> {
  console.log(`[bundler] Building sweepDust UserOp for ${walletAddress}`);

  const client = await createAutomationClient(walletAddress);

  const callData = encodeFunctionData({
    abi: AUTO_YIELD_MODULE_ABI,
    functionName: "sweepDustAndCompound",
    args: [],
  });

  const userOpHash = await client.sendUserOperation({
    callData: {
      to: AUTO_YIELD_MODULE_ADDRESS,
      data: callData,
      value: 0n,
    },
  });

  console.log(`[bundler] Submitted sweepDust UserOp: ${userOpHash}`);

  const receipt = await client.waitForUserOperationReceipt({ hash: userOpHash });
  console.log(`[bundler] Confirmed in tx: ${receipt.receipt.transactionHash}`);

  return userOpHash;
}
```

Install dependencies:

```bash
cd backend
npm install @zerodev/sdk @zerodev/ecdsa-validator viem permissionless
```

### Task 6: Update Scheduler to Use Real Bundler

In `scheduler.ts`, find the `executeTask` function (around line 214). Replace the simulation with real calls:

```typescript
// Add at top of file
import {
  submitRebalanceUserOp,
  submitMigrateStrategyUserOp,
  submitSweepDustUserOp
} from "./bundler";
import { getBestVault } from "./yieldAggregator";

// In executeTask, replace the simulation block (around line 267-273) with:

try {
  let userOpHash: string;

  switch (task.action) {
    case "rebalance":
      userOpHash = await submitRebalanceUserOp(
        task.wallet as `0x${string}`
      );
      break;

    case "migrateStrategy":
      // Get best Morpho vault
      const result = await getBestVault({
        assetSymbol: task.token,
        chainId: task.chainId,
        minTvlUsd: 100000,
      });

      if (!result.vault) {
        throw new Error("No suitable vault found");
      }

      // Only use Morpho vaults
      if (result.vault.source !== "morpho") {
        throw new Error("Best vault is not Morpho - skipping");
      }

      userOpHash = await submitMigrateStrategyUserOp(
        task.wallet as `0x${string}`,
        "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC
        result.vault.address as `0x${string}`
      );
      break;

    case "sweepDust":
      userOpHash = await submitSweepDustUserOp(
        task.wallet as `0x${string}`
      );
      break;

    default:
      throw new Error(`Unknown action: ${task.action}`);
  }

  log(logSource, `  UserOp submitted: ${userOpHash}`);

  // ... rest of success handling
} catch (error) {
  // ... error handling
}
```

---

## Logan (Frontend) - Wallet Creation Flow

Your job is to build the function that actually creates a smart wallet by calling the factory contract.

### What You're Building

When a user clicks "Create Wallet", your code:
1. Gets the session key address from the backend
2. Calls the factory contract
3. Returns the new wallet address

### The File Structure

PR 10 already has scaffolding in `lib/services/wallet.ts`. You need to implement the real logic.

### Task 1: Update constants.ts

After PR 10 is merged, update `frontend/lib/constants.ts`:

```typescript
import { type Address } from "viem";

export const CONTRACTS = {
  // Factory address - Jackson will provide after deployment
  // For now, use a placeholder
  FACTORY: (process.env.NEXT_PUBLIC_FACTORY_ADDRESS ||
    "0x0000000000000000000000000000000000000000") as Address,

  // AutoYieldModule - Jackson will provide
  MODULE: (process.env.NEXT_PUBLIC_MODULE_ADDRESS ||
    "0x0000000000000000000000000000000000000000") as Address,

  // USDC on Base
  USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address,
} as const;

// Backend API URL
export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

// Factory ABI - just the functions we need
// Jackson will provide the full ABI, but this is the shape:
export const FACTORY_ABI = [
  {
    name: "createAccount",
    type: "function",
    inputs: [
      { name: "owner", type: "address" },
      { name: "salt", type: "bytes32" },
    ],
    outputs: [
      { name: "account", type: "address" },
    ],
    stateMutability: "nonpayable",
  },
  {
    name: "getAddress",
    type: "function",
    inputs: [
      { name: "owner", type: "address" },
      { name: "salt", type: "bytes32" },
    ],
    outputs: [
      { name: "", type: "address" },
    ],
    stateMutability: "view",
  },
] as const;
```

### Task 2: Implement wallet.ts

Update `frontend/lib/services/wallet.ts`:

```typescript
import { type Address, createPublicClient, http, keccak256, toBytes } from "viem";
import { baseSepolia } from "viem/chains"; // Use base for mainnet
import { CONTRACTS, FACTORY_ABI, API_URL } from "../constants";

// =============================================================================
// Types
// =============================================================================

export interface CreateWalletResponse {
  smartAccountAddress: Address;
  transactionHash: string;
}

export interface CreateWalletConfig {
  owner: Address;
}

// =============================================================================
// Viem Client
// =============================================================================

const publicClient = createPublicClient({
  chain: baseSepolia, // Change to `base` for mainnet
  transport: http(),
});

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Generate a deterministic salt from the owner address
 * This ensures the same owner always gets the same wallet address
 */
function generateSalt(owner: Address): `0x${string}` {
  return keccak256(toBytes(owner));
}

/**
 * Fetch the automation session key from the backend
 */
async function getAutomationKey(): Promise<Address> {
  try {
    const response = await fetch(`${API_URL}/automation-key`);
    if (!response.ok) {
      throw new Error("Failed to fetch automation key");
    }
    const data = await response.json();
    return data.address as Address;
  } catch (error) {
    console.warn("Could not fetch automation key, using mock:", error);
    // Mock address for development when backend isn't running
    return "0x1234567890123456789012345678901234567890" as Address;
  }
}

// =============================================================================
// Main Functions
// =============================================================================

/**
 * Check if a smart account already exists for an owner
 */
export async function getExistingSmartAccount(
  owner: Address
): Promise<Address | null> {
  try {
    const salt = generateSalt(owner);

    // Get the counterfactual address
    const predictedAddress = await publicClient.readContract({
      address: CONTRACTS.FACTORY,
      abi: FACTORY_ABI,
      functionName: "getAddress",
      args: [owner, salt],
    });

    // Check if code exists at that address
    const code = await publicClient.getBytecode({ address: predictedAddress });

    if (code && code !== "0x") {
      return predictedAddress;
    }

    return null;
  } catch (error) {
    console.error("Error checking existing account:", error);
    return null;
  }
}

/**
 * Create a new Autopilot smart wallet
 *
 * This function is called after the user signs with their EOA.
 * It calls the factory contract to deploy a new Kernel wallet
 * with the AutoYieldModule pre-installed.
 */
export async function createSmartWallet(
  config: CreateWalletConfig
): Promise<CreateWalletResponse> {
  const { owner } = config;

  // Step 1: Get the automation key (for now this is mocked)
  const automationKey = await getAutomationKey();
  console.log("[wallet] Using automation key:", automationKey);

  // Step 2: Generate salt
  const salt = generateSalt(owner);
  console.log("[wallet] Generated salt:", salt);

  // Step 3: Check if factory is deployed (is address non-zero?)
  if (CONTRACTS.FACTORY === "0x0000000000000000000000000000000000000000") {
    console.warn("[wallet] Factory not deployed yet, returning mock response");

    // Return a mock response for development
    // The "address" is deterministic based on owner so it's consistent
    const mockAddress = `0x${owner.slice(2, 10).padEnd(40, "0")}` as Address;

    // Save to localStorage
    localStorage.setItem("autopilotWalletAddress", mockAddress);
    localStorage.setItem("autopilotWalletOwner", owner);

    return {
      smartAccountAddress: mockAddress,
      transactionHash: `0x${"0".repeat(64)}`,
    };
  }

  // Step 4: Actually call the factory
  // This requires the user to sign a transaction
  // We use wagmi's writeContract in the component, not here
  // This function is called AFTER the transaction is submitted

  throw new Error(
    "Real factory deployment not implemented yet. " +
    "This will use wagmi's useWriteContract hook in the CreateWallet component."
  );
}

/**
 * Get the counterfactual address for an owner
 * Does not deploy, just computes what the address would be
 */
export async function getSmartAccountAddress(owner: Address): Promise<Address> {
  if (CONTRACTS.FACTORY === "0x0000000000000000000000000000000000000000") {
    // Mock: return deterministic address
    return `0x${owner.slice(2, 10).padEnd(40, "0")}` as Address;
  }

  const salt = generateSalt(owner);

  return await publicClient.readContract({
    address: CONTRACTS.FACTORY,
    abi: FACTORY_ABI,
    functionName: "getAddress",
    args: [owner, salt],
  });
}

/**
 * Load saved wallet from localStorage
 */
export function getSavedWallet(): { address: Address; owner: Address } | null {
  const address = localStorage.getItem("autopilotWalletAddress");
  const owner = localStorage.getItem("autopilotWalletOwner");

  if (address && owner) {
    return {
      address: address as Address,
      owner: owner as Address,
    };
  }

  return null;
}

/**
 * Save wallet to localStorage
 */
export function saveWallet(address: Address, owner: Address): void {
  localStorage.setItem("autopilotWalletAddress", address);
  localStorage.setItem("autopilotWalletOwner", owner);
}

/**
 * Clear saved wallet from localStorage
 */
export function clearSavedWallet(): void {
  localStorage.removeItem("autopilotWalletAddress");
  localStorage.removeItem("autopilotWalletOwner");
}
```

### Task 3: Update CreateWallet Component

The CreateWallet component needs to call the factory. Update `frontend/components/CreateWallet.tsx` to use wagmi's `useWriteContract`:

```typescript
"use client";

import { useState } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { keccak256, toBytes } from "viem";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CONTRACTS, FACTORY_ABI } from "@/lib/constants";
import { saveWallet, getSmartAccountAddress } from "@/lib/services/wallet";

export function CreateWallet() {
  const { address: ownerAddress, isConnected } = useAccount();
  const [predictedAddress, setPredictedAddress] = useState<string | null>(null);

  const { writeContract, data: hash, isPending, error } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  // Generate salt from owner address
  const salt = ownerAddress ? keccak256(toBytes(ownerAddress)) : null;

  // Predict the wallet address
  const predictAddress = async () => {
    if (!ownerAddress) return;
    const predicted = await getSmartAccountAddress(ownerAddress);
    setPredictedAddress(predicted);
  };

  // Create the wallet
  const handleCreate = () => {
    if (!ownerAddress || !salt) return;

    // If factory isn't deployed, use mock flow
    if (CONTRACTS.FACTORY === "0x0000000000000000000000000000000000000000") {
      // Mock: just save a fake address
      const mockAddress = `0x${ownerAddress.slice(2, 10).padEnd(40, "0")}`;
      saveWallet(mockAddress as `0x${string}`, ownerAddress);
      window.location.href = "/dashboard";
      return;
    }

    // Real factory call
    writeContract({
      address: CONTRACTS.FACTORY,
      abi: FACTORY_ABI,
      functionName: "createAccount",
      args: [ownerAddress, salt],
    });
  };

  // When transaction confirms, save the wallet and redirect
  if (isSuccess && hash && ownerAddress) {
    // Get the created address and save it
    getSmartAccountAddress(ownerAddress).then((address) => {
      saveWallet(address, ownerAddress);
      window.location.href = "/dashboard";
    });
  }

  if (!isConnected) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Connect Wallet</CardTitle>
          <CardDescription>
            Connect your wallet to create an Autopilot account
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Create Autopilot Wallet</CardTitle>
        <CardDescription>
          Deploy your smart wallet on Base with auto-yield enabled
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-sm text-gray-400">
          <p>Owner: {ownerAddress?.slice(0, 6)}...{ownerAddress?.slice(-4)}</p>
          {predictedAddress && (
            <p>Predicted address: {predictedAddress.slice(0, 6)}...{predictedAddress.slice(-4)}</p>
          )}
        </div>

        <Button
          onClick={handleCreate}
          disabled={isPending || isConfirming}
          className="w-full"
        >
          {isPending ? "Waiting for signature..." :
           isConfirming ? "Creating wallet..." :
           "Create Wallet"}
        </Button>

        {error && (
          <p className="text-red-400 text-sm">{error.message}</p>
        )}
      </CardContent>
    </Card>
  );
}
```

---

## Robby (Frontend) - State Management & UX

Your job is to build the React context that holds wallet state and provides it to all components.

### Task 1: Create AutopilotContext

Create `frontend/contexts/AutopilotContext.tsx`:

```typescript
"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { type Address } from "viem";
import { getSavedWallet, clearSavedWallet } from "@/lib/services/wallet";
import { API_URL } from "@/lib/constants";

// =============================================================================
// Types
// =============================================================================

interface AutopilotState {
  // Wallet addresses
  ownerAddress: Address | null;        // The EOA that owns this wallet
  walletAddress: Address | null;       // The smart wallet address

  // Balances (in human-readable format, e.g., "100.50")
  checkingBalance: string | null;      // USDC available for spending
  yieldBalance: string | null;         // USDC in yield strategy
  totalBalance: string | null;         // checking + yield

  // Current strategy info
  currentStrategy: {
    name: string;
    apy: number;        // e.g., 0.065 for 6.5%
    protocol: string;   // "Morpho", "Aave", etc.
  } | null;

  // Loading states
  isLoading: boolean;
  isPolling: boolean;

  // Error state
  error: string | null;
}

interface AutopilotContextValue extends AutopilotState {
  // Actions
  loadWallet: () => void;
  refreshBalances: () => Promise<void>;
  disconnectWallet: () => void;
  setWalletAddress: (address: Address, owner: Address) => void;
}

// =============================================================================
// Context
// =============================================================================

const AutopilotContext = createContext<AutopilotContextValue | null>(null);

// =============================================================================
// Provider
// =============================================================================

interface AutopilotProviderProps {
  children: ReactNode;
}

export function AutopilotProvider({ children }: AutopilotProviderProps) {
  const [state, setState] = useState<AutopilotState>({
    ownerAddress: null,
    walletAddress: null,
    checkingBalance: null,
    yieldBalance: null,
    totalBalance: null,
    currentStrategy: null,
    isLoading: true,
    isPolling: false,
    error: null,
  });

  // Load wallet from localStorage on mount
  const loadWallet = useCallback(() => {
    const saved = getSavedWallet();
    if (saved) {
      setState(prev => ({
        ...prev,
        walletAddress: saved.address,
        ownerAddress: saved.owner,
        isLoading: false,
      }));
    } else {
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, []);

  // Set wallet address (called after creation)
  const setWalletAddress = useCallback((address: Address, owner: Address) => {
    setState(prev => ({
      ...prev,
      walletAddress: address,
      ownerAddress: owner,
    }));
  }, []);

  // Disconnect wallet
  const disconnectWallet = useCallback(() => {
    clearSavedWallet();
    setState({
      ownerAddress: null,
      walletAddress: null,
      checkingBalance: null,
      yieldBalance: null,
      totalBalance: null,
      currentStrategy: null,
      isLoading: false,
      isPolling: false,
      error: null,
    });
  }, []);

  // Refresh balances from chain/backend
  const refreshBalances = useCallback(async () => {
    if (!state.walletAddress) return;

    setState(prev => ({ ...prev, isPolling: true, error: null }));

    try {
      // TODO: Implement real balance fetching
      // For now, use mock data

      // In the real implementation:
      // 1. Read USDC balance from chain: publicClient.readContract(...)
      // 2. Read yield balance from adapter: adapter.totalValue()
      // 3. Fetch current strategy from backend: GET /recommend

      // Mock data for development
      const mockChecking = "150.00";
      const mockYield = "850.00";
      const mockTotal = "1000.00";

      // Fetch current best strategy from backend
      let strategy = null;
      try {
        const response = await fetch(`${API_URL}/recommend?token=USDC&chainId=8453`);
        if (response.ok) {
          const data = await response.json();
          strategy = {
            name: data.strategy?.name || "Morpho USDC",
            apy: data.strategy?.apy || 0.065,
            protocol: data.strategy?.protocolName || "Morpho",
          };
        }
      } catch (e) {
        console.warn("Could not fetch strategy:", e);
        strategy = {
          name: "Morpho USDC Vault",
          apy: 0.065,
          protocol: "Morpho",
        };
      }

      setState(prev => ({
        ...prev,
        checkingBalance: mockChecking,
        yieldBalance: mockYield,
        totalBalance: mockTotal,
        currentStrategy: strategy,
        isPolling: false,
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        isPolling: false,
        error: error instanceof Error ? error.message : "Failed to fetch balances",
      }));
    }
  }, [state.walletAddress]);

  // Load wallet on mount
  useEffect(() => {
    loadWallet();
  }, [loadWallet]);

  // Poll for balances every 15 seconds when wallet is connected
  useEffect(() => {
    if (!state.walletAddress) return;

    // Initial fetch
    refreshBalances();

    // Set up polling
    const interval = setInterval(refreshBalances, 15000);

    return () => clearInterval(interval);
  }, [state.walletAddress, refreshBalances]);

  const value: AutopilotContextValue = {
    ...state,
    loadWallet,
    refreshBalances,
    disconnectWallet,
    setWalletAddress,
  };

  return (
    <AutopilotContext.Provider value={value}>
      {children}
    </AutopilotContext.Provider>
  );
}

// =============================================================================
// Hook
// =============================================================================

export function useAutopilot(): AutopilotContextValue {
  const context = useContext(AutopilotContext);
  if (!context) {
    throw new Error("useAutopilot must be used within an AutopilotProvider");
  }
  return context;
}
```

### Task 2: Add Provider to Layout

Update `frontend/app/layout.tsx` to include the provider:

```typescript
import { AutopilotProvider } from "@/contexts/AutopilotContext";
import { WalletProvider } from "@/components/WalletProvider";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <WalletProvider>
          <AutopilotProvider>
            {/* Navigation, etc. */}
            {children}
          </AutopilotProvider>
        </WalletProvider>
      </body>
    </html>
  );
}
```

### Task 3: Create Toast/Notification System

Create `frontend/components/ui/toast.tsx`:

```typescript
"use client";

import { useState, useEffect, createContext, useContext, ReactNode } from "react";

type ToastType = "success" | "error" | "info" | "loading";

interface Toast {
  id: string;
  type: ToastType;
  message: string;
  txHash?: string;
}

interface ToastContextValue {
  toasts: Toast[];
  showToast: (type: ToastType, message: string, txHash?: string) => string;
  hideToast: (id: string) => void;
  updateToast: (id: string, type: ToastType, message: string, txHash?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = (type: ToastType, message: string, txHash?: string): string => {
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => [...prev, { id, type, message, txHash }]);

    // Auto-hide after 5 seconds (except loading)
    if (type !== "loading") {
      setTimeout(() => hideToast(id), 5000);
    }

    return id;
  };

  const hideToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const updateToast = (id: string, type: ToastType, message: string, txHash?: string) => {
    setToasts(prev => prev.map(t =>
      t.id === id ? { ...t, type, message, txHash } : t
    ));

    // Auto-hide after update (except loading)
    if (type !== "loading") {
      setTimeout(() => hideToast(id), 5000);
    }
  };

  return (
    <ToastContext.Provider value={{ toasts, showToast, hideToast, updateToast }}>
      {children}
      <ToastContainer toasts={toasts} onClose={hideToast} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within ToastProvider");
  return context;
}

// Toast container component
function ToastContainer({
  toasts,
  onClose
}: {
  toasts: Toast[];
  onClose: (id: string) => void;
}) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`
            px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 min-w-[300px]
            ${toast.type === "success" ? "bg-green-900 border border-green-700" : ""}
            ${toast.type === "error" ? "bg-red-900 border border-red-700" : ""}
            ${toast.type === "info" ? "bg-blue-900 border border-blue-700" : ""}
            ${toast.type === "loading" ? "bg-gray-800 border border-gray-700" : ""}
          `}
        >
          {/* Icon */}
          {toast.type === "loading" && (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          )}
          {toast.type === "success" && <span>✓</span>}
          {toast.type === "error" && <span>✕</span>}
          {toast.type === "info" && <span>ℹ</span>}

          {/* Message */}
          <div className="flex-1">
            <p className="text-sm text-white">{toast.message}</p>
            {toast.txHash && (
              <a
                href={`https://basescan.org/tx/${toast.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-400 hover:underline"
              >
                View on BaseScan →
              </a>
            )}
          </div>

          {/* Close button */}
          <button
            onClick={() => onClose(toast.id)}
            className="text-gray-400 hover:text-white"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
```

### Task 4: Update Dashboard to Use Context

Update `frontend/app/dashboard/page.tsx` to use the Autopilot context:

```typescript
"use client";

import { useAutopilot } from "@/contexts/AutopilotContext";

export default function DashboardPage() {
  const {
    walletAddress,
    checkingBalance,
    yieldBalance,
    totalBalance,
    currentStrategy,
    isLoading,
    isPolling,
    refreshBalances,
  } = useAutopilot();

  if (isLoading) {
    return <div className="p-8">Loading...</div>;
  }

  if (!walletAddress) {
    return (
      <div className="p-8">
        <p>No wallet found. Please create one first.</p>
        <a href="/create" className="text-blue-400 hover:underline">
          Create Wallet →
        </a>
      </div>
    );
  }

  const formatApy = (apy: number) => `${(apy * 100).toFixed(2)}%`;

  return (
    <div className="space-y-8 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <button
          onClick={refreshBalances}
          disabled={isPolling}
          className="text-sm text-gray-400 hover:text-white"
        >
          {isPolling ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {/* Balance Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
          <p className="text-gray-400 text-sm">Checking Balance</p>
          <p className="text-2xl font-bold mt-1">
            ${checkingBalance || "0.00"}
          </p>
          <p className="text-gray-500 text-xs mt-1">Available for spending</p>
        </div>

        <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
          <p className="text-gray-400 text-sm">Yield Balance</p>
          <p className="text-2xl font-bold mt-1 text-green-400">
            ${yieldBalance || "0.00"}
          </p>
          <p className="text-gray-500 text-xs mt-1">
            {currentStrategy
              ? `${currentStrategy.name} • ${formatApy(currentStrategy.apy)} APY`
              : "Not earning yield"
            }
          </p>
        </div>

        <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
          <p className="text-gray-400 text-sm">Total Balance</p>
          <p className="text-2xl font-bold mt-1">
            ${totalBalance || "0.00"}
          </p>
          <p className="text-gray-500 text-xs mt-1">USDC</p>
        </div>
      </div>

      {/* Wallet Address */}
      <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
        <p className="text-gray-400 text-sm">Wallet Address</p>
        <p className="text-sm font-mono mt-1">{walletAddress}</p>
      </div>
    </div>
  );
}
```

---

## Dust Sweeping - Future Task

The dust sweeping feature is lower priority. Here's where it fits:

**Contract side (Jackson):**
- `sweepDustAndCompound()` function in AutoYieldModule
- Takes tracked dust tokens from config
- Swaps each to consolidation token via DEX router
- Deposits result into yield

**Backend side (Bryce):**
- `dustService.ts` already has token metadata
- Add `submitSweepDustUserOp()` to bundler.ts (already stubbed above)
- Scheduler can trigger sweep on a longer interval (daily?)

**Frontend side (Logan/Robby):**
- "Clean Up Wallet" button on dashboard
- Shows list of dust tokens and estimated value
- Calls backend or directly submits UserOp

**For now:** Skip this until the core flow works. It's a nice demo feature but not critical path.

---

## Environment Variables Summary

### Backend (.env)

```env
# CDP Bundler/Paymaster
CDP_BUNDLER_URL=https://api.developer.coinbase.com/rpc/v1/base/YOUR_KEY

# Session key (Bryce generates, Jackson needs public address)
AUTOMATION_PRIVATE_KEY=0x...
AUTOMATION_PUBLIC_ADDRESS=0x...

# Contract addresses (Jackson provides after deployment)
AUTO_YIELD_MODULE_ADDRESS=0x...
FACTORY_ADDRESS=0x...
```

### Frontend (.env.local)

```env
# Backend API
NEXT_PUBLIC_API_URL=http://localhost:3001

# Contract addresses (Jackson provides after deployment)
NEXT_PUBLIC_FACTORY_ADDRESS=0x...
NEXT_PUBLIC_MODULE_ADDRESS=0x...

# RPC
NEXT_PUBLIC_BASE_RPC_URL=https://mainnet.base.org
```
