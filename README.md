# Autopilot Wallet

A smart wallet on Base that automatically:
- Keeps a "checking" balance in USDC
- Routes excess into yield strategies (vaults or LPs)
- Automatically frees funds from yield when you spend
- Sweeps dust from random tokens into USDC for auto-yielding

All of this happens inside a 4337 smart account using a custom ERC-7579 module, with gasless UX via a paymaster.

## Core Concepts

| Concept | Description |
|---------|-------------|
| **Smart Account (4337)** | ZeroDev Kernel v3 wallet on Base with custom logic and gasless transactions via paymaster |
| **AutopilotFactory** | Deploys Kernel accounts via the ZeroDev Kernel Factory with AutoYieldModule pre-installed |
| **AutoYieldModule (7579)** | Pluggable "brain" that manages thresholds, strategies, and dust config |
| **YieldAdapter** | Talks to yield sources (ERC-4626 vaults, LP routers) |
| **Paymaster** | Sponsors gas so users never need ETH |

## User Flows

### Wallet Creation
1. Connect EOA wallet (Coinbase Wallet / MetaMask)
2. Click "Create Autopilot Wallet on Base"
3. Sign one message
4. New 4337 smart wallet deployed with AutoYield module installed

### Configure Auto-Yield
- Set checking threshold (e.g., "Keep 100 USDC in checking")
- Choose which tokens to auto-yield
- Choose dust consolidation token

### Make a Payment (Magic Moment)
When you pay, the module automatically:
1. Checks if balance >= amount + threshold
2. Withdraws from yield if needed
3. Executes the payment
4. Re-deposits excess into yield

All in a single gasless userOp.

### Dust Sweep
Click "Clean Up Wallet" to:
- Swap all tracked dust tokens into USDC
- Deposit consolidated USDC into yield

## Architecture

```
┌──────────────────────────┐
│        Frontend          │
│  (Next.js + OnchainKit)  │
└─────────┬────────────────┘
          │
          ▼
┌─────────────────┐     ┌──────────────────────┐
│     Bundler     │     │  AutoYieldPaymaster  │
│   (Base RPC)    │     │  (sponsors gas)      │
└────────┬────────┘     └──────────────────────┘
         │
         ▼
┌─────────────────┐
│   EntryPoint    │
│  (4337 core)    │
└────────┬────────┘
         │
         ▼
┌────────────────────────┐
│    Kernel Account      │
│  (4337 smart account)  │
└────────┬───────────────┘
         │
         ▼
┌────────────────────┐        ┌──────────────────────┐
│  AutoYieldModule   │        │   Router / Vaults    │
│ (Executor + Hooks) │◄──────►│ (DEX, ERC4626, etc.) │
└────────────────────┘        └──────────────────────┘
```

## Quick Start

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Contracts

```bash
cd contracts
forge build
forge test
```

## Project Structure

```
├── frontend/          Next.js app with Wagmi + OnchainKit
├── contracts/         Foundry project
│   ├── src/
│   │   ├── AutopilotFactory.sol      # Deploys Kernel accounts via ZeroDev factory
│   │   ├── AutoYieldModule.sol       # ERC-7579 executor module
│   │   ├── interfaces/
│   │   │   ├── IKernel.sol           # Kernel v3 + Factory interfaces
│   │   │   ├── IERC7579Module.sol    # Module interface definitions
│   │   │   └── IYieldAdapter.sol     # Yield adapter interface
│   │   └── mocks/
│   │       └── MockYieldVault.sol    # Test vault with ERC-4626 interface
│   └── test/
├── CLAUDE.md          Architecture constraints
└── hackathon-prd.md   Full product requirements
```

## Stack

- **Smart Account**: ZeroDev Kernel v3
- **Module Standard**: ERC-7579 (Rhinestone interface)
- **Network**: Base (Base Sepolia for dev)
- **Bundler**: Base bundler endpoint
- **Gas Sponsorship**: Base Paymaster (Coinbase Developer Platform)
- **Primary Token**: USDC (native on Base)
- **Yield Sources**: ERC-4626 vaults (Aerodrome/Beefy) or Mock vault
- **Dust Swaps**: Aerodrome Router (fallback: Uniswap v3)
- **Frontend**: Next.js + OnchainKit + viem + Wagmi

## Key Module Functions

```solidity
// Configure thresholds and strategies
setCheckingThreshold(address token, uint256 threshold)
configureTokenStrategy(address token, TokenStrategyConfig cfg)
setDustConfig(DustConfig cfg)

// Core execution wrapper
executeWithAutoYield(address token, address to, uint256 amount, bytes data)

// Maintenance
rebalance()
flushToChecking(address token)
sweepDustAndCompound()
```

## Security

- Auto-yield only applies to tokens explicitly configured by user
- Per-token caps via `maxAllocationBP`
- Hardcoded strategy adapters (no user-supplied adapters)
- Validator rejects userOps exceeding configured caps
