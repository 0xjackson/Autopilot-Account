## AutoYield Backend Progress

This backend implements the Bryce tickets from the PRD in sequence. Each feature layers on top of the previous one so Logan and Robby can already integrate with it.

### Ticket B1 – Index protocols with highest yield
- Hardcoded strategy catalog for Base (mainnet + Sepolia test values) with mocked APYs, protocol names, risk tiers.
- REST endpoints: `GET /health`, `GET /strategies`, `GET /recommend`.
- Service layer (`strategyService.ts`) sorts/filter strategies and exposes helper utilities for future modules.

### Ticket B2 – Strategy selector (risk + preferences)
- Introduced recommendation logic that accepts `riskTolerance` and `minApy` preferences.
- Added `/recommendations` endpoint returning both the best strategy and a scored list.
- Added scored strategy types plus helpers to parse/validate query params.

### Ticket B3 – Auto-rebalance scheduler
- Added `scheduler.ts` to register periodic tasks for automation actions.
- New endpoints under `/rebalance-tasks` allow listing, creating, deleting, and manually running tasks.
- Scheduler uses the recommendation service to pick Morpho-only strategies per task.
- **Now integrated with bundler (Task 6)** - submits real UserOperations when configured.

### Ticket B6 – Scheduler Bundler Integration

The scheduler now submits real automation UserOperations via CDP bundler when properly configured.

**Modes:**
- **Bundler ENABLED**: When all env vars are set, tasks submit real UserOps to CDP
- **Simulation mode**: When bundler is not configured, tasks log but don't submit

**Supported actions:**
- `rebalance` - Calls `submitRebalanceUserOp()` to move excess checking into yield
- `flushToChecking` - Also uses rebalance (module handles logic internally)
- `sweepDust` - Calls `submitSweepDustUserOp()` to consolidate dust tokens

**Required environment variables:**
```env
CDP_BUNDLER_URL=https://api.developer.coinbase.com/rpc/v1/base/YOUR_KEY
AUTOMATION_PRIVATE_KEY=0x...
AUTO_YIELD_MODULE_ADDRESS=0x...
```

**Checking scheduler status:**
```bash
curl http://localhost:3001/
# Response includes: { "scheduler": { "isRunning": true, "bundlerEnabled": true, ... } }
```

**Disabling the scheduler:**
To run without submitting UserOps, simply omit one of the required env vars. The scheduler will start in simulation mode and log: `WARNING: Bundler NOT configured - running in SIMULATION mode`.

Alternatively, don't call any `/rebalance-tasks` endpoints - the scheduler only executes tasks that are registered.

### Ticket B4 – Dust token metadata service
- Added `dustConfig.ts` with a registry of known tokens on Base (USDC, WETH, meme coins, airdrops).
- Added `dustService.ts` with helper functions: `getDustTokens()`, `getDustConfig()`, `getDustSummary()`.
- New endpoints:
  - `GET /dust/tokens?chainId=8453` - List all dust token metadata for a chain
  - `GET /dust/config?chainId=8453&consolidation=USDC` - Get dust sweep configuration
  - `GET /dust/summary?wallet=0x...&chainId=8453` - Wallet dust summary (stub with mock data)
- Tokens are categorized as:
  - Consolidation targets (USDC, WETH) - tokens to sweep INTO
  - Dust sources (DEGEN, AERO, etc.) - airdrop/meme tokens to sweep FROM
  - Ignored tokens (known scams)
- TODO hooks for real on-chain balance reading and DEX metadata (B5+).

### Automation Session Key Endpoint

The `/automation-key` endpoint returns the public address of the backend's session key. The frontend needs this during wallet creation to register it with the factory.

**Endpoint:** `GET /automation-key`

**Response:**
```json
{
  "address": "0x...",
  "permissions": ["rebalance", "migrateStrategy", "sweepDustAndCompound"]
}
```

**Why the frontend needs this:**
When creating a new Autopilot wallet, the factory must know which session key to authorize for automation. The frontend fetches this address from the backend and passes it to the factory contract during wallet deployment.

**Setup:**
1. Run `npm run generate-session-key` to create the keypair
2. Add `AUTOMATION_PUBLIC_ADDRESS` to `.env`
3. The endpoint will return 500 if the env var is not set

### Bundler Integration (Task 5)

The `bundler.ts` service builds and submits UserOperations for automation tasks using the ZeroDev SDK with CDP Bundler/Paymaster.

**Exported functions:**

```typescript
import {
  submitRebalanceUserOp,
  submitMigrateStrategyUserOp,
  submitSweepDustUserOp,
} from "./bundler";

// Move excess checking balance into yield
await submitRebalanceUserOp(walletAddress, tokenAddress?);

// Migrate funds to a better vault
await submitMigrateStrategyUserOp(walletAddress, tokenAddress, newAdapterAddress);

// Sweep dust tokens and compound into yield
await submitSweepDustUserOp(walletAddress);
```

