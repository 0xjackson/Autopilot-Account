# PRD: Autopilot Wallet on Base

**Working name:** Autopilot Wallet

---

## 0. One-Sentence Idea

A smart wallet on Base that automatically optimizes your idle capital — keeping a spending balance in USDC while a backend service continuously moves excess funds to the highest-yielding vaults, all without requiring user clicks or signatures after initial setup.

---

## 1. The Problem We're Solving

**Current DeFi UX is broken:**

1. **Manual yield management** — Users must constantly monitor APYs, manually deposit into vaults, and withdraw when they need to spend. Most people don't bother.

2. **Fragmented balances** — Funds sit idle in wallets earning nothing. Users accumulate dust tokens from airdrops and swaps that are too small to be worth managing.

3. **Gas friction** — Every DeFi interaction requires ETH for gas and a signature. This creates cognitive overhead and discourages optimization.

4. **Yield vs. liquidity tradeoff** — If your funds are in a vault earning yield, you can't instantly spend them. Users choose between earning yield OR having liquid funds.

**Autopilot Wallet solves all of this:**

- Set your "checking threshold" once (e.g., "keep 100 USDC liquid")
- Everything above that threshold automatically earns the best available yield
- When you spend, the wallet invisibly withdraws from yield to cover the transaction
- A background service continuously monitors yields and migrates your funds to better vaults
- Dust tokens get swept into USDC and put to work
- Zero gas costs, zero signatures after setup

**The user's mental model:** "I deposited money. It earns yield. I can spend anytime. I never think about it again."

---

## 2. Goals & Non-Goals

### 2.1 Goals

**Product Goals:**

- Users set their checking threshold once and never manually manage yield again
- Background automation finds and migrates to the best yields without user interaction
- Spending from yield-bearing positions is invisible — one click, one signature, funds auto-unstake
- Dust consolidation happens automatically
- Completely gasless UX via paymaster

**Technical Goals:**

- Demonstrate ERC-4337 smart accounts with gasless UX
- Showcase ERC-7579 modular architecture
- Implement dual-key validation (owner key + automation key)
- Build production-quality backend yield optimization service
- Deploy on Base with real yield sources

**Hackathon Demo:**

- Full flow: deposit → auto-yield → spend (with invisible unstake) → re-yield
- Background rebalancing triggered by yield changes
- Dust sweep and compound
- All gasless

### 2.2 Non-Goals (v1 / Hackathon Scope)

- No support for every DeFi protocol — we use a curated allowlist of safe vaults
- No auto-yield for every token — USDC first, optionally WETH
- No leveraged or complex strategies — simple vault deposits only
- No cross-chain optimization
- No mobile app — web dApp only
- No fiat on/off-ramp integration (can be mocked)

---

## 3. Core Concepts

| Concept | Description |
|---------|-------------|
| **Smart Account (4337)** | A contract wallet that can execute complex logic, batch operations, and be gasless via paymaster. Uses ZeroDev Kernel v3. |
| **Owner Key** | The user's EOA. Can do anything: spend, configure, withdraw. Signs normal transactions. |
| **Automation Key** | A backend-controlled key with strict limits. Can ONLY call `rebalance()`, `migrateStrategy()`, and `sweepDustAndCompound()`. Cannot transfer funds out. |
| **AutoYieldModule (7579)** | The brain of the wallet. Stores user config, executes yield logic, validates automation key permissions. |
| **Checking Threshold** | Minimum balance to keep liquid (e.g., 100 USDC). Everything above goes to yield. |
| **Yield Adapter** | Contract that wraps a specific vault (ERC-4626) with a standard interface. |
| **Backend Optimizer** | Cron service that monitors yields, compares to user positions, and submits rebalance operations. |
| **Paymaster** | Sponsors gas for all wallet operations. User never needs ETH. |

---

## 4. System Architecture

