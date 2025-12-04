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
| **Owner Key** | The user's EOA (MetaMask, Coinbase Wallet). Used for SIGNING only — proves identity. Does not hold user funds. |
| **Automation Key (Session Key)** | A backend-controlled key with strict limits. Can ONLY call `rebalance()`, `migrateStrategy()`, and `sweepDustAndCompound()`. Cannot transfer funds out. Implemented as a session key with scoped permissions. |
| **AutoYieldModule (7579)** | The brain of the wallet. Stores user config, executes yield logic, validates automation key permissions. |
| **Checking Threshold** | Minimum balance to keep liquid (e.g., 100 USDC). Everything above goes to yield. |
| **Yield Adapter** | A translation layer contract that converts our standard interface (`deposit`/`withdraw`/`totalValue`) to a specific protocol's interface (Aave, Morpho, etc.). Does NOT mock or replace real vaults — it connects to them. |
| **Backend Optimizer** | Cron service that monitors yields, compares to user positions, and submits rebalance operations. |
| **Paymaster** | Sponsors gas for all wallet operations. User never needs ETH. |

---

## 3.1 Critical Architecture Clarification: EOA vs Smart Wallet

**The smart wallet holds all funds. The EOA is only used for signing.**

This is a key concept that can be confusing:

```
┌─────────────────────────────────────────────────────────────────────┐
│                     USER'S WALLET SETUP                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   EOA (User's MetaMask / Coinbase Wallet)                           │
│   ───────────────────────────────────────                           │
│   Address: 0xUser123...                                              │
│   Purpose: SIGNING ONLY (proves "I am the owner")                   │
│   Holds: Nothing (or minimal ETH, but not needed with paymaster)    │
│   Role: Signs UserOperations to authorize transactions              │
│                                                                      │
│                         │                                            │
│                         │ signs transactions                         │
│                         ▼                                            │
│                                                                      │
│   Smart Wallet (Autopilot Wallet - Kernel Account)                  │
│   ────────────────────────────────────────────────                  │
│   Address: 0xSmartWallet456...                                       │
│   Purpose: HOLDS ALL USER FUNDS                                      │
│   Holds: USDC, yield positions, dust tokens, everything             │
│   Role: Executes transactions when owner's signature is valid       │
│   Features: Gasless, batching, auto-yield, session keys             │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

**Why not just use the EOA directly?**

Because EOAs can't do the features we need:

| Feature | EOA (MetaMask) | Smart Wallet |
|---------|----------------|--------------|
| Hold funds | ✓ | ✓ |
| Gasless transactions | ✗ | ✓ (paymaster) |
| Auto-withdraw from yield when spending | ✗ | ✓ (module logic) |
| Batch multiple actions in one tx | ✗ | ✓ |
| Session keys for automation | ✗ | ✓ |
| Social recovery | ✗ | ✓ |

**The EOA is like a signature/ID card. The smart wallet is like a bank account.**

You don't keep cash in your signature. You use your signature to authorize transactions from your bank account.

---

## 3.2 What Are Yield Adapters? (Not Mocks)

**Adapters are translation layers, not mock vaults.**

Real yield vaults (Aave, Morpho) are **already deployed on Base** by their respective teams. They hold billions in TVL. We don't create or mock them.

What we create are **adapters** — small contracts that translate OUR standard interface to THEIR specific interface:

```
AutoYieldModule (our code)
         │
         │ Calls: adapter.deposit(USDC, 1000)
         │        adapter.withdraw(USDC, 500)
         │        adapter.totalValue(USDC, account)
         │
         ▼
    ┌─────────────────────────────────────────────────────────────┐
    │                      ADAPTERS (our code)                     │
    │                                                              │
    │   ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
    │   │AaveV3Adapter│  │MorphoAdapter│  │ MockYieldVault      │ │
    │   │             │  │             │  │ (for testing only)  │ │
    │   │ Translates: │  │ Translates: │  │                     │ │
    │   │ deposit() → │  │ deposit() → │  │ Fake vault we       │ │
    │   │ aave.supply │  │ morpho.     │  │ control for demos   │ │
    │   │             │  │ supply()    │  │                     │ │
    │   └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘ │
    └──────────┼────────────────┼────────────────────┼────────────┘
               │                │                    │
               ▼                ▼                    ▼
         ┌──────────┐    ┌──────────┐         ┌──────────┐
         │ Aave V3  │    │ Morpho   │         │ Mock     │
         │ on Base  │    │ on Base  │         │ Contract │
         │ (REAL)   │    │ (REAL)   │         │ (FAKE)   │
         │ $2B+ TVL │    │ $1B+ TVL │         │ for demo │
         └──────────┘    └──────────┘         └──────────┘