**Required environment variables:**

| Variable | Description |
|----------|-------------|
| `CDP_BUNDLER_URL` | CDP bundler endpoint (get from https://portal.cdp.coinbase.com) |
| `AUTOMATION_PRIVATE_KEY` | Session key for signing (run `npm run generate-session-key`) |
| `AUTO_YIELD_MODULE_ADDRESS` | AutoYieldModule contract address (Jackson provides) |

**How it works:**

1. Each function encodes a call to AutoYieldModule (rebalance, migrateStrategy, or sweepDustAndCompound)
2. Creates a Kernel account client using the automation session key
3. Submits the UserOp to CDP bundler (which also handles gas sponsorship)
4. Waits for transaction confirmation and returns the UserOp hash

**TODO (Session Key Signing):**

The current implementation uses standard ECDSA validation. This needs to be updated once Jackson confirms how Kernel validates session keys. The session key should be restricted to only call:
- `rebalance(address token)`
- `migrateStrategy(address token, address newAdapter)`
- `sweepDustAndCompound()`

**Dependencies:**

```bash
npm install @zerodev/sdk @zerodev/ecdsa-validator viem
```

### Live Strategy Cache

The backend includes a caching layer (`liveStrategyStore.ts`) for live yield vault data fetched from Morpho, Aave, and Moonwell APIs via `yieldAggregator.ts`.

**Cache behavior:**
- **TTL:** 5 minutes per chain
- **Auto-refresh:** Stale cache triggers automatic refresh on access
- **Data sources:**
  - Morpho Blue GraphQL API
  - Aave V3 GraphQL API
  - Moonwell SDK (Base native)
- **Minimum TVL filter:** 100k USD (filters out small/test vaults)
- **Fallback:** If live fetch fails or returns empty, falls back to mock data

**Response metadata:**
All strategy endpoints (`/strategies`, `/recommend`, `/recommendations`) include a `metadata` field:
```json
{
  "metadata": {
    "dataSource": "live",
    "fetchedAt": "2025-12-03T22:14:32.630Z",
    "expiresAt": "2025-12-03T22:19:32.630Z"
  }
}
```
- `dataSource: "live"` - Real-time data from protocol APIs
- `dataSource: "mock"` - Fallback static data (e.g., for unsupported tokens like WETH)

**Admin endpoints:**
- `POST /admin/refresh-strategies` - Force refresh the strategy cache
  - Body: `{ "chainId": 8453 }` (optional, defaults to Base mainnet)
  - Returns: `{ chainId, fetchedAt, expiresAt, count }`
- `GET /admin/cache-status?chainId=8453` - Check current cache status
  - Returns: `{ chainId, cached, isFresh, expiresAt, strategyCount }`

### Adapter Addresses

Each strategy includes an `adapterAddress` field pointing to the IYieldAdapter contract that wraps that protocol's vault. The adapter implements:
```solidity
interface IYieldAdapter {
    function deposit(uint256 amount) external;
    function withdraw(uint256 amount) external returns (uint256 withdrawn);
    function totalValue() external view returns (uint256);
}
```

**Current status:** Adapter addresses are **placeholders** (e.g., `0xAdapterMorphoUSDC...`) until real adapters are deployed on-chain. The mapping is in `src/config/adapterAddresses.ts`.

**Supported adapters (placeholder):**
| Protocol | Asset | Adapter Address (placeholder) |
|----------|-------|-------------------------------|
| Morpho | USDC | `0xAdapterMorphoUSDC0000000000000000000001` |
| Aave | USDC | `0xAdapterAaveUSDC00000000000000000000003` |
| Moonwell | USDC | `0xAdapterMoonwellUSDC000000000000000005` |
| Morpho | WETH | `0xAdapterMorphoWETH0000000000000000000002` |
| Aave | WETH | `0xAdapterAaveWETH00000000000000000000004` |
| Moonwell | WETH | `0xAdapterMoonwellWETH000000000000000006` |

**Example response with adapter:**
```json
{
  "id": "morpho-edgeusdc-8453",
  "protocolName": "Morpho",
  "vaultAddress": "0x5435BC53f2C61298167cdB11Cdf0Db2BFa259ca0",
  "adapterAddress": "0xAdapterMorphoUSDC0000000000000000000001",
  "apy": 0.0697,
  "riskTier": "med"
}
```

### Usage in Code

```typescript
import { getCachedStrategies, refreshLiveStrategies } from "./liveStrategyStore";

// Get cached data (auto-refreshes if stale)
const result = await getCachedStrategies(8453);

// Force refresh
const fresh = await refreshLiveStrategies(8453);
```

---

## Next Steps

The backend is ready for:
- **Ticket B5 (Bundler integration):** Compose userOps using strategy/adapter data
- **Ticket B6 (Paymaster server):** Sponsor gas for wallet operations

Once real adapters are deployed, update `src/config/adapterAddresses.ts` with actual contract addresses.
