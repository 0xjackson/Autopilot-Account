# Feature PRD: Dynamic Vault Selection

## Overview

Refactor the AutoYieldModule to interact directly with ERC-4626 vaults (Morpho MetaMorpho) instead of through an adapter layer. This enables dynamic vault selection based on real-time APY data from the yield aggregator API.

---

## Problem Statement

**Current state:**
- `MorphoAdapter` is hardcoded to a single vault at deployment
- Scheduler fetches best vault APY from API but can't use it
- No way to switch vaults without deploying new adapters
- Users stuck in suboptimal yield vaults

**Desired state:**
- Module stores vault address directly (no adapter middleman)
- Scheduler compares current vault vs best vault from API
- If better vault exists, call `migrateStrategy(token, newVaultAddress)`
- All Morpho vaults are ERC-4626 compliant, so any vault address works

---

## Scope

### In Scope
- Refactor `AutoYieldModule.sol` to call ERC-4626 vaults directly
- Update `AutopilotFactory.sol` to pass initial vault address
- Update scheduler to compare current vs best vault and trigger migration
- Change default threshold from 100 USDC to 1 USDC
- Remove adapter layer (MorphoAdapter no longer needed for core flow)

### Out of Scope
- Multi-protocol support (Aave, Moonwell) - future enhancement
- Non-ERC4626 vault support
- User-configurable vault preferences

---

## Technical Changes

### 1. AutoYieldModule.sol

#### 1.1 Storage Changes

```solidity
// REMOVE - adapter references
mapping(address account => mapping(address token => address)) public currentAdapter;
mapping(address account => mapping(address adapter => bool)) public allowedAdapters;

// ADD - direct vault references
mapping(address account => mapping(address token => address)) public currentVault;
mapping(address account => mapping(address vault => bool)) public allowedVaults;
```

#### 1.2 Interface Import

```solidity
// ADD
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
```

#### 1.3 onInstall Changes

```solidity
// BEFORE
function onInstall(bytes calldata data) external override {
    (address defaultAdapter, address _automationKey, uint256 initialThreshold) =
        abi.decode(data, (address, address, uint256));

    address usdc = IYieldAdapter(defaultAdapter).asset();
    allowedAdapters[account][defaultAdapter] = true;
    currentAdapter[account][usdc] = defaultAdapter;
    // ...
}

// AFTER
function onInstall(bytes calldata data) external override {
    (address defaultVault, address _automationKey, uint256 initialThreshold) =
        abi.decode(data, (address, address, uint256));

    address usdc = IERC4626(defaultVault).asset();
    allowedVaults[account][defaultVault] = true;
    currentVault[account][usdc] = defaultVault;
    // ...
}
```

#### 1.4 _depositToYield Changes

```solidity
// BEFORE
function _depositToYield(
    address account,
    address adapter,
    address token,
    uint256 amount
) internal {
    bytes memory approveData = abi.encodeCall(IERC20.approve, (adapter, amount));
    IKernel(account).execute(token, 0, approveData);

    bytes memory depositData = abi.encodeCall(IYieldAdapter.deposit, (amount));
    IKernel(account).execute(adapter, 0, depositData);
}

// AFTER
function _depositToYield(
    address account,
    address vault,
    address token,
    uint256 amount
) internal {
    // Approve vault to spend tokens
    bytes memory approveData = abi.encodeCall(IERC20.approve, (vault, amount));
    IKernel(account).execute(token, 0, approveData);

    // Deposit to vault - shares go directly to the smart wallet
    bytes memory depositData = abi.encodeCall(IERC4626.deposit, (amount, account));
    IKernel(account).execute(vault, 0, depositData);
}
```

#### 1.5 _withdrawFromYield Changes

```solidity
// BEFORE
function _withdrawFromYield(
    address account,
    address adapter,
    uint256 amount
) internal {
    bytes memory withdrawData = abi.encodeCall(IYieldAdapter.withdraw, (amount));
    IKernel(account).execute(adapter, 0, withdrawData);
}

// AFTER
function _withdrawFromYield(
    address account,
    address vault,
    uint256 amount
) internal {
    // Withdraw from vault - assets go to the smart wallet
    bytes memory withdrawData = abi.encodeCall(IERC4626.withdraw, (amount, account, account));
    IKernel(account).execute(vault, 0, withdrawData);
}
```

#### 1.6 _getYieldBalance Changes

```solidity
// BEFORE
function _getYieldBalance(address account, address adapter) internal view returns (uint256) {
    try IYieldAdapterExtended(adapter).totalValueOf(account) returns (uint256 value) {
        return value;
    } catch {
        return 0;
    }
}

// AFTER
function _getYieldBalance(address account, address vault) internal view returns (uint256) {
    try IERC4626(vault).convertToAssets(IERC4626(vault).balanceOf(account)) returns (uint256 value) {
        return value;
    } catch {
        return 0;
    }
}
```

