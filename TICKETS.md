# Autopilot Wallet - Engineering Tickets

---

## CURRENT PATH FORWARD

### Critical Path (Blocking Demo)
```
C1 (Automation Key) → C2 (Core Logic) → B1 (UserOp Submission) → Integration
```

### What Everyone Should Be Doing RIGHT NOW

| Person | Current Focus | Can Start Immediately | Blocked Until |
|--------|---------------|----------------------|---------------|
| **Jackson** | C1 → C2 → C3 | All contract work | Nothing |
| **Bryce** | B3 (DefiLlama API) | B3, B4 (database) | B1 waits for C1-C3 deployed |
| **Logan** | F1 (Landing Page), L1 (API Client) | F1, L1 | F2 waits for contracts |
| **Robby** | F4 (Send Page), L3 (Contract Layer) | F4, L3 | L5 waits for contracts |

### Parallel Work Streams

**Stream 1: Contracts (Jackson)**
- C1 → C2 → C3 → C4 → C5 → C6 → C7
- Everything else depends on this

**Stream 2: Backend Infrastructure (Bryce)**
- B3 (DefiLlama) + B4 (Database) can happen now
- B1, B2 wait for contracts

**Stream 3: Frontend UI (Logan)**
- Build all UI pages now with mock data
- F1, F3, F4, F6, F7 have no contract dependencies
- Wire to real contracts after Jackson deploys

**Stream 4: Frontend Infrastructure (Robby)**
- L1: Build API client for backend
- L2: Build React hooks for wallet state
- L3: Build contract interaction helpers (structure only)
- L4: Integration test scaffolding

---

## CONTRACTS (Jackson)

---

### C1: Add Automation Key + Adapter Whitelist

**Problem**
PRD requires dual-key model. Backend automation key can call `rebalance`, `migrateStrategy`, `sweepDustAndCompound` without user signatures. No automation key support exists in `AutoYieldModule.sol`.

**Blocked By:** Nothing

**Blocks:** C2, C3, B1, F5

**Deliverables**
- `automationKey` mapping per account
- `allowedAdapters` mapping per account
- `currentAdapter` mapping per account per token
- Functions: `setAutomationKey()`, `addAllowedAdapter()`, `removeAllowedAdapter()`
- `onlyAutomationOrOwner` modifier
- Events for state changes

**Steps**

1. Add state variables:
```solidity
mapping(address account => address) public automationKey;
mapping(address account => mapping(address adapter => bool)) public allowedAdapters;
mapping(address account => mapping(address token => address)) public currentAdapter;
```

2. Add owner-only config functions:
```solidity
function setAutomationKey(address key) external;
function addAllowedAdapter(address adapter) external;
function removeAllowedAdapter(address adapter) external;
```

3. Add modifier for automation-callable functions:
```solidity
modifier onlyAutomationOrOwner() {
    _;
}
```

4. Add events and errors

5. Write unit tests

---

### C2: Implement Core Function Logic

**Problem**
`executeWithAutoYield()`, `rebalance()`, and view functions are stubs with TODOs. No actual vault deposit/withdraw logic.

**Blocked By:** C1

**Blocks:** F2, B1

**Deliverables**
- `executeWithAutoYield()` withdraws from vault if needed, executes transfer, redeposits surplus
- `rebalance()` deposits excess to vault or withdraws to meet threshold
- View functions return real balances
- Integration tests with MockYieldVault

**Steps**

1. Add helper:
```solidity
function _executeOnAccount(address account, address to, bytes memory data) internal {
    IKernel(account).execute(to, 0, data);
}
```

2. Implement `executeWithAutoYield()`:
   - Get checking balance: `IERC20(token).balanceOf(account)`
   - Calculate: `required = amount + threshold`
   - If `checking < required`: withdraw deficit from vault via adapter
   - Execute user's transfer
   - If new balance > threshold: deposit surplus to vault

3. Implement `rebalance()`:
   - Add `onlyAutomationOrOwner` modifier
   - If checking > threshold: deposit excess to vault
   - If checking < threshold: withdraw from vault

4. Implement view functions:
   - `getCheckingBalance()`: `IERC20(token).balanceOf(account)`
   - `getYieldBalance()`: `adapter.totalValue(token, account)`
   - `getTotalBalance()`: sum of both

5. Integration tests with MockYieldVault

---

### C3: Add migrateStrategy Function

**Problem**
PRD requires `migrateStrategy()` for moving funds between vaults when backend finds better yield. Function doesn't exist.