```

**MockYieldVault** exists only for:
- Development without needing testnet tokens
- Hackathon demos where you want to instantly "simulate" yield accrual
- Unit testing

For production (and ideally the hackathon demo), you use real adapters pointing to real protocols.

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

### 4.2 Dual-Key Validation Model (Session Keys)

The automation key is implemented as a **Session Key** — a cryptographically restricted key that can only perform specific actions. This allows the backend to automate yield optimization without the user needing to approve each transaction, while ensuring the backend can never steal funds.

**How Session Keys Work:**

When the backend's session key is created, it's registered on-chain with explicit permissions:

```
Session Key Permissions (set once during wallet setup):
───────────────────────────────────────────────────────
✓ Can call: AutoYieldModule.rebalance()
✓ Can call: AutoYieldModule.migrateStrategy()
    BUT only to these adapters: [AaveAdapter, MorphoAdapter]
✓ Can call: AutoYieldModule.sweepDustAndCompound()

✗ Cannot call: transfer()
✗ Cannot call: executeWithAutoYield()
✗ Cannot call: any configuration functions
✗ Cannot call: anything else
```

The smart wallet **enforces these rules on-chain**. Even if a hacker steals the session key, they can only call those specific functions.

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
│  │  Signing: MetaMask/Coinbase Wallet popup, user approves      │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │              SESSION KEY (Backend Automation)                │    │
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
│  │  Signing: Backend signs automatically, NO user interaction   │    │
│  │  User is never prompted — automation happens silently.       │    │
│  │                                                              │    │
│  │  Safety: Even if compromised, can only move funds between    │    │
│  │          pre-approved vaults. Cannot drain wallet.           │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

**Security: What If Session Key Is Compromised?**

```
Scenario: Hacker steals the backend's session key

Hacker tries: transfer(USDC, hackerAddress, allFunds)
  → Smart wallet: "Is transfer() allowed for session key? NO"
  → Transaction REVERTS — hacker gets nothing

Hacker tries: migrateStrategy(USDC, hackerControlledVault)
  → Smart wallet: "Is hackerControlledVault in allowedAdapters? NO"
  → Transaction REVERTS — hacker gets nothing

What hacker CAN do: migrateStrategy(USDC, morphoAdapter)
  → Funds move from Aave to Morpho (both legitimate vaults)
  → User's funds are SAFE — just in a different pre-approved vault
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
- `MorphoAdapter` — wraps Morpho Blue MetaMorpho vaults (ERC-4626 compliant, highest APY)
- `MockYieldVault` — for testing and demo

**Note:** Aave and Moonwell adapters are not built for MVP. The yield aggregator fetches their rates for UI display, but all actual deposits go to Morpho vaults which currently offer the best yields (5-7% APY).

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
│  │  Yield Aggregator (Cron: every 5 min)                  │ │
│  │  • Query Morpho GraphQL API directly                   │ │
│  │  • Query Aave GraphQL API directly                     │ │
│  │  • Merge, filter by TVL, sort by APY                   │ │
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
│  │  • Sign with session key (stored securely)             │ │
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

#### 5.6.2 Yield Aggregator Details

**Data sources:** Direct protocol GraphQL APIs (NOT DefiLlama)

We query each protocol's official API to get real-time vault data:

| Protocol | API Endpoint | Data Returned |
|----------|--------------|---------------|
| Morpho | `https://blue-api.morpho.org/graphql` | Vault address, netApy, netApyWithoutRewards, rewards, TVL |
| Aave | `https://api.v3.aave.com/graphql` | Vault address, vaultApr, supplyApy, TVL, fees |

**Morpho GraphQL Queries:**

```graphql
# Step 1: Get asset address for USDC on Base
query GetChainAsset($chainId: Int!, $assetSymbol: String!) {
  assets(where: {chainId_in: [$chainId], symbol_in: [$assetSymbol]}) {
    items { address }
  }
}

# Step 2: List all vaults for that asset
query ListVaults($skip: Int!, $chainId: Int!, $assetAddress: String!) {
  vaults(first: 1000, skip: $skip, where: {chainId_in: [$chainId], assetAddress_in: [$assetAddress]}) {
    items {
      name address symbol
      warnings { type level }
      state {
        totalAssetsUsd
        netApy                  # Total APY including rewards
        netApyWithoutRewards    # Base lending APY
        rewards {
          supplyApr
          asset { address symbol }
        }
      }
    }
    pageInfo { count limit }
  }
}
```

