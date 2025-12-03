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
- Added `scheduler.ts` to register periodic tasks that simulate rebalance userOps.
- New endpoints under `/rebalance-tasks` allow listing, creating, deleting, and manually running tasks.
- Scheduler uses the recommendation service to pick strategies per task, logs simulated runs, and keeps in-memory status (future tickets will swap in bundler calls + persistence).

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

Next step is to hook the scheduler into real bundler/userOp flows (Ticket B5) and persist tasks/user preferences if we move beyond in-memory demo mode.