### 4.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           AUTOPILOT WALLET SYSTEM                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────────────┐                    ┌─────────────────────────────┐    │
│   │    Frontend     │                    │    Backend Optimizer        │    │
│   │   (Next.js)     │                    │    (Node.js / Cron)         │    │
│   │                 │                    │                             │    │
│   │  • Wallet setup │                    │  ┌───────────────────────┐  │    │
│   │  • View balance │                    │  │   Yield Indexer       │  │    │
│   │  • Send/Pay     │                    │  │   • Poll DefiLlama    │  │    │
│   │  • Config       │                    │  │   • Track best vaults │  │    │
│   │                 │                    │  └───────────┬───────────┘  │    │
│   └────────┬────────┘                    │              │              │    │
│            │                             │  ┌───────────▼───────────┐  │    │
│            │ User signs                  │  │  Rebalance Engine     │  │    │
│            │ with Owner Key              │  │  • Compare positions  │  │    │
│            │                             │  │  • Decide migrations  │  │    │
│            │                             │  └───────────┬───────────┘  │    │
│            │                             │              │              │    │
│            │                             │  ┌───────────▼───────────┐  │    │
│            │                             │  │  UserOp Submitter     │  │    │
│            │                             │  │  • Build userOps      │  │    │
│            │                             │  │  • Sign w/ Auto Key   │  │    │
│            │                             │  │  • Submit to bundler  │  │    │
│            │                             │  └───────────┬───────────┘  │    │
│            │                             └──────────────┼──────────────┘    │
│            │                                            │                   │
│            │  (Owner Key: any operation)                │ (Automation Key:  │
│            │                                            │  rebalance only)  │
│            ▼                                            ▼                   │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                         Base Network                                 │   │
│   │  ┌──────────────┐    ┌──────────────┐    ┌───────────────────────┐  │   │
│   │  │   Bundler    │───▶│  EntryPoint  │───▶│   Kernel Account      │  │   │
│   │  │  (ZeroDev)   │    │   (4337)     │    │   (User's Wallet)     │  │   │
│   │  └──────────────┘    └──────────────┘    │                       │  │   │
│   │                                          │  Installed Modules:   │  │   │
│   │  ┌──────────────┐                        │  • ECDSA Validator    │  │   │
│   │  │  Paymaster   │─ ─ ─ ─ sponsors ─ ─ ─ ▶│  • AutoYieldModule    │  │   │
│   │  │   (Base)     │       gas              │                       │  │   │
│   │  └──────────────┘                        └───────────┬───────────┘  │   │
│   │                                                      │              │   │
│   │                           ┌──────────────────────────┴───────┐      │   │
│   │                           │        AutoYieldModule           │      │   │
│   │                           │                                  │      │   │
│   │                           │  Storage:                        │      │   │
│   │                           │  • checkingThreshold[token]      │      │   │
│   │                           │  • currentAdapter[token]         │      │   │
│   │                           │  • automationKey                 │      │   │
│   │                           │  • allowedAdapters[]             │      │   │
│   │                           │  • dustConfig                    │      │   │
│   │                           │                                  │      │   │
│   │                           │  Functions:                      │      │   │
│   │                           │  • executeWithAutoYield() [owner]│      │   │
│   │                           │  • rebalance() [automation]      │      │   │
│   │                           │  • migrateStrategy() [automation]│      │   │
│   │                           │  • sweepDustAndCompound() [both] │      │   │
│   │                           └──────────────┬───────────────────┘      │   │
│   │                                          │                          │   │
│   │                           ┌──────────────▼───────────────────┐      │   │
│   │                           │       Yield Adapters             │      │   │
│   │                           │  ┌─────────┐  ┌─────────┐        │      │   │
│   │                           │  │ Aave    │  │ Morpho  │  ...   │      │   │
│   │                           │  │ Adapter │  │ Adapter │        │      │   │
│   │                           │  └────┬────┘  └────┬────┘        │      │   │
│   │                           └───────┼────────────┼─────────────┘      │   │
│   │                                   │            │                    │   │
│   │                           ┌───────▼────┐ ┌─────▼──────┐             │   │
│   │                           │ Aave Vault │ │Morpho Vault│             │   │
│   │                           │  (ERC4626) │ │  (ERC4626) │             │   │
│   │                           └────────────┘ └────────────┘             │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Dual-Key Validation Model

```
┌─────────────────────────────────────────────────────────────────────┐
│                    DUAL-KEY VALIDATION                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                     OWNER KEY (User's EOA)                   │    │
│  │                                                              │    │
│  │  Permissions: FULL ACCESS                                    │    │
│  │  • transfer() - send tokens anywhere                         │    │
│  │  • executeWithAutoYield() - spend with auto-unstake          │    │
│  │  • setCheckingThreshold() - configure thresholds             │    │
│  │  • setAutomationKey() - authorize/revoke backend             │    │
│  │  • addAllowedAdapter() - whitelist new vaults                │    │
│  │  • rebalance() - manual rebalance                            │    │
│  │  • sweepDustAndCompound() - manual dust sweep                │    │
│  │  • flushToChecking() - emergency withdraw all from yield     │    │
│  │                                                              │    │
│  │  Signing: User signs each transaction                        │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                  AUTOMATION KEY (Backend)                    │    │
│  │                                                              │    │
│  │  Permissions: RESTRICTED (yield operations only)             │    │
│  │  • rebalance() - deposit excess into yield                   │    │
│  │  • migrateStrategy() - move funds between allowed vaults     │    │
│  │  • sweepDustAndCompound() - consolidate dust                 │    │
│  │                                                              │    │
│  │  CANNOT DO:                                                  │    │
│  │  ✗ transfer() - cannot send funds to external addresses      │    │
│  │  ✗ executeWithAutoYield() - cannot initiate spends           │    │
│  │  ✗ setCheckingThreshold() - cannot change user config        │    │
│  │  ✗ addAllowedAdapter() - cannot add new vaults               │    │
│  │  ✗ Any call to non-whitelisted addresses                     │    │
│  │                                                              │    │
│  │  Signing: Backend signs automatically, no user interaction   │    │
│  │                                                              │    │
│  │  Safety: Even if compromised, can only move funds between    │    │
│  │          pre-approved vaults. Cannot drain wallet.           │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.3 Data Flow: User Spending

```
User clicks "Send 50 USDC to 0x1234..."
            │
            ▼
┌─────────────────────────────────────────────────────────────────┐
│  Frontend builds UserOperation:                                  │
│  • to: AutoYieldModule                                          │
│  • data: executeWithAutoYield(USDC, recipient, 50, transferData)│
│  • signature: User signs with Owner Key                         │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  Bundler receives UserOp → Paymaster sponsors gas               │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  EntryPoint → Kernel Account → AutoYieldModule                  │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  executeWithAutoYield() logic:                                   │
│                                                                  │
│  1. checkingBalance = USDC.balanceOf(wallet)  // e.g., 30 USDC  │
│  2. threshold = checkingThreshold[USDC]       // e.g., 100 USDC │
│  3. needed = amount + threshold               // 50 + 100 = 150 │
│  4. deficit = needed - checkingBalance        // 150 - 30 = 120 │
│                                                                  │
│  5. IF deficit > 0:                                              │
│     └─▶ yieldAdapter.withdraw(USDC, 120)     // unstake 120     │
│                                                                  │
│  6. USDC.transfer(recipient, 50)             // send to recipient│
│                                                                  │
│  7. newBalance = USDC.balanceOf(wallet)      // 30 + 120 - 50   │
│  8. surplus = newBalance - threshold          // 100 - 100 = 0  │
│                                                                  │
│  9. IF surplus > 0:                                              │
│     └─▶ yieldAdapter.deposit(USDC, surplus)  // restake excess  │
└─────────────────────────────────────────────────────────────────┘
                             │
                             ▼
              ┌──────────────────────────┐
              │  Transaction complete.   │
              │  User saw: one click.    │
              │  Behind scenes: unstake  │
              │  + send + restake        │
              └──────────────────────────┘
```

### 4.4 Data Flow: Background Yield Optimization

```
┌─────────────────────────────────────────────────────────────────┐
│  Backend Cron (every 5-10 minutes)                               │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  1. YIELD INDEXER                                                │
│                                                                  │
│  GET https://yields.llama.fi/pools                              │
│  Filter: chain = "Base", stablecoin = true                      │
│                                                                  │
│  Results:                                                        │
│  ┌────────────────┬───────┬────────────────────────────┐        │
│  │ Vault          │ APY   │ Address                    │        │
│  ├────────────────┼───────┼────────────────────────────┤        │
│  │ Aave USDC      │ 4.2%  │ 0xabc...                   │        │
│  │ Morpho USDC    │ 5.1%  │ 0xdef...  ← BEST           │        │
│  │ Compound USDC  │ 3.8%  │ 0x123...                   │        │
│  └────────────────┴───────┴────────────────────────────┘        │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  2. WALLET SCANNER                                               │
│                                                                  │
│  For each registered wallet:                                     │
│  • Read currentAdapter[USDC] from AutoYieldModule                │
│  • Read yieldAdapter.totalValue(USDC, wallet)                   │
│  • Compare current vault APY vs best available                   │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  3. REBALANCE DECISION                                           │
│                                                                  │
│  Wallet 0x1234:                                                  │
│  • Current: Aave USDC (4.2% APY)                                │
│  • Best: Morpho USDC (5.1% APY)                                 │
│  • Improvement: +0.9%                                            │
│  • Threshold for migration: 0.5%                                 │
│                                                                  │
│  Decision: MIGRATE (0.9% > 0.5%)                                 │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  4. BUILD & SUBMIT USEROP                                        │
│                                                                  │
│  UserOperation:                                                  │
│  • sender: wallet (0x1234)                                      │
│  • to: AutoYieldModule                                          │
│  • data: migrateStrategy(USDC, morphoAdapter)                   │
│  • signature: Backend signs with Automation Key                  │
│                                                                  │
│  Submit to bundler → Paymaster sponsors → Execute on-chain      │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  5. ON-CHAIN EXECUTION (AutoYieldModule.migrateStrategy)         │
│                                                                  │
│  Validation:                                                     │
│  ✓ Caller signed with automation key                             │
│  ✓ morphoAdapter is in allowedAdapters[]                        │
│  ✓ Operation is migrateStrategy (allowed for automation key)    │
│                                                                  │
│  Execution:                                                      │
│  1. oldAdapter.withdraw(USDC, totalValue)  // exit Aave         │
│  2. USDC.approve(morphoAdapter, balance)                         │
│  3. morphoAdapter.deposit(USDC, balance)   // enter Morpho      │
│  4. currentAdapter[USDC] = morphoAdapter                         │
│                                                                  │
│  Result: User's funds now earning 5.1% instead of 4.2%          │
│  User action required: NONE                                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. Detailed Component Specifications

### 5.1 Smart Account (Kernel v3)

**What it is:** The user's wallet contract, deployed via ZeroDev Kernel Factory.

**Responsibilities:**
- Hold user funds (USDC, vault shares, dust tokens)
- Validate UserOperations via installed validators
- Execute calls through installed executor modules
- Implement ERC-4337 interface (`validateUserOp`, etc.)

**We use Kernel because:**
- Production-ready ERC-4337 + ERC-7579 implementation
- Supports multiple validators (owner key + automation key)
- Supports executor modules (AutoYieldModule)
- Well-audited, deployed on Base

**We do NOT modify Kernel itself** — all custom logic lives in AutoYieldModule.

### 5.2 AutopilotFactory

**What it is:** Deploys new Autopilot wallets with AutoYieldModule pre-installed.

**Key function:**

```solidity
function createAccountFor(address owner, bytes32 salt) public returns (address account) {
    // 1. Build init data:
    //    - Set ECDSA validator as root (owner key)
    //    - Install AutoYieldModule as executor
    //    - Set default config (threshold, default adapter)
    //
    // 2. Call KernelFactory.createAccount(initData, salt)
    //
    // 3. Record mapping: accountOf[owner] = account
}
```

**Factory responsibilities:**
- Deploy accounts deterministically (CREATE2)
- Pre-install AutoYieldModule with safe defaults
- Register default yield adapter
- Emit events for indexing

### 5.3 AutoYieldModule (ERC-7579 Executor)

This is the core brain of the system.

#### 5.3.1 Storage

```solidity
// Per-account configuration
mapping(address account => mapping(address token => TokenStrategyConfig)) public tokenStrategies;
mapping(address account => mapping(address token => uint256)) public checkingThreshold;
mapping(address account => DustConfig) public dustConfigs;

// Automation authorization
mapping(address account => address) public automationKey;
mapping(address account => mapping(address adapter => bool)) public allowedAdapters;

// Current state
mapping(address account => mapping(address token => address)) public currentAdapter;
```

#### 5.3.2 Data Structures

```solidity
struct TokenStrategyConfig {
    address adapter;          // Current yield adapter for this token
    uint16 targetAllocationBP; // Target % in yield (e.g., 9000 = 90%)
    uint16 maxSlippageBP;      // Max slippage for migrations
    bool enabled;              // Whether auto-yield is active
}

struct DustConfig {
    address consolidationToken; // Token to consolidate dust into (USDC)
    address[] trackedTokens;    // Tokens to sweep as dust
    uint256 minSweepValue;      // Minimum USD value to trigger sweep
}
```

#### 5.3.3 Functions

**Owner-only functions (require owner key signature):**

```solidity
// Configuration
function setCheckingThreshold(address token, uint256 threshold) external;
function configureTokenStrategy(address token, TokenStrategyConfig calldata cfg) external;
function setDustConfig(DustConfig calldata cfg) external;
function setAutomationKey(address key) external;
function addAllowedAdapter(address adapter) external;
function removeAllowedAdapter(address adapter) external;

// Spending (auto-withdraws from yield if needed)
function executeWithAutoYield(
    address token,
    address to,
    uint256 amount,
    bytes calldata data
) external;

// Emergency
function flushToChecking(address token) external;
```

**Automation-allowed functions (can be signed by automation key OR owner key):**

```solidity
// Move excess checking balance into yield
function rebalance(address token) external;

// Migrate from current vault to better vault
function migrateStrategy(address token, address newAdapter) external;

// Sweep dust tokens and compound into yield
function sweepDustAndCompound() external;
```

#### 5.3.4 Core Logic: executeWithAutoYield

```solidity
function executeWithAutoYield(
    address token,
    address to,
    uint256 amount,
    bytes calldata data
) external onlyOwner {
    address account = msg.sender;
    uint256 threshold = checkingThreshold[account][token];

    // 1. Calculate how much we need in checking
    uint256 required = amount + threshold;
    uint256 checking = IERC20(token).balanceOf(account);

    // 2. Withdraw from yield if checking balance insufficient
    if (checking < required) {
        uint256 deficit = required - checking;
        _withdrawFromYield(account, token, deficit);
    }

    // 3. Execute the user's intended action
    IKernel(account).execute(to, 0, data);

    // 4. Deposit any surplus back into yield
    uint256 newChecking = IERC20(token).balanceOf(account);
    if (newChecking > threshold) {
        uint256 surplus = newChecking - threshold;
        _depositToYield(account, token, surplus);
    }
}
```

#### 5.3.5 Core Logic: migrateStrategy

```solidity
function migrateStrategy(
    address token,
    address newAdapter
) external onlyAutomationOrOwner {
    address account = msg.sender;

    // Validate new adapter is whitelisted
    require(allowedAdapters[account][newAdapter], "adapter not allowed");

    address oldAdapter = currentAdapter[account][token];
    if (oldAdapter == newAdapter) return; // Already on this vault

    // 1. Withdraw everything from old vault
    uint256 yieldBalance = IYieldAdapter(oldAdapter).totalValue(token, account);
    if (yieldBalance > 0) {
        IYieldAdapter(oldAdapter).withdraw(token, yieldBalance);
    }

    // 2. Calculate amount to deposit (respect checking threshold)
    uint256 checking = IERC20(token).balanceOf(account);
    uint256 threshold = checkingThreshold[account][token];

    if (checking > threshold) {
        uint256 toDeposit = checking - threshold;

        // 3. Deposit into new vault
        IERC20(token).approve(newAdapter, toDeposit);
        IYieldAdapter(newAdapter).deposit(token, toDeposit);
    }

    // 4. Update current adapter
    currentAdapter[account][token] = newAdapter;

    emit StrategyMigrated(account, token, oldAdapter, newAdapter);
}
```

#### 5.3.6 Authorization Modifier

```solidity
modifier onlyAutomationOrOwner() {
    address account = msg.sender;
    // The call comes through the Kernel account
    // We need to check if the original signer was owner or automation key
    // This is validated by Kernel before calling the module
    _;
}
```

**Note:** The actual authorization happens at the Kernel validation layer. Kernel checks if the UserOperation signature matches either:
1. The root validator (owner's ECDSA key) — allows all operations
2. A secondary validator configured for automation — only allows specific function selectors

### 5.4 IYieldAdapter Interface

```solidity
interface IYieldAdapter {
    /// @notice Deposit tokens into the yield strategy
    function deposit(address token, uint256 amount) external returns (uint256 shares);

    /// @notice Withdraw tokens from the yield strategy
    function withdraw(address token, uint256 amount) external returns (uint256 actualAmount);

    /// @notice Get total value deposited for an account
    function totalValue(address token, address account) external view returns (uint256);

    /// @notice Get the underlying vault address
    function getVault(address token) external view returns (address);
}
```

**Implementations we'll build:**
- `AaveV3Adapter` — wraps Aave V3 on Base
- `MorphoAdapter` — wraps Morpho Blue vaults
- `MockYieldVault` — for testing and demo

### 5.5 Paymaster

**What it is:** Sponsors gas for all Autopilot wallet operations.

**Provider:** Base Paymaster (Coinbase Developer Platform)

**Behavior:**
- Validates that the UserOp targets an Autopilot wallet
- Validates the operation is a known function (executeWithAutoYield, rebalance, etc.)
- Sponsors the gas cost
- User never sees gas fees or needs ETH

### 5.6 Backend Optimizer Service

#### 5.6.1 Components

```
┌─────────────────────────────────────────────────────────────┐
│                  BACKEND OPTIMIZER                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Yield Indexer (Cron: every 5 min)                     │ │
│  │  • Fetch /yields/pools from DefiLlama                  │ │
│  │  • Filter: chain=Base, stablecoin=true                 │ │
│  │  • Rank by APY, filter by TVL minimum                  │ │
│  │  • Store: vaultAddress → { apy, tvl, protocol }        │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Wallet Registry (Database)                            │ │
│  │  • walletAddress → { owner, currentVault, lastUpdate } │ │
│  │  • Populated when wallets are created                  │ │
│  │  • Updated after each migration                        │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Rebalance Engine (Cron: every 10 min)                 │ │
│  │  • For each wallet in registry:                        │ │
│  │    - Read on-chain: currentAdapter, yieldBalance       │ │
│  │    - Compare currentVaultAPY vs bestVaultAPY           │ │
│  │    - If delta > threshold (0.5%): queue migration      │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  UserOp Submitter                                      │ │
│  │  • Build UserOperation for migrateStrategy()           │ │
│  │  • Sign with automation key (stored securely)          │ │
│  │  • Submit to ZeroDev bundler                           │ │
│  │  • Handle retries and confirmations                    │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  API Endpoints                                         │ │
│  │  • GET /strategies - list available vaults + APYs      │ │
│  │  • GET /wallet/:address - wallet status + positions    │ │
│  │  • POST /register - register new wallet for automation │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

#### 5.6.2 Yield Indexer Details

**Data source:** DefiLlama Yields API

```
GET https://yields.llama.fi/pools

Response filtering:
- chain === "Base"
- stablecoin === true (for USDC)
- tvlUsd > 100000 (minimum TVL for safety)
- apy !== null
```

**Output format:**

```typescript
interface VaultInfo {
  address: string;        // Vault contract address
  protocol: string;       // "aave-v3", "morpho-blue", etc.
  apy: number;            // Current APY as decimal (0.05 = 5%)
  tvl: number;            // Total value locked in USD
  adapterAddress: string; // Our adapter contract for this vault
}
```

#### 5.6.3 Migration Decision Logic

```typescript
function shouldMigrate(wallet: WalletState, vaults: VaultInfo[]): MigrationDecision {
  const currentVault = vaults.find(v => v.address === wallet.currentVaultAddress);
  const bestVault = vaults.reduce((best, v) => v.apy > best.apy ? v : best);

  const apyImprovement = bestVault.apy - (currentVault?.apy ?? 0);
  const MIGRATION_THRESHOLD = 0.005; // 0.5% improvement required

  if (apyImprovement > MIGRATION_THRESHOLD) {
    return {
      shouldMigrate: true,
      fromAdapter: currentVault.adapterAddress,
      toAdapter: bestVault.adapterAddress,
      expectedApyGain: apyImprovement
    };
  }

  return { shouldMigrate: false };
}
```

---

## 6. User Flows

### 6.1 Onboarding (One-Time Setup)

```
┌─────────────────────────────────────────────────────────────────┐
│  STEP 1: Connect Wallet                                          │
│  User connects their EOA (Coinbase Wallet / MetaMask)           │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 2: Create Autopilot Wallet                                 │
│  User clicks "Create Autopilot Wallet"                          │
│  • Signs one message (authorizes wallet creation)               │
│  • Factory deploys Kernel account with AutoYieldModule          │
│  • User receives their new smart wallet address                 │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 3: Configure Autopilot                                     │
│  User sets preferences:                                          │
│  • Checking threshold: "Keep 100 USDC liquid"                   │
│  • Enable auto-yield for USDC: ✅                               │
│  • Authorize automation key: ✅                                  │
│                                                                  │
│  One signature commits all settings on-chain                    │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 4: Fund Wallet                                             │
│  User sends USDC to their smart wallet address                  │
│  • From CEX withdrawal                                          │
│  • From existing wallet                                         │
│  • (Optional) Via onramp                                         │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 5: Automation Begins                                       │
│  Backend detects new deposit:                                    │
│  • Builds UserOp: rebalance(USDC)                               │
│  • Signs with automation key                                     │
│  • Excess USDC deposited to highest-yield vault                 │
│                                                                  │
│  User action required: NONE                                      │
└─────────────────────────────────────────────────────────────────┘
```

**After onboarding, the user never needs to:**
- Click "rebalance"
- Approve vault deposits
- Monitor yields
- Sign yield optimization transactions

### 6.2 Spending Flow (Auto-Unstake)

**Scenario:** User has 500 USDC. 100 USDC checking, 400 USDC in Morpho vault. Wants to send 150 USDC.

```
User: "Send 150 USDC to 0x1234..."
                │
                ▼
┌─────────────────────────────────────────────────────────────────┐
│  Frontend: Build UserOp                                          │
│  • Function: executeWithAutoYield(USDC, recipient, 150, data)   │
│  • User signs ONCE with owner key                               │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  AutoYieldModule: executeWithAutoYield()                         │
│                                                                  │
│  State before:                                                   │
│  • checking: 100 USDC                                           │
│  • yield: 400 USDC (in Morpho)                                  │
│  • threshold: 100 USDC                                          │
│                                                                  │
│  Calculation:                                                    │
│  • required = 150 + 100 = 250 USDC                              │
│  • deficit = 250 - 100 = 150 USDC                               │
│                                                                  │
│  Actions (all in one tx):                                        │
│  1. morphoAdapter.withdraw(USDC, 150) → checking now 250 USDC   │
│  2. USDC.transfer(recipient, 150) → checking now 100 USDC       │
│  3. surplus = 100 - 100 = 0, no redeposit needed                │
│                                                                  │
│  State after:                                                    │
│  • checking: 100 USDC ✓ (threshold maintained)                  │
│  • yield: 250 USDC                                              │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
              ┌──────────────────────────┐
              │  User experience:        │
              │  • Clicked "Send"        │
              │  • Signed once           │
              │  • Transfer complete     │
              │                          │
              │  User did NOT:           │
              │  • Click "unstake"       │
              │  • Sign vault withdrawal │
              │  • Wait for unstake tx   │
              │  • Then sign transfer    │
              └──────────────────────────┘
```

### 6.3 Background Yield Optimization

**Scenario:** User's funds are in Aave (4.2% APY). Morpho now offers 5.5% APY.

```
┌─────────────────────────────────────────────────────────────────┐
│  Backend Cron (user is asleep, not using app)                   │
│                                                                 │
│  1. Yield Indexer fetches latest APYs                           │
│     • Aave USDC: 4.2%                                           │
│     • Morpho USDC: 5.5% ← NEW BEST                              │
│                                                                 │
│  2. Rebalance Engine scans user's wallet                        │
│     • Current: Aave (4.2%)                                      │
│     • Best: Morpho (5.5%)                                       │
│     • Delta: +1.3% > 0.5% threshold                             │
│     • Decision: MIGRATE                                         │
│                                                                 │
│  3. UserOp Submitter                                            │
│     • Builds: migrateStrategy(USDC, morphoAdapter)              │
│     • Signs with automation key                                  │
│     • Submits to bundler                                         │
│                                                                  │
│  4. On-chain execution                                           │
│     • Withdraw from Aave                                         │
│     • Deposit to Morpho                                          │
│     • Update currentAdapter                                      │
│                                                                  │
│  User wakes up:                                                  │
│  • Dashboard shows "Now earning 5.5% on Morpho"                 │
│  • User action required: NONE                                    │
└─────────────────────────────────────────────────────────────────┘
```

### 6.4 Dust Sweep

**Scenario:** User received airdrops of random tokens. Wants to consolidate.

```
┌─────────────────────────────────────────────────────────────────┐
│  OPTION A: Manual Sweep                                          │
│                                                                  │
│  User clicks "Clean Up Wallet" in dashboard                     │
│  • Signs one transaction                                         │
│  • All dust tokens swapped to USDC via Aerodrome                │
│  • USDC deposited to yield vault                                │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  OPTION B: Automated Sweep                                       │
│                                                                  │
│  Backend detects dust tokens above threshold                    │
│  • Builds UserOp: sweepDustAndCompound()                        │
│  • Signs with automation key                                     │
│  • Dust swapped and compounded                                  │
│                                                                  │
│  User action required: NONE                                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## 7. Security Model

### 7.1 Automation Key Constraints

The automation key is powerful but constrained:

| Can Do | Cannot Do |
|--------|-----------|
| Call `rebalance()` | Call `transfer()` or send funds externally |
| Call `migrateStrategy()` to whitelisted adapters | Add new adapters to whitelist |
| Call `sweepDustAndCompound()` | Change checking thresholds |
| Move funds between approved vaults | Withdraw funds to arbitrary addresses |

**If automation key is compromised:**
- Attacker can only move funds between pre-approved, audited vaults
- Attacker cannot drain funds to their own address
- User can revoke automation key anytime via `setAutomationKey(address(0))`

### 7.2 Adapter Whitelist

Only pre-approved adapters can receive funds:

```solidity
mapping(address account => mapping(address adapter => bool)) public allowedAdapters;

function migrateStrategy(address token, address newAdapter) external {
    require(allowedAdapters[msg.sender][newAdapter], "adapter not allowed");
    // ...
}
```

**Adapters are whitelisted by:**
1. Factory sets default adapters on account creation
2. User can add adapters via `addAllowedAdapter()` (owner key only)

### 7.3 Threshold Protection

The checking threshold is always respected:

```solidity
// In migrateStrategy and rebalance
uint256 checking = IERC20(token).balanceOf(account);
uint256 threshold = checkingThreshold[account][token];

uint256 toDeposit = checking > threshold ? checking - threshold : 0;
```

Automation cannot deposit the user's last dollar — the threshold amount stays liquid.

### 7.4 No Proxy Upgrades

Contracts are not upgradeable. This prevents:
- Malicious upgrades that change security model
- Backdoors added after audit
- Rug pulls via admin functions

### 7.5 Summary: Defense in Depth

```
┌─────────────────────────────────────────────────────────────────┐
│                    SECURITY LAYERS                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Layer 1: Key Separation                                         │
│  └─ Automation key cannot transfer funds externally              │
│                                                                  │
│  Layer 2: Adapter Whitelist                                      │
│  └─ Funds can only move to pre-approved vaults                   │
│                                                                  │
│  Layer 3: Threshold Protection                                   │
│  └─ Checking balance always maintained                           │
│                                                                  │
│  Layer 4: User Override                                          │
│  └─ Owner key can revoke automation anytime                      │
│                                                                  │
│  Layer 5: Non-Upgradeable                                        │
│  └─ Contract logic cannot be changed after deployment            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 8. Providers & Stack

### 8.1 Smart Account Layer

| Component | Provider | Notes |
|-----------|----------|-------|
| Smart Account | ZeroDev Kernel v3 | ERC-4337 + ERC-7579 compliant |
| Account Factory | ZeroDev KernelFactory | Deployed on Base |
| ECDSA Validator | ZeroDev ECDSAValidator | For owner key validation |

### 8.2 Bundler & Gas

| Component | Provider | Notes |
|-----------|----------|-------|
| Bundler | ZeroDev Bundler | Primary; fallback: Pimlico |
| Paymaster | Base Paymaster (CDP) | Full gas sponsorship |
| EntryPoint | ERC-4337 v0.7 | Standard deployment |

### 8.3 Yield Sources

| Protocol | Type | Token | Adapter |
|----------|------|-------|---------|
| Aave V3 | Lending | USDC | `AaveV3Adapter.sol` |
| Morpho Blue | Lending | USDC | `MorphoAdapter.sol` |
| Moonwell | Lending | USDC | `MoonwellAdapter.sol` (stretch) |
| Mock Vault | Testing | USDC | `MockYieldVault.sol` |

### 8.4 DEX (Dust Swaps)

| Component | Provider |
|-----------|----------|
| Primary Router | Aerodrome |
| Fallback Router | Uniswap V3 |

### 8.5 Data APIs

| Data | Source |
|------|--------|
| Yield APYs | DefiLlama `/yields/pools` |
| Vault TVL | DefiLlama `/yields/pools` |
| Token Prices | DefiLlama `/prices` or Coingecko |

### 8.6 Frontend

| Component | Technology |
|-----------|------------|
| Framework | Next.js 14 |
| Wallet Connection | Coinbase Wallet SDK |
| Smart Account SDK | ZeroDev SDK |
| Chain Interaction | viem + wagmi |
| UI Components | shadcn/ui |

### 8.7 Backend

| Component | Technology |
|-----------|------------|
| Runtime | Node.js |
| Framework | Express or Hono |
| Database | PostgreSQL (wallet registry) |
| Cron | node-cron or Vercel Cron |
| Hosting | Vercel / Railway |

---

## 9. Deliverables & Work Breakdown

### 9.1 Smart Contracts (Jackson)

| ID | Contract | Description | Dependencies |
|----|----------|-------------|--------------|
| C1 | `AutoYieldModule.sol` | Core module with all yield logic | IYieldAdapter |
| C2 | `AutopilotFactory.sol` | Deploys wallets with module installed | Kernel, AutoYieldModule |
| C3 | `IYieldAdapter.sol` | Interface for vault adapters | — |
| C4 | `MockYieldVault.sol` | ERC-4626 mock for testing | IYieldAdapter |
| C5 | `AaveV3Adapter.sol` | Adapter for Aave V3 on Base | IYieldAdapter |
| C6 | `MorphoAdapter.sol` | Adapter for Morpho Blue | IYieldAdapter |
| C7 | Dual-key validation | Configure Kernel for automation key | Kernel |

**Acceptance Criteria:**
- Wallet deploys with module pre-installed
- `executeWithAutoYield` auto-unstakes and re-stakes in one tx
- `migrateStrategy` moves funds between whitelisted vaults
- Automation key can only call allowed functions
- All operations are gasless via paymaster

### 9.2 Backend (Bryce)

| ID | Component | Description | Dependencies |
|----|-----------|-------------|--------------|
| B1 | Yield Indexer | Cron polling DefiLlama, stores best vaults | DefiLlama API |
| B2 | Wallet Registry | Database of deployed wallets | PostgreSQL |
| B3 | Rebalance Engine | Compares positions, decides migrations | B1, B2 |
| B4 | UserOp Builder | Builds migrateStrategy userOps | ZeroDev SDK |
| B5 | Automation Key Manager | Secure key storage and signing | — |
| B6 | API: `/strategies` | Returns available vaults + APYs | B1 |
| B7 | API: `/wallet/:address` | Returns wallet state + positions | B2, chain reads |
| B8 | Dust Token Service | Returns dust token list + metadata | — |

**Acceptance Criteria:**
- Cron runs every 5-10 minutes
- Migrations trigger when APY delta > 0.5%
- UserOps submit successfully to bundler
- API returns current best vault + APY

### 9.3 Frontend (Logan)

| ID | Page/Feature | Description | Dependencies |
|----|--------------|-------------|--------------|
| F1 | Landing Page | Explain product, connect wallet | Coinbase Wallet SDK |
| F2 | Wallet Creation | Create Autopilot wallet flow | Factory, ZeroDev SDK |
| F3 | Dashboard | Show checking + yield balances | Chain reads, Backend API |
| F4 | Settings | Configure threshold, tokens, automation | AutoYieldModule |
| F5 | Send | Transfer form with executeWithAutoYield | AutoYieldModule |
| F6 | Transaction History | Show past operations | Chain events |
| F7 | Yield Display | Show current vault, APY, earnings | Backend API |

**Acceptance Criteria:**
- Wallet creation in < 3 clicks
- Dashboard shows accurate balances
- Payments execute with single signature
- All operations gasless

### 9.4 Demo Infrastructure (Robby)

| ID | Component | Description |
|----|-----------|-------------|
| R1 | Wallet Context | React context for wallet state |
| R2 | Balance Polling | Real-time balance updates |
| R3 | Demo Reset Script | Reset wallet state for demos |
| R4 | Guided Tour | Coach marks explaining UX |
| R5 | APY Visualization | Chart showing yield over time |

**Acceptance Criteria:**
- Demo runs start-to-finish in < 3 minutes
- Reset script works reliably
- Balance updates reflect on-chain state accurately

---

## 10. Demo Script

### Scene 1: Setup (30 seconds)

1. Show landing page: "Autopilot Wallet — Your money works while you sleep"
2. Connect Coinbase Wallet
3. Click "Create Autopilot Wallet"
4. Sign one message
5. Show new wallet address

### Scene 2: Fund & Configure (30 seconds)

1. Send 500 USDC from test EOA to Autopilot wallet
2. Open Settings:
   - Set threshold: 100 USDC
   - Enable USDC auto-yield: ✅
   - Authorize automation: ✅
3. Sign config transaction

### Scene 3: Watch Auto-Yield (30 seconds)

1. Dashboard shows: 500 USDC in checking
2. Backend detects deposit
3. *Animation*: 400 USDC moves to yield
4. Dashboard now shows:
   - Checking: 100 USDC
   - Yield: 400 USDC (Morpho, 5.2% APY)
5. **"No buttons clicked. No signatures. It just happened."**

### Scene 4: Spend with Auto-Unstake (45 seconds)

1. Go to Send screen
2. Enter: "Send 150 USDC to 0x..." (any test address)
3. Click "Send"
4. Sign once
5. *Animation shows*:
   - Module checks balance (100 USDC)
   - Module calculates deficit (150 + 100 - 100 = 150)
   - Module withdraws 150 from Morpho
   - Module sends 150 to recipient
6. Dashboard shows:
   - Checking: 100 USDC
   - Yield: 250 USDC
7. Show block explorer: transfer confirmed
8. **"One click. One signature. Auto-unstake + send + maintain threshold."**

### Scene 5: Background Optimization (30 seconds)

1. *Simulate time passing*
2. Backend logs show:
   - "Aave APY increased to 5.8%"
   - "Migration triggered: Morpho → Aave"
3. Dashboard updates:
   - Yield: 250 USDC (Aave, 5.8% APY)
4. **"User was asleep. Funds automatically moved to better yield."**

### Scene 6: Dust Sweep (30 seconds)

1. Send random airdrop tokens to wallet
2. Dashboard shows dust tokens
3. Click "Clean Up Wallet"
4. Sign once
5. *Animation*: Dust → USDC → Yield
6. Dashboard: Yield balance increased
7. **"Trash tokens converted to earning yield. One click."**

### Closing (15 seconds)

- Show block explorer: one transaction for entire payment flow
- Recap: "Zero gas. Zero manual yield management. True autopilot."

---

## 11. Success Metrics

| Metric | Target |
|--------|--------|
| Wallet creation | < 3 clicks, < 30 seconds |
| Payment with auto-unstake | 1 signature, < 15 seconds |
| Background rebalance | 0 user actions |
| Gas cost to user | $0 |
| Demo completion | < 4 minutes |

---

## 12. Open Questions / Stretch Goals

### Stretch Goals (if time permits)

- [ ] Support WETH auto-yield
- [ ] LP position support (Aerodrome)
- [ ] Telegram notifications for rebalances
- [ ] Historical yield chart
- [ ] Multiple wallet support per user

### Open Questions

1. **Session key vs. secondary validator?** Need to confirm Kernel v3 supports the exact permission model we need for automation key
2. **Yield threshold for migration?** Currently 0.5% — should this be configurable per user?
3. **Dust swap slippage?** What's acceptable for dust consolidation?

---

## Appendix A: Contract Addresses (Base Mainnet)

*To be filled after deployment*

| Contract | Address |
|----------|---------|
| KernelFactory | `0x2577507b78c2008Ff367261CB6285d44ba5eF2E9` |
| ECDSAValidator | `0x845ADb2C711129d4f3966735eD98a9F09fC4cE57` |
| EntryPoint | `0x0000000071727De22E5E9d8BAf0edAc6f37da032` |
| AutopilotFactory | TBD |
| AutoYieldModule | TBD |
| AaveV3Adapter | TBD |
| MorphoAdapter | TBD |

## Appendix B: API Endpoints

### Backend API

```
GET  /strategies
     Returns: { vaults: [{ address, protocol, apy, tvl, adapterAddress }] }

GET  /strategies/:token
     Returns: { bestVault: { ... }, allVaults: [...] }

GET  /wallet/:address
     Returns: { checking, yield, totalValue, currentVault, automationEnabled }

POST /register
     Body: { walletAddress, ownerAddress }
     Returns: { success: true }

GET  /dust-tokens
     Returns: { tokens: [{ address, symbol, minSweepValue }] }
```

### DefiLlama API (External)

```
GET https://yields.llama.fi/pools
    Filter: chain=Base, stablecoin=true

GET https://yields.llama.fi/chart/:poolId
    Returns: historical APY data
```