**Blocked By:** C1

**Blocks:** B1, B2

**Deliverables**
- `migrateStrategy(token, newAdapter)` function
- Validates adapter is whitelisted
- Withdraws from old vault, deposits to new vault
- Updates `currentAdapter` mapping

**Steps**

1. Add function:
```solidity
function migrateStrategy(address token, address newAdapter) external onlyAutomationOrOwner {
    address account = msg.sender;

    // Validate
    require(allowedAdapters[account][newAdapter], "adapter not whitelisted");

    address oldAdapter = currentAdapter[account][token];
    if (oldAdapter == newAdapter) return;

    // Withdraw all from old vault
    if (oldAdapter != address(0)) {
        uint256 balance = IYieldAdapter(oldAdapter).totalValue(token, account);
        if (balance > 0) {
            IYieldAdapter(oldAdapter).withdraw(token, balance);
        }
    }

    // Deposit to new vault (respecting threshold)
    uint256 checking = IERC20(token).balanceOf(account);
    uint256 threshold = tokenConfigs[account][token].checkingThreshold;
    if (checking > threshold) {
        uint256 toDeposit = checking - threshold;
        IERC20(token).approve(newAdapter, toDeposit);
        IYieldAdapter(newAdapter).deposit(token, toDeposit);
    }

    // Update state
    currentAdapter[account][token] = newAdapter;
    emit StrategyMigrated(account, token, oldAdapter, newAdapter);
}
```

2. Write tests

---

### C4: Add flushToChecking Function

**Problem**
PRD specifies emergency function to withdraw all funds from vault. Missing.

**Blocked By:** Nothing

**Blocks:** Nothing

**Deliverables**
- `flushToChecking(token)` function
- Owner-only (not automation)
- Withdraws everything from vault
- Disables yield for token

**Steps**

1. Add function:
```solidity
function flushToChecking(address token) external {
    address account = msg.sender;
    address adapter = currentAdapter[account][token];

    if (adapter == address(0)) return;

    uint256 balance = IYieldAdapter(adapter).totalValue(token, account);
    if (balance > 0) {
        IYieldAdapter(adapter).withdraw(token, balance);
        emit YieldWithdrawn(account, token, balance);
    }

    tokenConfigs[account][token].yieldEnabled = false;
    currentAdapter[account][token] = address(0);
}
```

---

### C5: Rename sweepDust to sweepDustAndCompound

**Problem**
PRD uses `sweepDustAndCompound()` but code has `sweepDust(tokens[])`. Also needs implementation.

**Blocked By:** Nothing

**Blocks:** B2

**Deliverables**
- Renamed function
- No parameters (uses stored dust config)
- `onlyAutomationOrOwner` modifier
- Swaps dust tokens to USDC via DEX, deposits to vault

**Steps**

1. Rename function
2. Remove `tokens` parameter
3. Add `onlyAutomationOrOwner` modifier
4. Implement swap logic (can stub for hackathon)

---

### C6: Update onInstall for Full Initialization

**Problem**
`onInstall()` only accepts adapter address. Needs to set automation key and whitelist adapters.

**Blocked By:** C1

**Blocks:** F1

**Deliverables**
- Accepts full config struct
- Sets automation key
- Whitelists initial adapters
- Sets default token config

**Steps**

1. Define install config struct:
```solidity
struct InstallConfig {
    address defaultAdapter;
    address automationKey;
    address[] initialAdapters;
    address usdcAddress;
    uint256 defaultThreshold;
}
```

2. Update `onInstall()` to decode and apply config

---

### C7: Create Real Yield Adapters

**Problem**
Only MockYieldVault exists. Need adapters for real vaults on Base.

**Blocked By:** C2

**Blocks:** Demo on mainnet

**Deliverables**
- `AaveV3Adapter.sol` for Aave V3 on Base
- `MorphoAdapter.sol` for Morpho Blue on Base
- Both implement `IYieldAdapter`

**Steps**

1. Create `contracts/src/adapters/AaveV3Adapter.sol`:
   - Constructor takes Aave pool address
   - `deposit()`: approve + supply to Aave
   - `withdraw()`: withdraw from Aave
   - `totalValue()`: read aToken balance

2. Create `contracts/src/adapters/MorphoAdapter.sol`:
   - Similar pattern for Morpho

3. Deploy and verify on Base Sepolia

---

## BACKEND (Bryce)

---

### B1: Implement UserOp Builder + Bundler Submission

**Problem**
Scheduler simulates actions but doesn't submit real userOps. Logs "[SIMULATED]" instead.