**Aave GraphQL Query:**

```graphql
query GetVaults($cursor: Cursor) {
  vaults(request: { criteria: { ownedBy: [] }, pageSize: FIFTY, cursor: $cursor }) {
    items {
      address
      shareName
      shareSymbol
      chainId
      vaultApr { value }        # Vault APR after fees
      fee { value }
      balance {
        amount { value }
        usd                     # TVL in USD
      }
      usedReserve {
        underlyingToken { symbol address }
        supplyInfo { apy { value } }  # Base supply APY
      }
    }
    pageInfo { next prev }
  }
}
```

**Output format (unified across protocols):**

```typescript
interface Vault {
  // Identification
  name: string;           // e.g., "Steakhouse USDC"
  address: string;        // Vault contract address
  symbol: string;         // e.g., "steakUSDC"

  // Yield data
  apy: number;            // Total effective APY (decimal: 0.05 = 5%)
  baseApy: number;        // Base lending APY without rewards
  rewards: Reward[];      // Additional reward tokens

  // Risk/size data
  tvlUsd: number;         // Total value locked

  // Metadata
  source: "morpho" | "aave";
  chainId: number;
  underlyingAsset: string; // "USDC"
}

interface Reward {
  symbol: string;         // e.g., "MORPHO"
  apy: number;            // Reward APY contribution
}
```

**Aggregator Logic:**

```typescript
async function getBestVaults(options: {
  assetSymbol?: string;    // Default: "USDC"
  chainId?: number;        // Default: 8453 (Base)
  minTvlUsd?: number;      // Filter small/test vaults
  excludeWarnings?: boolean; // Skip Morpho vaults with warnings
  topN?: number;           // Return top N vaults
}): Promise<Vault[]> {

  // 1. Fetch from both sources in parallel
  const [morphoVaults, aaveVaults] = await Promise.all([
    getMorphoVaults(assetSymbol, chainId, excludeWarnings),
    getAaveVaults(assetSymbol, chainId),
  ]);

  // 2. Merge all vaults
  let allVaults = [...morphoVaults, ...aaveVaults];

  // 3. Filter by minimum TVL
  if (minTvlUsd > 0) {
    allVaults = allVaults.filter(v => v.tvlUsd >= minTvlUsd);
  }

  // 4. Sort by APY (highest first)
  allVaults.sort((a, b) => b.apy - a.apy);

  // 5. Return top N
  return topN ? allVaults.slice(0, topN) : allVaults;
}
```

**Example output:**

