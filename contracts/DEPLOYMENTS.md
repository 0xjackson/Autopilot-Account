# Autopilot Contract Deployments

## Base Mainnet (Chain ID: 8453)

Deployed: December 3, 2024

### Core Contracts

| Contract | Address | Description |
|----------|---------|-------------|
| **AutoYieldModule** | [`0xdC5ec0628ff1c0063A2d2B13B3FbBD9431aE4a10`](https://basescan.org/address/0xdc5ec0628ff1c0063a2d2b13b3fbbd9431ae4a10) | ERC-7579 executor module - the brain of auto-yield logic |
| **MorphoAdapter** | [`0x33fD350a1ecE1239B880B3b3f91eb39407A7eDf9`](https://basescan.org/address/0x33fd350a1ece1239b880b3b3f91eb39407a7edf9) | Adapter for Moonwell Flagship USDC vault |
| **AutopilotFactory** | [`0xa508485E1F6990255B17063C5368BC02eACffa6f`](https://basescan.org/address/0xa508485e1f6990255b17063c5368bc02eacffa6f) | Factory for deploying Autopilot smart wallets |

### External Dependencies

| Contract | Address | Description |
|----------|---------|-------------|
| USDC | [`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`](https://basescan.org/address/0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913) | Native USDC on Base |
| Morpho Vault | [`0xc1256Ae5FF1cf2719D4937adb3bbCCab2E00A2Ca`](https://basescan.org/address/0xc1256Ae5FF1cf2719D4937adb3bbCCab2E00A2Ca) | Moonwell Flagship USDC MetaMorpho vault |
| Kernel Factory | [`0x5de4839a76cf55d0c90e2061ef4386d962E15ae3`](https://basescan.org/address/0x5de4839a76cf55d0c90e2061ef4386d962E15ae3) | ZeroDev Kernel v3.1 Factory |
| ECDSA Validator | [`0x845ADb2C711129d4f3966735eD98a9F09fC4cE57`](https://basescan.org/address/0x845ADb2C711129d4f3966735eD98a9F09fC4cE57) | ZeroDev ECDSA Validator |

### Configuration

- **Default Checking Threshold:** 100 USDC (keeps $100 liquid, rest goes to yield)
- **Automation Key:** `0x380833DAFE52Fdb8fCEdE4486ED676f72D2436D0` (deployer - update for production)

---

## Deploying New Contracts

### Prerequisites

1. Install Foundry: https://book.getfoundry.sh/getting-started/installation
2. Set up environment variables in `contracts/.env`:

```bash
# Deployer private key (with 0x prefix)
DEPLOYER_PRIVATE_KEY=0x...

# Basescan API key for verification
BASESCAN_API_KEY=...

# Optional: Backend automation key address
AUTOMATION_KEY=0x...
```

### Deploy Commands

```bash
cd contracts

# Dry run (simulation only)
source .env && forge script script/Deploy.s.sol:Deploy \
  --rpc-url https://mainnet.base.org

# Deploy and verify
source .env && forge script script/Deploy.s.sol:Deploy \
  --rpc-url https://mainnet.base.org \
  --broadcast \
  --verify
```

### Verify Existing Contracts

If verification failed during deployment:

```bash
# AutoYieldModule
forge verify-contract 0xdC5ec0628ff1c0063A2d2B13B3FbBD9431aE4a10 \
  src/AutoYieldModule.sol:AutoYieldModule \
  --chain base \
  --etherscan-api-key $BASESCAN_API_KEY

# MorphoAdapter
forge verify-contract 0x33fD350a1ecE1239B880B3b3f91eb39407A7eDf9 \
  src/adapters/MorphoAdapter.sol:MorphoAdapter \
  --chain base \
  --etherscan-api-key $BASESCAN_API_KEY \
  --constructor-args $(cast abi-encode "constructor(address)" 0xc1256Ae5FF1cf2719D4937adb3bbCCab2E00A2Ca)

# AutopilotFactory
forge verify-contract 0xa508485E1F6990255B17063C5368BC02eACffa6f \
  src/AutopilotFactory.sol:AutopilotFactory \
  --chain base \
  --etherscan-api-key $BASESCAN_API_KEY \
  --constructor-args $(cast abi-encode "constructor(address,address,address,address,address)" \
    0x5de4839a76cf55d0c90e2061ef4386d962E15ae3 \
    0x845ADb2C711129d4f3966735eD98a9F09fC4cE57 \
    0xdC5ec0628ff1c0063A2d2B13B3FbBD9431aE4a10 \
    0x33fD350a1ecE1239B880B3b3f91eb39407A7eDf9 \
    0x380833DAFE52Fdb8fCEdE4486ED676f72D2436D0)
```

---

## Adding New Adapters

To support additional yield sources (e.g., Steakhouse USDC, Gauntlet USDC):

1. Deploy a new MorphoAdapter pointing to the vault:

```solidity
MorphoAdapter newAdapter = new MorphoAdapter(VAULT_ADDRESS);
```

2. Allowlist the adapter on the factory:

```solidity
factory.setDefaultAdapter(address(newAdapter));
```

3. Users can also allowlist adapters on their individual wallets:

```solidity
autoYieldModule.setAdapterAllowed(address(newAdapter), true);
autoYieldModule.setCurrentAdapter(USDC, address(newAdapter));
```

### Available Morpho USDC Vaults on Base

| Vault | Address | Notes |
|-------|---------|-------|
| Moonwell Flagship USDC | `0xc1256Ae5FF1cf2719D4937adb3bbCCab2E00A2Ca` | ✅ Currently deployed |
| Steakhouse USDC | `0xbeeF010f9cb27031ad51e3333f9aF9C6B1228183` | High TVL |
| Gauntlet USDC Prime | `0xeE8F4eC5672F09119b96Ab6fB59C27E1b7e44b61` | Alternative option |

---

## Testing

```bash
cd contracts

# Unit tests
forge test --match-contract AutoYieldModuleTest

# Fork tests against real Morpho vaults
BASESCAN_API_KEY=dummy forge test \
  --match-contract MorphoAdapterForkTest \
  --fork-url https://mainnet.base.org \
  --fork-block-number 23000000
```