**Blocked By:** C1, C2, C3 deployed to Sepolia

**Blocks:** Full automation working

**Deliverables**
- `buildAndSubmitUserOp()` function
- Signs with automation key
- Submits to ZeroDev bundler
- Returns userOp hash

**Steps**

1. Create `backend/src/bundler.ts`

2. Implement userOp building:
```typescript
async function buildAndSubmitUserOp(params: {
  walletAddress: string;
  action: "rebalance" | "migrateStrategy" | "sweepDustAndCompound";
  token?: string;
  newAdapter?: string;
}): Promise<string> {
  // Build calldata for the action
  // Sign with automation key
  // Submit to bundler
  // Return hash
}
```

3. Update `scheduler.ts` to call this instead of logging "[SIMULATED]"

---

### B2: Add migrateStrategy Action Type

**Problem**
Scheduler supports `rebalance`, `flushToChecking`, `sweepDust` but not `migrateStrategy`.

**Blocked By:** C3, C5

**Blocks:** B1

**Deliverables**
- `migrateStrategy` as valid action type
- `targetAdapter` field on tasks
- Decision logic: if current vault != best vault, use migrateStrategy

**Steps**

1. Update `types.ts`:
```typescript
type TaskAction = "rebalance" | "migrateStrategy" | "flushToChecking" | "sweepDust";

interface RebalanceTask {
  // ... existing
  targetAdapter?: string;
}
```

2. Update `isValidTaskAction()` in scheduler

3. Update decision logic in `executeTask()`

---

### B3: Implement Live DefiLlama Yield Fetching

**Problem**
Uses static mock strategies. Need live APY data from DefiLlama.

**Blocked By:** Nothing - START NOW

**Blocks:** B1 (needs adapter address mapping)

**Deliverables**
- Fetches from `https://yields.llama.fi/pools`
- Filters for Base chain, stablecoins, min TVL
- Maps to our adapter addresses
- Caches for 5 minutes

**Steps**

1. Create `backend/src/defiLlama.ts`:
```typescript
const YIELDS_URL = "https://yields.llama.fi/pools";

// Map DefiLlama project names to our adapter addresses
const ADAPTER_MAP = {
  "aave-v3": "0x...",
  "morpho-blue": "0x..."
};

async function fetchYields(chainId = 8453) {
  const res = await fetch(YIELDS_URL);
  const data = await res.json();

  return data.data
    .filter(pool =>
      pool.chain === "Base" &&
      pool.stablecoin &&
      pool.tvlUsd > 100000 &&
      ADAPTER_MAP[pool.project]
    )
    .map(pool => ({
      id: pool.pool,
      protocol: pool.project,
      apy: pool.apy / 100,
      tvl: pool.tvlUsd,
      adapterAddress: ADAPTER_MAP[pool.project]
    }))
    .sort((a, b) => b.apy - a.apy);
}
```

2. Update `strategyService.ts` to use this instead of static data

3. Add caching with 5-minute TTL

---

### B4: Add Wallet Registry Database

**Problem**
Tasks stored in-memory only. Lost on restart.

**Blocked By:** Nothing - START NOW

**Blocks:** B5, B6

**Deliverables**
- PostgreSQL schema for wallets and tasks
- CRUD functions
- Load tasks on startup

**Steps**

1. Create schema:
```sql
CREATE TABLE wallets (
  address VARCHAR(42) PRIMARY KEY,
  owner_address VARCHAR(42) NOT NULL,
  current_adapter_usdc VARCHAR(42),
  automation_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE rebalance_tasks (
  id VARCHAR(64) PRIMARY KEY,
  wallet_address VARCHAR(42) REFERENCES wallets(address),
  token VARCHAR(10) DEFAULT 'USDC',
  action VARCHAR(32) DEFAULT 'rebalance',
  interval_ms INTEGER DEFAULT 300000,
  enabled BOOLEAN DEFAULT true,
  last_run_at TIMESTAMP,
  next_run_at TIMESTAMP,
  error_count INTEGER DEFAULT 0
);
```

2. Create `backend/src/db/walletRegistry.ts` with CRUD functions

3. Update scheduler to load tasks on startup

---

### B5: Add POST /register Endpoint

**Problem**
No endpoint to register new wallets for automation.

**Blocked By:** B4

**Blocks:** F1

**Deliverables**
- `POST /register` endpoint
- Creates wallet record
- Creates default rebalance task

---

### B6: Add GET /wallet/:address Endpoint