#### 1.7 migrateStrategy Changes

```solidity
// BEFORE
function migrateStrategy(
    address token,
    address newAdapter
) external onlyAuthorized(msg.sender) {
    // ...
    if (!allowedAdapters[account][newAdapter]) revert AdapterNotAllowed();
    address oldAdapter = currentAdapter[account][token];
    // ...
    currentAdapter[account][token] = newAdapter;
}

// AFTER
function migrateStrategy(
    address token,
    address newVault
) external onlyAuthorized(msg.sender) {
    address account = msg.sender;
    if (!isInitialized[account]) revert NotInitialized();
    if (!allowedVaults[account][newVault]) revert VaultNotAllowed();

    address oldVault = currentVault[account][token];
    if (oldVault == newVault) return;

    // Withdraw all from old vault
    if (oldVault != address(0)) {
        uint256 yieldBalance = _getYieldBalance(account, oldVault);
        if (yieldBalance > 0) {
            _withdrawFromYield(account, oldVault, yieldBalance);
        }
    }

    // Allow new vault
    allowedVaults[account][newVault] = true;

    // Deposit surplus to new vault
    uint256 threshold = checkingThreshold[account][token];
    uint256 checking = IERC20(token).balanceOf(account);
    if (checking > threshold) {
        uint256 toDeposit = checking - threshold;
        _depositToYield(account, newVault, token, toDeposit);
    }

    currentVault[account][token] = newVault;
    emit StrategyMigrated(account, token, oldVault, newVault);
}
```

#### 1.8 Update All References

Replace throughout the file:
- `currentAdapter` → `currentVault`
- `allowedAdapters` → `allowedVaults`
- `adapter` variable names → `vault`
- `AdapterNotAllowed` → `VaultNotAllowed`
- `AdapterUpdated` → `VaultUpdated`
- `AdapterAllowed` → `VaultAllowed`

#### 1.9 Remove Unused

```solidity
// REMOVE this interface (no longer needed)
interface IYieldAdapterExtended {
    function totalValueOf(address account) external view returns (uint256);
}
```

---

### 2. AutopilotFactory.sol

#### 2.1 Threshold Change

```solidity
// BEFORE
uint256 public constant DEFAULT_THRESHOLD = 100e6;

// AFTER
uint256 public constant DEFAULT_THRESHOLD = 1e6;  // 1 USDC
```

#### 2.2 Rename Variables

```solidity
// BEFORE
address public defaultAdapter;

// AFTER
address public defaultVault;
```

#### 2.3 Update Constructor

```solidity
// BEFORE
constructor(
    // ...
    address _defaultAdapter,
    // ...
) {
    defaultAdapter = _defaultAdapter;
}

// AFTER
constructor(
    // ...
    address _defaultVault,
    // ...
) {
    defaultVault = _defaultVault;
}
```

#### 2.4 Update _buildInitData

```solidity
// BEFORE
bytes memory executorOnInstallData = abi.encode(defaultAdapter, automationKey, defaultThreshold);

// AFTER
bytes memory executorOnInstallData = abi.encode(defaultVault, automationKey, defaultThreshold);
```

#### 2.5 Update Setter

```solidity
// BEFORE
function setDefaultAdapter(address _adapter) external {
    require(msg.sender == admin, "Not admin");
    if (_adapter == address(0)) revert ZeroAddress();
    defaultAdapter = _adapter;
    emit DefaultsUpdated(_adapter, defaultThreshold);
}

// AFTER
function setDefaultVault(address _vault) external {
    require(msg.sender == admin, "Not admin");
    if (_vault == address(0)) revert ZeroAddress();
    defaultVault = _vault;
    emit DefaultsUpdated(_vault, defaultThreshold);
}
```

---

### 3. Backend Changes

#### 3.1 chainReader.ts

Add `currentVault` to the return type:

```typescript
export interface WalletCheckResult {
  wallet: Address;
  checkingBalance: bigint;
  threshold: bigint;
  yieldBalance: bigint;
  needsRebalance: boolean;
  surplus: bigint;
  hasVault: boolean;        // renamed from hasAdapter
  currentVault: Address | null;  // ADD - expose current vault
}
```

Update the multicall to return the vault address:

```typescript
const vaultResult = results[baseIndex + 2];
const currentVault = vaultResult.status === "success"
  ? (vaultResult.result as Address)
  : null;

walletResults.push({
  // ...
  currentVault,  // ADD
});
```

#### 3.2 scheduler.ts

Update the registry check to compare vaults:

