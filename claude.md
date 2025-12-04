# Autopilot Wallet - Claude Instructions

## CRITICAL: Read the PRD First

**Before writing ANY code, Claude MUST read and follow `hackathon-prd.md` in the repository root.**

The PRD is the single source of truth for:
- System architecture
- Contract interfaces and function signatures
- Component responsibilities
- File naming conventions
- Provider/SDK selections
- Scope boundaries

**Any code that contradicts the PRD is incorrect and must not be written.**

---

## Project Summary

This repository implements Autopilot Wallet, a smart wallet deployed on Base that automatically manages idle capital.
The wallet behaves like a normal self-custodial wallet (send/receive/pay), but internally it:

- Keeps a checking balance in USDC
- Routes any excess into yield strategies
- Withdraws from yield automatically when a user pays
- Optionally sweeps dust tokens into USDC and compounds them into yield

All automation happens inside the wallet using ERC-4337 + ERC-7579, not through off-chain custody, vaults, or bots.

The core interaction is a single gasless userOperation that can internally:

`withdraw → pay → re-deposit`

This is the expected and intended behavior.

---

## Mandatory PRD Compliance

### Contract Files (from PRD Section 8.1)

The following contracts MUST exist with these exact names:

| Contract | Purpose |
|----------|---------|
| `AutoYieldAccount.sol` | Minimal 4337 account (or Kernel fork) |
| `AutoYieldAccountFactory.sol` | Deploys accounts, installs AutoYieldModule |
| `AutoYieldModule.sol` | Config, executeWithAutoYield, rebalance, flushToChecking, sweepDustAndCompound |
| `IYieldAdapter.sol` | Interface for yield adapters |
| `VaultAdapter.sol` | USDC -> MockYieldVault adapter |
| `MockYieldVault.sol` | ERC-4626-like vault for demo |
| `AutoYieldPaymaster.sol` | Gas sponsorship |
| `MockDexRouter.sol` | (Optional) For dust swap / LP demo |

**Do NOT create contracts outside this list without explicit approval.**

### Function Signatures (from PRD Section 5.2.2)

The AutoYieldModule MUST implement these functions exactly:

```solidity
// Config
function setCheckingThreshold(address token, uint256 threshold) external;
function configureTokenStrategy(address token, TokenStrategyConfig calldata cfg) external;
function setDustConfig(DustConfig calldata cfg) external;

// Core execution wrapper
function executeWithAutoYield(
    address token,
    address to,
    uint256 amount,
    bytes calldata data
) external;

// Maintenance
function rebalance() external;
function flushToChecking(address token) external;
function sweepDustAndCompound() external;
```

### Data Structures (from PRD Section 5.2.2)

```solidity
struct TokenStrategyConfig {
    address adapter;
    uint16 targetLPBP;
    uint16 maxAllocationBP;
    bool enabled;
}

struct DustConfig {
    address consolidationToken;
    address[] trackedTokens;
}
```

### IYieldAdapter Interface (from PRD Section 5.3.1)

```solidity
interface IYieldAdapter {
    function deposit(uint256 amount) external;
    function withdraw(uint256 amount) external returns (uint256 withdrawn);
    function totalValue() external view returns (uint256);
}
```

---

## Provider Decisions (Final)

These are locked unless explicitly changed by the repo maintainer:

| Component | Provider |
|-----------|----------|
| Smart account | ZeroDev Kernel v3 |
| Module standard | ERC-7579 (Rhinestone interface) |
| Network | Base (Base Sepolia during development) |
| Bundler | Base bundler endpoint |
| Gas sponsorship | Base Paymaster (Coinbase Developer Platform) |
| Primary token | USDC (native on Base) |
| Yield source | ERC-4626 vault (Aerodrome/Beefy) or MockYieldVault |
| Dust swaps | Aerodrome router (fallback: Uniswap v3 Base) |
| Frontend SDKs | OnchainKit + viem + Wagmi + Coinbase Wallet SDK |