**Problem**
No endpoint to get wallet status.

**Blocked By:** B4

**Blocks:** F2

**Deliverables**
- `GET /wallet/:address` endpoint
- Returns wallet metadata and current vault

---

## FRONTEND (Logan)

---

### F1: Build Landing Page + Onboarding Flow

**Problem**
No landing page. No way for users to create wallets.

**Blocked By:** Nothing for UI - START NOW

**Blocks:** Everything after onboarding

**Deliverables**
- Landing page at `/` explaining the product
- `/onboarding` page with wallet creation flow
- Connect EOA → Create wallet → Configure → Dashboard

**Steps**

1. Create `frontend/app/page.tsx` (landing):
   - Hero: "Your money works while you sleep"
   - Feature highlights: auto-yield, gasless, one-click spend
   - "Get Started" button → `/onboarding`

2. Create `frontend/app/onboarding/page.tsx`:
   - Step 1: Connect Coinbase Wallet
   - Step 2: "Create Autopilot Wallet" button (mock for now)
   - Step 3: Set threshold (slider: 50-500 USDC)
   - Step 4: Enable automation toggle
   - Step 5: Success → redirect to dashboard

3. Use mock functions for now - wire to contracts later (F2)

---

### F3: Delete Merchant Page

**Problem**
Merchant page exists but doesn't fit product. This is a self-custodial wallet, not merchant payments.

**Blocked By:** Nothing - DO NOW

**Blocks:** Nothing

**Deliverables**
- Delete `frontend/app/merchant/page.tsx`
- Remove any nav links to it

---

### F4: Rename Pay to Send + Build Send Page

**Problem**
Page uses "Pay" language but PRD says "Send". Also needs full implementation.

**Blocked By:** Nothing - DO NOW

**Blocks:** Nothing

**Deliverables**
- Route is `/send` not `/pay`
- Full send form: recipient, amount, token selector
- Transaction preview showing auto-unstake if needed
- Success/error states

**Steps**

1. Rename `frontend/app/pay/` → `frontend/app/send/`

2. Build full send form:
   - Recipient address input
   - Amount input with max button
   - Token dropdown (USDC default)
   - Preview section: "Will withdraw X from yield to cover this"
   - Send button

3. Use mock submit for now - wire to contracts later

---

### F5: Build Settings Page

**Problem**
Settings page is empty/incomplete.

**Blocked By:** Nothing for UI - START NOW

**Blocks:** Nothing

**Deliverables**
- Checking threshold configuration
- Auto-yield toggle per token
- Automation key toggle
- Current vault display

**Steps**

1. Create full settings UI:
   - Section: "Checking Threshold"
     - Slider or input for USDC threshold
     - "Save" button
   - Section: "Yield Settings"
     - Toggle: "Enable USDC auto-yield"
     - Current vault display with APY
   - Section: "Automation"
     - Toggle: "Allow background rebalancing"
     - Info: "Backend can move funds to better vaults"

2. Use mock functions for now

---

### F6: Build Transaction History

**Problem**
No transaction history page.

**Blocked By:** Nothing - DO NOW

**Blocks:** Nothing

**Deliverables**
- `/history` page showing past transactions
- Shows sends, rebalances, migrations
- Links to block explorer

**Steps**

1. Create `frontend/app/history/page.tsx`

2. Build transaction list:
   - Mock data for now
   - Type icons (send, deposit, withdraw, rebalance)
   - Amount, timestamp, status
   - Click to open in Basescan

3. Add to navigation

---

### F7: Enhance Dashboard with Yield Display

**Problem**
Dashboard only shows mock balances. Needs yield information.

**Blocked By:** Nothing - DO NOW

**Blocks:** Nothing

**Deliverables**
- Current vault name and APY
- Yield earned (mock calculation)
- Visual split: checking vs yield

**Steps**

1. Add yield card to dashboard:
   - Current vault: "Morpho USDC"
   - Current APY: "5.2%"
   - Yield earned: "$X.XX"

2. Add balance visualization:
   - Pie chart or bar showing checking vs yield split
   - Threshold line indicator

3. Use mock data - wire to backend later

---

## FRONTEND INFRASTRUCTURE (Robby)

---

### L1: Build Backend API Client

**Problem**
No centralized API client for backend calls.

**Blocked By:** Nothing - START NOW

**Blocks:** F2, F7

**Deliverables**
- `frontend/lib/api/client.ts` with typed functions
- All backend endpoints wrapped
- Error handling

**Steps**