```typescript
async function checkRegistryWallets(): Promise<void> {
  const wallets = getRegisteredWallets();
  if (wallets.length === 0) return;

  const results = await checkWalletsForRebalance(wallets);

  for (const result of results) {
    // Get best vault from API
    const bestStrategy = await getBestStrategy("USDC", 8453);
    const bestVaultAddress = bestStrategy.strategy?.vaultAddress;

    if (!bestVaultAddress) continue;

    const currentVault = result.currentVault?.toLowerCase();
    const bestVault = bestVaultAddress.toLowerCase();

    if (currentVault && currentVault !== bestVault) {
      // Better vault exists - migrate
      log("registry", `Migrating ${result.wallet} from ${currentVault} to ${bestVault}`);
      await submitMigrateStrategyUserOp(
        result.wallet as Address,
        USDC_ADDRESS,
        bestVault as Address
      );
    } else if (result.needsRebalance) {
      // Same vault, just rebalance
      log("registry", `Rebalancing ${result.wallet}`);
      await submitRebalanceUserOp(result.wallet as Address, USDC_ADDRESS);
    }
  }
}
```

#### 3.3 bundler/submit.ts

Update `submitMigrateStrategyUserOp` to use new ABI:

```typescript
export async function submitMigrateStrategyUserOp(
  walletAddress: Address,
  tokenAddress: Address,
  newVaultAddress: Address  // This is now a vault, not adapter
): Promise<Hex> {
  console.log(`[bundler] Migrate: ${walletAddress} -> ${newVaultAddress}`);
  const moduleCallData = encodeFunctionData({
    abi: AUTO_YIELD_MODULE_ABI,
    functionName: "migrateStrategy",
    args: [tokenAddress, newVaultAddress],
  });
  return submitAutomationUserOp(walletAddress, moduleCallData);
}
```

#### 3.4 bundler/constants.ts

Update ABI to reflect vault terminology (function signatures unchanged, just semantics).

#### 3.5 config/adapterAddresses.ts

Rename to `vaultConfig.ts` or remove entirely - vaults come from API now.

---

### 4. Test Updates

#### 4.1 AutoYieldModule.t.sol

- Replace `MockYieldVault` usage with ERC-4626 mock or real interface
- Update all `adapter` references to `vault`
- Test `migrateStrategy` with different vault addresses

#### 4.2 AutopilotFactory.t.sol

- Update threshold assertions: `100e6` → `1e6`
- Update `defaultAdapter` → `defaultVault`

---

### 5. Deployment

#### 5.1 Deploy Order

1. Deploy new `AutoYieldModule` (with vault logic)
2. Get initial Morpho vault address from API (best APY)
3. Deploy new `AutopilotFactory` with:
   - New module address
   - Initial vault address
   - Threshold = 1 USDC

#### 5.2 Migration Note

Existing wallets with old module will continue to work but won't benefit from dynamic vaults. New wallets will use the new system.

---

## Scheduler Logic Summary

```
Every 10 seconds:
┌─────────────────────────────────────────────────┐
│ For each registered wallet:                      │
│                                                  │
│ 1. Fetch wallet's current vault from chain       │
│ 2. Fetch best vault from Morpho API              │
│                                                  │
│ 3. If best vault != current vault:               │
│    → Submit migrateStrategy(USDC, bestVault)     │
│    → Withdraws from old, deposits to new         │
│                                                  │
│ 4. Else if checkingBalance > threshold:          │
│    → Submit rebalance(USDC)                      │
│    → Deposits surplus to current vault           │
│                                                  │
│ 5. Else:                                         │
│    → No action needed                            │
└─────────────────────────────────────────────────┘
```

---

## Risk Assessment

| Area | Risk Level | Mitigation |
|------|------------|------------|
| Module installation | Low | Same flow, different stored address type |
| Validator/UserOp | None | Unchanged - same function selectors |
| ERC-4626 compatibility | Low | Morpho vaults are standard compliant |
| Share accounting | Low | Wallet holds own shares, simpler model |
| Migration gas costs | Medium | Only migrate if APY difference > threshold |

---

## Success Criteria

1. New wallets deploy with 1 USDC default threshold
2. Scheduler detects when better vault available
3. Scheduler successfully migrates funds between vaults
4. Yield accrues correctly in new vault after migration
5. `executeWithAutoYield` works correctly with direct vault calls

---

## Files Changed

| File | Change Type |
|------|-------------|
| `contracts/src/AutoYieldModule.sol` | Major refactor |
| `contracts/src/AutopilotFactory.sol` | Variable renames, threshold change |
| `contracts/test/AutoYieldModule.t.sol` | Update tests |
| `contracts/test/AutopilotFactory.t.sol` | Update tests |
| `backend/src/chainReader.ts` | Expose currentVault |
| `backend/src/scheduler.ts` | Add migration logic |
| `backend/src/bundler/submit.ts` | Update comments |
| `backend/src/config/adapterAddresses.ts` | Remove or rename |

---

## Future Enhancements

- Add APY difference threshold (only migrate if >0.5% better)
- Add migration cooldown (don't migrate too frequently)
- Support multiple protocols (Aave, Moonwell) with protocol-specific logic
- User-configurable vault preferences