```
[MORPHO] Steakhouse USDC
  Address: 0x123...
  APY: 8.45% (base: 3.20%)
  TVL: $12,345,678
  └─ MORPHO: +2.10%
  └─ wstETH: +0.35%

[AAVE] Aave USDC Vault Shares
  Address: 0x21C...
  APY: 3.16% (base: 3.26%)
  TVL: $2,001,234
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

**Important: The user's existing wallet (MetaMask/Coinbase Wallet) is used for SIGNING only. All funds go to the NEW smart wallet.**

```
┌─────────────────────────────────────────────────────────────────┐
│  STEP 1: Connect Existing Wallet (for signing)                   │
│                                                                  │
│  User connects their EOA (Coinbase Wallet / MetaMask)           │
│                                                                  │
│  This wallet will NOT hold funds — it only proves identity.     │
│  The EOA address becomes the "owner" who can authorize txs.     │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 2: Create Autopilot Wallet (Smart Account)                 │
│                                                                  │
│  User clicks "Create Autopilot Wallet"                          │
│                                                                  │
│  Behind the scenes:                                              │
│  1. Frontend reads user's EOA address (0xUser123...)            │
│  2. Frontend calls: factory.createAccountFor(eoaAddress, salt)  │
│  3. Factory deploys Kernel account configured with:             │
│     • ECDSA Validator: 0xUser123 is the owner/signer            │
│     • AutoYieldModule: pre-installed as executor                │
│  4. User receives their NEW smart wallet address (0xSmart456...)│
│                                                                  │
│  The smart wallet is where ALL funds will live.                 │
│  The EOA (0xUser123) is only used to SIGN transactions.         │
│                                                                  │
│  User signs one message to authorize deployment.                │
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
│  STEP 4: Fund the SMART WALLET (not the EOA!)                    │
│                                                                  │
│  User sends USDC to their SMART WALLET address (0xSmart456...)  │
│  NOT to their MetaMask/Coinbase Wallet address!                 │
│                                                                  │
│  Funding options:                                                │
│  • From CEX withdrawal → send to 0xSmart456                     │
│  • From existing wallet → transfer to 0xSmart456                │
│  • (Optional) Via onramp                                         │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 5: Automation Begins                                       │
│  Backend detects new deposit:                                    │
│  • Builds UserOp: rebalance(USDC)                               │
│  • Signs with session key (automation key)                       │
│  • Excess USDC deposited to highest-yield vault                 │
│                                                                  │
│  User action required: NONE                                      │
└─────────────────────────────────────────────────────────────────┘
```

**The Two Addresses Explained:**

| Address | What It Is | Holds Funds? | Used For |
|---------|------------|--------------|----------|
| `0xUser123...` | User's EOA (MetaMask) | NO | Signing transactions |
| `0xSmart456...` | Autopilot Smart Wallet | YES | Holding USDC, yield positions |

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

**Backend Yield Aggregator (for display/comparison):**

The yield fetcher aggregates data from multiple protocols for UI display and rate comparison:

| Protocol | Type | Token | Status |
|----------|------|-------|--------|
| Morpho Blue | Lending | USDC | Integrated (GraphQL API) |
| Aave V3 | Lending | USDC | Integrated (GraphQL API) |
| Moonwell | Lending | USDC | Integrated (Moonwell SDK) |

**Smart Contract Adapters (for actual deposits):**

For MVP, we only build the Morpho adapter since Morpho vaults consistently offer the highest APY (5-7% vs Aave's ~3% and Moonwell's ~5.8%). All Morpho MetaMorpho vaults are ERC-4626 compliant, making integration straightforward.

| Protocol | Adapter | Status |
|----------|---------|--------|
| Morpho Blue | `MorphoAdapter.sol` | **Build this** |
| Aave V3 | — | Skip (lower APY, more complex) |
| Moonwell | — | Skip (lower APY, Compound-style interface) |
| Mock Vault | `MockYieldVault.sol` | For testing only |

**Rationale:** Building additional adapters for Aave and Moonwell adds development time for protocols that currently offer lower yields. The UI can still display all three protocols' rates to show the aggregator is "smart" while the contracts only interact with the winning protocol (Morpho).

### 8.4 DEX (Dust Swaps)

| Component | Provider |
|-----------|----------|
| Primary Router | Aerodrome |
| Fallback Router | Uniswap V3 |

### 8.5 Data APIs

**Primary: Direct Protocol APIs (used for yield data)**

| Protocol | API Endpoint | Data |
|----------|--------------|------|
| Morpho | `https://blue-api.morpho.org/graphql` | Vault APYs, TVL, rewards, addresses |
| Aave | `https://api.v3.aave.com/graphql` | Vault APYs, TVL, fees, addresses |

**Secondary: Price Data (for dust valuation)**

| Data | Source |
|------|--------|
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
| C5 | `MorphoAdapter.sol` | Adapter for Morpho Blue (ERC-4626) | IYieldAdapter |
| C6 | Dual-key validation | Configure Kernel for automation key | Kernel |

**Note:** We only build the Morpho adapter for MVP. Morpho MetaMorpho vaults are ERC-4626 compliant and currently offer the best APY (5-7%). The yield aggregator fetches rates from Morpho, Aave, and Moonwell for UI display, but contracts only deposit to Morpho vaults.

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

1. ~~**Session key vs. secondary validator?**~~ **RESOLVED:** Using session keys with scoped permissions for automation. See Section 4.2.
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

### Protocol GraphQL APIs (External)

**Morpho Blue API:**
```
POST https://blue-api.morpho.org/graphql

# Get USDC address on Base
query GetChainAsset($chainId: Int!, $assetSymbol: String!) {
  assets(where: {chainId_in: [$chainId], symbol_in: [$assetSymbol]}) {
    items { address }
  }
}

# List vaults for asset
query ListVaults($skip: Int!, $chainId: Int!, $assetAddress: String!) {
  vaults(first: 1000, skip: $skip, where: {...}) {
    items { name, address, symbol, state { netApy, totalAssetsUsd, rewards {...} } }
  }
}
```

**Aave API:**
```
POST https://api.v3.aave.com/graphql

query GetVaults($cursor: Cursor) {
  vaults(request: { criteria: { ownedBy: [] }, pageSize: FIFTY, cursor: $cursor }) {
    items { address, shareName, chainId, vaultApr { value }, balance { usd }, usedReserve {...} }
  }
}
```