1. Create `frontend/lib/api/client.ts`:
```typescript
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export async function getStrategies() {
  const res = await fetch(`${API_BASE}/strategies`);
  return res.json();
}

export async function getRecommendation(token: string) {
  const res = await fetch(`${API_BASE}/recommend?token=${token}`);
  return res.json();
}

export async function registerWallet(walletAddress: string, ownerAddress: string) {
  const res = await fetch(`${API_BASE}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress, ownerAddress })
  });
  return res.json();
}

export async function getWallet(address: string) {
  const res = await fetch(`${API_BASE}/wallet/${address}`);
  return res.json();
}

export async function getDustTokens() {
  const res = await fetch(`${API_BASE}/dust/tokens`);
  return res.json();
}
```

2. Add TypeScript types matching backend responses

3. Add error handling wrapper

---

### L2: Build Wallet State Hooks

**Problem**
No React hooks for wallet state management.

**Blocked By:** Nothing - START NOW

**Blocks:** All frontend pages

**Deliverables**
- `useAutopilotWallet()` hook for wallet state
- `useBalances()` hook for balance data
- `useYieldInfo()` hook for yield data

**Steps**

1. Create `frontend/lib/hooks/useAutopilotWallet.ts`:
```typescript
export function useAutopilotWallet() {
  const [smartWalletAddress, setSmartWalletAddress] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Check localStorage for existing wallet
  // Provide createWallet function
  // Provide wallet status

  return {
    smartWalletAddress,
    isCreating,
    createWallet,
    hasWallet: !!smartWalletAddress
  };
}
```

2. Create `frontend/lib/hooks/useBalances.ts`:
```typescript
export function useBalances(walletAddress: string | null) {
  // Return checking, yield, total balances
  // Poll or use websocket for updates
  // Use mock data until contracts ready
}
```

3. Create `frontend/lib/hooks/useYieldInfo.ts`:
```typescript
export function useYieldInfo(walletAddress: string | null) {
  // Return current vault, APY, earnings
  // Fetch from backend API
}
```

---

### L3: Build Contract Interaction Layer (Structure)

**Problem**
No contract interaction helpers.

**Blocked By:** Nothing for structure - START NOW

**Blocks:** F2, F5

**Deliverables**
- `frontend/lib/contracts/` directory structure
- Type definitions for contract calls
- Mock implementations that will be swapped for real calls

**Steps**

1. Create `frontend/lib/contracts/types.ts`:
```typescript
export interface TokenConfig {
  checkingThreshold: bigint;
  yieldEnabled: boolean;
  adapter: string;
}

export interface ExecuteWithAutoYieldParams {
  token: string;
  to: string;
  amount: bigint;
  data: `0x${string}`;
}
```

2. Create `frontend/lib/contracts/autoYieldModule.ts`:
```typescript
// Structure for contract calls - mock for now
export async function executeWithAutoYield(
  walletAddress: string,
  params: ExecuteWithAutoYieldParams
): Promise<string> {
  // TODO: Replace with real contract call
  console.log("Mock executeWithAutoYield", params);
  return "0xmockhash";
}

