# Backend Signing Implementation

## Overview

The backend needs to build, sign, and submit UserOps using the automation key to call `rebalance()` on user wallets.

## Flow

```
1. COMPOSE UserOp
   ├─ sender: wallet address
   ├─ nonce: encoded for AutomationValidator
   ├─ callData: Kernel.execute(autoYieldModule, rebalance())
   ├─ gas params: from bundler estimate
   └─ paymasterAndData: from CDP paymaster

2. SIGN UserOp
   ├─ Calculate userOpHash (EntryPoint formula)
   ├─ Sign with automation private key
   └─ Attach signature to UserOp

3. SUBMIT to CDP Bundler
   ├─ eth_sendUserOperation
   └─ Return userOpHash for tracking
```

## Dependencies

```bash
npm install viem permissionless
```

## Files to Create/Modify

| File | Purpose |
|------|---------|
| `src/bundler.ts` | NEW - UserOp building, signing, submission |
| `src/constants.ts` | NEW - Contract addresses, ABIs |
| `src/scheduler.ts` | MODIFY - Call bundler instead of simulation |
| `.env` | ADD - `AUTOMATION_PRIVATE_KEY`, `CDP_API_KEY` |

## Contract Addresses (Base Mainnet)

```typescript
export const CONTRACTS = {
  FACTORY: "0xcf10279BAA0d5407Dbb637517d23055A55E72923",
  MODULE: "0x71b5A4663A49FF02BE672Ea9560256D2268727B7",
  VALIDATOR: "0xe29ed376a2780f653C14EEC203eD25094c0E772A",
  ADAPTER: "0x42EFecD83447e5b90c5F706309FaC8f9615bd68F",
  USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  ENTRYPOINT: "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
} as const;
```

## Key Functions

### Nonce Encoding

```typescript
function encodeNonceForValidator(validatorAddr: Address, nonce: bigint): bigint {
  const mode = 0x00n;
  const vType = 0x01n;
  const key = 0n;

  return (
    nonce |
    (key << 64n) |
    (BigInt(validatorAddr) << 80n) |
    (vType << 240n) |
    (mode << 248n)
  );
}
```

### UserOp Hash (EntryPoint v0.7)

```typescript
function getUserOpHash(userOp, entryPoint, chainId) {
  const packed = keccak256(encodeAbiParameters([...], [
    userOp.sender,
    userOp.nonce,
    keccak256(userOp.initCode),
    keccak256(userOp.callData),
    userOp.accountGasLimits,
    userOp.preVerificationGas,
    userOp.gasFees,
    keccak256(userOp.paymasterAndData)
  ]));
  return keccak256(encodeAbiParameters([...], [packed, entryPoint, chainId]));
}
```

## CDP Bundler

URL: `https://api.developer.coinbase.com/rpc/v1/base/<API_KEY>`

Methods:
- `eth_estimateUserOperationGas`
- `eth_sendUserOperation`
- `pm_getPaymasterStubData`
- `pm_getPaymasterData`

## Environment Variables

```
AUTOMATION_PRIVATE_KEY=0x...
CDP_API_KEY=...
```