**Do NOT substitute or add providers without explicit approval.**

---

## Expected Contract Behavior

All automation flows through:

```solidity
executeWithAutoYield(token, to, amount, data)
```

Internal logic MUST follow this exact sequence:

1. Check if spendable balance >= amount + threshold
2. If not, withdraw the deficit from yield via the adapter
3. Execute the user's transfer/purchase call
4. After execution, if balance exceeds threshold, deposit surplus into yield
5. Optionally sweep dust → consolidate → deposit

All steps happen within the same userOp.

**There should NEVER be a design that:**

- Relies on off-chain bots to unstake before spending
- Requires the user to manually move funds in/out of yield
- Triggers a second transaction after payment

---

## Scope Boundaries

### In Scope

- Configurable check-balance threshold per token
- Per-token strategy enable/disable
- Dust consolidation into USDC
- Multicall sequencing inside 4337
- Gasless UX via paymaster

### NOT In Scope (requires explicit approval)

- Switching to Safe/Argent/Biconomy stack
- Using non-Base networks
- Custodial vault pooling
- Leveraged yield strategies
- Proxy upgrade patterns
- Moving logic off-chain when it should be in the module
- Generic yield aggregator across all DeFi
- Auto-yield for tokens beyond USDC (and optionally WETH)
- Off-chain cron infrastructure

---

## Rules for AI Contributions

**These rules are MANDATORY. Violations are unacceptable.**

### Before Writing Any Code

1. **Read `hackathon-prd.md`** - This is required before any implementation
2. **Verify the code matches PRD specifications** - Contract names, function signatures, interfaces
3. **Check scope boundaries** - Is this feature listed in the PRD?
4. **Ask if unclear** - When in doubt, ask before generating code

### Strict Prohibitions

- **NEVER invent architecture, folders, or providers** - Stay within PRD decisions
- **NEVER rename core constructs** - AutoYieldAccount, AutoYieldModule, YieldAdapter, etc.
- **NEVER create contracts not listed in PRD Section 8.1**
- **NEVER modify function signatures from PRD Section 5.2.2**
- **NEVER add major dependencies without approval**
- **NEVER redesign based on personal preference**
- **NEVER generate placeholder abstractions not in PRD**
- **NEVER implement features marked as non-goals in PRD Section 1.2**

### Code Placement

All smart contracts go in the appropriate contracts directory structure. Do not create new directories without approval.

### When Ambiguity Exists

If something could be done multiple ways:
1. Check if the PRD specifies an approach
2. If not specified, ask the maintainer before implementing
3. Do not make assumptions

---

## Preferred Interaction Model

Whenever generating code or making changes, Claude should:

1. State what file(s) it plans to modify
2. Confirm the change aligns with PRD specifications
3. Request confirmation before writing (unless told "just write the code")
4. Describe architectural decisions before implementing
5. Ask questions when ambiguity exists
6. Avoid "creative" or speculative changes

If the maintainer asks Claude to "just write the code", Claude may execute without reconfirming — otherwise assume confirmation is required.

---

## Definition of Completion

The project is considered correct when the wallet can:

1. Receive USDC
2. Auto-allocate surplus to yield
3. Execute `executeWithAutoYield` which:
   - Withdraws from yield if needed
   - Performs user transfer
   - Re-allocates surplus into yield
4. Perform the above in a single userOperation with gas sponsored
5. Sweep dust balances into USDC and compound them (if configured)

**No additional functionality is required unless requested.**

---

## Quick Reference

| Question | Answer |
|----------|--------|
| Where is the PRD? | `hackathon-prd.md` in repo root |
| What contracts to create? | PRD Section 8.1 |
| What functions to implement? | PRD Section 5.2.2 |
| What providers to use? | PRD Section "Providers & Stack Selection" |
| What's out of scope? | PRD Section 1.2 (Non-Goals) |
| What user flows to support? | PRD Section 3 |