export async function setTokenConfig(
  walletAddress: string,
  token: string,
  config: Partial<TokenConfig>
): Promise<string> {
  // TODO: Replace with real contract call
  console.log("Mock setTokenConfig", config);
  return "0xmockhash";
}
```

3. Create `frontend/lib/contracts/factory.ts` for wallet creation

---

### L4: Set Up Integration Test Scaffolding

**Problem**
No integration tests between frontend/backend/contracts.

**Blocked By:** Nothing - START NOW

**Blocks:** Demo reliability

**Deliverables**
- Test file structure
- Mock contract setup
- E2E test for wallet creation flow

**Steps**

1. Create `frontend/tests/integration/` directory

2. Create `frontend/tests/integration/walletCreation.test.ts`:
```typescript
describe("Wallet Creation Flow", () => {
  it("should create wallet and register with backend", async () => {
    // Mock wallet connection
    // Call createWallet
    // Verify backend registration
  });
});
```

3. Create `frontend/tests/integration/sendFlow.test.ts`:
```typescript
describe("Send Flow", () => {
  it("should execute send with auto-unstake", async () => {
    // Setup mock wallet with balance
    // Execute send
    // Verify unstake + transfer happened
  });
});
```

---

### L5: Build Demo Reset Script

**Problem**
Need reliable way to reset wallet state for repeated demos.

**Blocked By:** C4 deployed, L3 complete

**Blocks:** Demo

**Deliverables**
- Script that resets demo wallet to clean state
- Takes < 30 seconds
- Works reliably

**Steps**

1. Create `scripts/reset-demo.ts`:
   - Call `flushToChecking()` to withdraw from vault
   - Transfer all USDC to faucet
   - Mint fresh 500 USDC to wallet
   - Delete and recreate backend task

---

## DEPENDENCY GRAPH

```
                    ┌─────────────────────────────────────────────────┐
                    │              CONTRACTS (Jackson)                 │
                    │                                                  │
                    │  C1 ──────┬──────> C2 ──────> C7                │
                    │    │      │         │                            │
                    │    │      └──> C3   │                            │
                    │    │           │    │                            │
                    │  C4  C5  C6 <──┘    │                            │
                    └────┼────┼────┼──────┼────────────────────────────┘
                         │    │    │      │
         ┌───────────────┼────┼────┼──────┼───────────────────────────┐
         │               │    │    │      │    BACKEND (Bryce)        │
         │               ▼    ▼    │      ▼                           │
         │  B3 ◄─────────────────────────────────────────┐            │
         │   │                     │      │              │            │
         │  B4 ──────> B5 ──────> B6     B1 <── B2 <────┘            │
         │                                                            │
         └────────────────────────────────────────────────────────────┘
                    │         │
         ┌──────────┼─────────┼───────────────────────────────────────┐
         │          ▼         ▼      FRONTEND (Logan)                 │
         │                                                            │
         │  F1 (Landing/Onboard)                                      │
         │  F3 (Delete Merchant)     ──> all independent              │
         │  F4 (Send Page)                                            │
         │  F5 (Settings Page)                                        │
         │  F6 (History Page)                                         │
         │  F7 (Dashboard Yield)                                      │
         │                                │                           │
         │                                ▼                           │
         │                    F2 (Wire Real Contracts)                │
         │                                                            │
         └────────────────────────────────────────────────────────────┘
                                          │
         ┌────────────────────────────────┼───────────────────────────┐
         │                                │  INFRASTRUCTURE (Robby)   │
         │                                ▼                           │
         │  L1 (API Client)  ──────────────────────┐                  │
         │  L2 (Wallet Hooks) ─────────────────────┤                  │
         │  L3 (Contract Layer) ───────────────────┼──> Integration   │
         │  L4 (Test Scaffolding) ─────────────────┤                  │
         │  L5 (Demo Reset) <──────────────────────┘                  │
         │                                                            │
         └────────────────────────────────────────────────────────────┘
```

---

## QUICK REFERENCE: Who Does What

### Jackson (Contracts)
| Ticket | Description | Status |
|--------|-------------|--------|
| C1 | Automation key + whitelist | TODO |
| C2 | Core logic (executeWithAutoYield, rebalance) | TODO |
| C3 | migrateStrategy function | TODO |
| C4 | flushToChecking function | TODO |
| C5 | sweepDustAndCompound rename + impl | TODO |
| C6 | onInstall enhancement | TODO |
| C7 | Real adapters (Aave, Morpho) | TODO |

### Bryce (Backend)
| Ticket | Description | Status | Can Start Now? |
|--------|-------------|--------|----------------|
| B3 | DefiLlama yield fetching | TODO | YES |
| B4 | Wallet registry database | TODO | YES |
| B5 | POST /register endpoint | TODO | After B4 |
| B6 | GET /wallet/:address endpoint | TODO | After B4 |
| B1 | UserOp builder + submission | TODO | After C1-C3 |
| B2 | migrateStrategy action type | TODO | After C3, C5 |

### Logan (Frontend UI)
| Ticket | Description | Status | Can Start Now? |
|--------|-------------|--------|----------------|
| F1 | Landing + onboarding | TODO | YES |
| F3 | Delete merchant page | TODO | YES |
| F4 | Send page (rename + build) | TODO | YES |
| F5 | Settings page | TODO | YES |
| F6 | Transaction history | TODO | YES |
| F7 | Dashboard yield display | TODO | YES |
| F2 | Wire real contracts | TODO | After C2 |

### Robby (Frontend Infra)
| Ticket | Description | Status | Can Start Now? |
|--------|-------------|--------|----------------|
| L1 | Backend API client | TODO | YES |
| L2 | Wallet state hooks | TODO | YES |
| L3 | Contract interaction layer | TODO | YES |
| L4 | Integration test scaffolding | TODO | YES |
| L5 | Demo reset script | TODO | After C4 |
