# Autopilot Contract Deployments

## Base Mainnet (Chain ID: 8453)

Last Updated: December 5, 2024

---

## ⚠️ v4 TESTING IN PROGRESS

v4 contracts are deployed but **NOT YET VALIDATED**. Do not switch production until testing confirms they work.

### v4 Contracts (Direct ERC-4626 - TESTING)

| Contract | Address | Description |
|----------|---------|-------------|
| **AutopilotFactory** | [`0xA5BC2a02C397F66fBCFC445457325F36106788d1`](https://basescan.org/address/0xA5BC2a02C397F66fBCFC445457325F36106788d1) | Factory v4 - direct vault integration |
| **AutoYieldModule** | [`0xdCB9c356310DdBD693fbA8bF5e271123808cF6dd`](https://basescan.org/address/0xdCB9c356310DdBD693fbA8bF5e271123808cF6dd) | Module v4 - direct ERC-4626, no adapter |
| **AutomationValidator** | [`0x47A6b2f3bD564F9DeA17AcF8AbE73890c546900b`](https://basescan.org/address/0x47A6b2f3bD564F9DeA17AcF8AbE73890c546900b) | Reused from v3 |

**v4 Changes:**
- Removed adapter layer - module interacts directly with ERC-4626 vaults
- Default threshold changed from 100 USDC to 1 USDC
- Enables dynamic vault selection (can migrate between vaults)

**v4 Quick Copy-Paste (FOR TESTING ONLY):**
```typescript
export const CONTRACTS_V4 = {
  FACTORY: "0xA5BC2a02C397F66fBCFC445457325F36106788d1",
  MODULE: "0xdCB9c356310DdBD693fbA8bF5e271123808cF6dd",
  VALIDATOR: "0x47A6b2f3bD564F9DeA17AcF8AbE73890c546900b",
  USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
} as const;
```

---

## v3 Contracts (CURRENT PRODUCTION)

### Core Contracts

| Contract | Address | Description |
|----------|---------|-------------|
| **AutopilotFactory** | [`0xFBb91eb4234558b191c393985eF34282B551e81B`](https://basescan.org/address/0xFBb91eb4234558b191c393985eF34282B551e81B) | Factory for deploying Autopilot smart wallets |
| **AutoYieldModule** | [`0x71b5A4663A49FF02BE672Ea9560256D2268727B7`](https://basescan.org/address/0x71b5A4663A49FF02BE672Ea9560256D2268727B7) | ERC-7579 executor module for auto-yield logic |
| **AutomationValidator** | [`0x47A6b2f3bD564F9DeA17AcF8AbE73890c546900b`](https://basescan.org/address/0x47A6b2f3bD564F9DeA17AcF8AbE73890c546900b) | ERC-7579 validator for automation key signatures |
| **MorphoAdapter** | [`0x42EFecD83447e5b90c5F706309FaC8f9615bd68F`](https://basescan.org/address/0x42EFecD83447e5b90c5F706309FaC8f9615bd68F) | Adapter for Moonwell Flagship USDC vault |

### Configuration

- **Default Checking Threshold:** 100 USDC (keeps $100 liquid, rest goes to yield)
- **Automation Key:** `0xD78F5099987389e33bD6Ec15FF3Ca4dBedD507f3` (backend session signer)

### External Dependencies

| Contract | Address | Description |
|----------|---------|-------------|
| USDC | [`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`](https://basescan.org/address/0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913) | Native USDC on Base |
| Morpho Vault | [`0xc1256Ae5FF1cf2719D4937adb3bbCCab2E00A2Ca`](https://basescan.org/address/0xc1256Ae5FF1cf2719D4937adb3bbCCab2E00A2Ca) | Moonwell Flagship USDC MetaMorpho vault |
| Kernel Factory | [`0x2577507b78c2008Ff367261CB6285d44ba5eF2E9`](https://basescan.org/address/0x2577507b78c2008Ff367261CB6285d44ba5eF2E9) | ZeroDev Kernel v3.3 Factory |
| ECDSA Validator | [`0x845ADb2C711129d4f3966735eD98a9F09fC4cE57`](https://basescan.org/address/0x845ADb2C711129d4f3966735eD98a9F09fC4cE57) | ZeroDev ECDSA Validator |

---

## Quick Copy-Paste (v3 Production)

```typescript
export const CONTRACTS = {
  FACTORY: "0xFBb91eb4234558b191c393985eF34282B551e81B",
  MODULE: "0x71b5A4663A49FF02BE672Ea9560256D2268727B7",
  VALIDATOR: "0x47A6b2f3bD564F9DeA17AcF8AbE73890c546900b",
  ADAPTER: "0x42EFecD83447e5b90c5F706309FaC8f9615bd68F",
  USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
} as const;

// Automation key (for backend .env)
AUTOMATION_PUBLIC_ADDRESS=0xD78F5099987389e33bD6Ec15FF3Ca4dBedD507f3
```

---

## Deployment History

### v4 - December 5, 2024 (TESTING - NOT PRODUCTION)
- Direct ERC-4626 vault integration (removed adapter layer)
- Enables dynamic vault selection via `migrateStrategy(token, newVault)`
- Default threshold: 1 USDC
- AutoYieldModule: `0xdCB9c356310DdBD693fbA8bF5e271123808cF6dd`
- AutopilotFactory: `0xA5BC2a02C397F66fBCFC445457325F36106788d1`
- Reuses AutomationValidator from v3

### v3 - December 4, 2024 (CURRENT PRODUCTION)
- Fixed AutomationValidator to parse ERC-7579 execute(bytes32,bytes) format
- Redeployed Factory with new validator address
- All contracts verified on Basescan

### v2 - December 4, 2024 (Deprecated)
- Fixed Kernel v3 module install data format (executor + validator)
- Added AutomationValidator for session key UserOp signing
- AutopilotFactory: `0xcf10279BAA0d5407Dbb637517d23055A55E72923`
- AutomationValidator: `0xe29ed376a2780f653C14EEC203eD25094c0E772A`

### v1 - December 3, 2024 (Deprecated)
- Initial deployment
- AutopilotFactory: `0xc627874FE7444f8e9750e5043c19bA01E990D581`
- AutoYieldModule: `0xC35Eeb30a36d1ac157B41719BEAf513a0C557Bce`
- MorphoAdapter: `0x8438E34f258044cf656EBA796B8559bA1ee3020a`
