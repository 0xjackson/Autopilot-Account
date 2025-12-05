# UserOp Failure Debug - RESOLVED

## Issue
UserOp submissions to Pimlico were failing with `NotInitialized()` or `ECDSAValidator: sender is not owner` errors, despite `isInitialized[wallet]` being TRUE on-chain.

## Root Cause Found
The `AutoYieldModule._executeOnKernel()` function was calling `IKernel.execute()` instead of `IKernel.executeFromExecutor()`.

When the module called back into Kernel (e.g., during `rebalance()` → `_depositToYield()` → `_executeOnKernel()`):
1. `msg.sender` = Module address (not EntryPoint)
2. Kernel's `onlyEntryPointOrSelfOrRoot` modifier failed the EntryPoint/self check
3. Kernel fell back to root validator hook (`ECDSAValidator.preCheck`)
4. Hook checked if `msg.sender == owner` → Module ≠ Owner → FAIL

## The Fix
Changed `_executeOnKernel()` to use `executeFromExecutor()`:

```solidity
// BEFORE (buggy)
IKernel(account).execute(EXEC_MODE_DEFAULT, executionCalldata);

// AFTER (fixed)
IKernel(account).executeFromExecutor(EXEC_MODE_DEFAULT, executionCalldata);
```

`executeFromExecutor()` is the proper ERC-7579 pattern for executor modules calling back into Kernel. It checks if the caller is an installed executor module rather than triggering root validator hooks.

## Verification
Confirmed fix works by simulating module calling Kernel:

```bash
# execute() from Module → FAILS
cast call --from $MODULE $WALLET "execute(bytes32,bytes)" ...
# Error: ECDSAValidator: sender is not owner

# executeFromExecutor() from Module → SUCCESS
cast call --from $MODULE $WALLET "executeFromExecutor(bytes32,bytes)" ...
# Returns encoded result
```

---

## v5 Deployed Contracts (Fixed)

| Contract | Address |
|----------|---------|
| AutoYieldModule | `0x598d23dC23095b128aBD4Dbab096d48f9e4b919B` |
| AutopilotFactory | `0x7673F1EBF4eA4e4F2CCb9bf44dCdeF5a5Ba76B94` |
| AutomationValidator | `0x47A6b2f3bD564F9DeA17AcF8AbE73890c546900b` (unchanged) |

---

## Files Changed

### Contracts
- `contracts/src/interfaces/IKernel.sol` - Added `executeFromExecutor()` to interface
- `contracts/src/AutoYieldModule.sol` - Changed `_executeOnKernel()` to use `executeFromExecutor()`
- `contracts/test/AutoYieldModule.t.sol` - Updated MockKernel
- `contracts/test/AutopilotFactory.t.sol` - Updated MockKernelForFactory
- `contracts/DEPLOYMENTS.md` - Updated with v5 addresses

### Frontend
- `frontend/lib/constants.ts` - Updated to v5 addresses, removed env var overrides

### Backend
- `backend/src/bundler/constants.ts` - Updated to v5 addresses, removed env var overrides
- `backend/src/chainReader.ts` - Updated module address for on-chain state reading

---

## Lessons Learned

1. ERC-7579 executor modules MUST use `executeFromExecutor()` when calling back into the kernel, not `execute()`
2. `execute()` is for EntryPoint/self/root validator only
3. Always check which Kernel function executors should use when designing module interactions
4. Keep contract addresses in sync across all files (frontend, backend bundler, backend chainReader)

---

## Next Steps
1. Commit and push the `chainReader.ts` fix
2. Wait for Railway backend to redeploy
3. Re-register the wallet via `POST /register`
4. Scheduler should detect surplus and submit rebalance UserOp
