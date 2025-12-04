# Autopilot Wallet - Outstanding Tasks

Last Updated: December 4, 2024

---

## Status Overview

| Area | Status |
|------|--------|
| **Contracts** | v2 Deployed on Base Mainnet |
| **Backend** | B1-B4 Complete, B5-B6 In Progress |
| **Frontend** | UI Built, Needs Contract Wiring |

---

## Deployed Contracts (v2)

| Contract | Address |
|----------|---------|
| AutopilotFactory | `0xcf10279BAA0d5407Dbb637517d23055A55E72923` |
| AutoYieldModule | `0x71b5A4663A49FF02BE672Ea9560256D2268727B7` |
| AutomationValidator | `0xe29ed376a2780f653C14EEC203eD25094c0E772A` |
| MorphoAdapter | `0x42EFecD83447e5b90c5F706309FaC8f9615bd68F` |
| Automation Key | `0xD78F5099987389e33bD6Ec15FF3Ca4dBedD507f3` |

---

## Outstanding Tasks

### 1. Frontend: Update Contract Addresses
**Priority:** High (Quick Win)
**Status:** TODO
**File:** `frontend/lib/constants.ts`

Update to v2 deployment addresses:
```typescript
export const CONTRACTS = {
  FACTORY: "0xcf10279BAA0d5407Dbb637517d23055A55E72923",
  MODULE: "0x71b5A4663A49FF02BE672Ea9560256D2268727B7",
  VALIDATOR: "0xe29ed376a2780f653C14EEC203eD25094c0E772A",
  ADAPTER: "0x42EFecD83447e5b90c5F706309FaC8f9615bd68F",
  USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
} as const;
```

---

### 2. Backend: Real UserOp Submission (B5)
**Priority:** High
**Status:** In Progress (branch work)
**File:** `backend/src/scheduler.ts` (line ~290)

**Current State:**
- Scheduler logs `[SIMULATED]` instead of submitting real userOps
- Branch exists with Permissionless.js + CDP Kit setup

**Implementation:**
1. Create `bundler.ts` with userOp building logic
2. Use Permissionless.js for userOp construction
3. Use CDP Bundler/Paymaster for submission
4. Replace simulation in `executeTask()` with real calls

**Required Env Vars:**
```env
CDP_API_KEY=your_cdp_api_key
AUTOMATION_PRIVATE_KEY=0x...
```

---

### 3. Frontend: Wire Dashboard to Real Balances
**Priority:** High
**Status:** TODO
**Files:** `frontend/app/dashboard/page.tsx`, `frontend/lib/services/`

**Current State:**
- Shows hardcoded mock data from `lib/mock-data.ts`

**Implementation:**
```typescript
// Read checking balance (USDC in wallet)
const checking = await publicClient.readContract({
  address: CONTRACTS.USDC,
  abi: erc20Abi,
  functionName: "balanceOf",
  args: [walletAddress],
});

// Read yield balance via adapter
const adapter = await publicClient.readContract({
  address: CONTRACTS.MODULE,
  abi: MODULE_ABI,
  functionName: "currentAdapter",
  args: [walletAddress, CONTRACTS.USDC],
});

const yieldBalance = await publicClient.readContract({
  address: adapter,
  abi: ADAPTER_ABI,
  functionName: "totalValue",
  args: [],
});
```

---

### 4. Frontend: Wire Send Page to Contract
**Priority:** High
**Status:** TODO
**File:** `frontend/app/send/page.tsx`

**Current State:**
- 100% simulated with 90% success rate mock

**Implementation:**
- Build userOp calling `executeWithAutoYield(token, to, amount, data)`
- Submit via bundler (can use same pattern as backend B5)
- Show real transaction hash and link to BaseScan

---

### 5. Frontend: Wire Settings Page to Contract
**Priority:** Medium
**Status:** TODO
**File:** `frontend/app/settings/page.tsx`

**Current State:**
- UI exists but no contract writes

**Implementation:**
- `setCheckingThreshold(token, threshold)` - Update checking buffer
- `setAdapterAllowed(adapter, bool)` - Allowlist adapters
- `setAutomationKey(address)` - Change/revoke automation key

---

### 6. Backend: Connect Cron to Wallet Registry
**Priority:** Medium
**Status:** TODO
**Files:** `backend/src/scheduler.ts`, `backend/src/server.ts`

**Current State:**
- Railway backend deployed with wallet registry
- Scheduler runs but doesn't iterate registered wallets

**Implementation:**
1. Query registered wallets from registry endpoint
2. For each wallet, check if rebalance needed
3. Submit rebalance userOp if threshold exceeded

---

### 7. Backend: Real Dust Balance Reading
**Priority:** Low
**Status:** TODO
**File:** `backend/src/dustService.ts`

**Current State:**
- `getDustSummary()` returns hardcoded mock balances

**Implementation:**
- Use viem to read ERC20 balances for tracked dust tokens
- Return real on-chain balances

---

### 8. E2E Flow Test
**Priority:** Medium (After wiring complete)
**Status:** TODO

**Test Flow:**
1. Create wallet via factory
2. Deposit USDC to smart wallet address
3. Verify auto-rebalance moves excess to yield
4. Send USDC (triggers auto-withdraw from yield)
5. Verify final balances correct

---

## Completed Tasks

- [x] Contract deployment (v2 with AutomationValidator)
- [x] Factory initialization fix (Kernel v3 module install format)
- [x] Backend strategy indexer (B1)
- [x] Backend recommendation engine (B2)
- [x] Backend scheduler framework (B3)
- [x] Backend dust token service (B4)
- [x] Railway backend deployment
- [x] Wallet registry setup
- [x] Frontend UI (landing, dashboard, send, settings pages)

---

## Critical Path

```
[1] Update addresses ──→ [3] Dashboard balances ──→ [4] Send wiring ──→ [8] E2E test
                                    ↑
[2] B5 UserOp submission ──→ [6] Cron + registry ─┘
```

Tasks 1 and 2 are the immediate blockers. Task 1 is a 2-minute fix.
