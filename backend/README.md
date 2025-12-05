# Autopilot Backend

Backend service for the Autopilot Wallet on Base mainnet.

## Bundler & Paymaster

Uses **Pimlico** for ERC-4337 bundler and paymaster (gas sponsorship):
- EntryPoint v0.7 (`0x0000000071727De22E5E9d8BAf0edAc6f37da032`)
- Pimlico verifying paymaster (`0x777777777777AeC03fd955926DbF81597e66834C`)
- Gasless UserOp submission for automation tasks

## Contract Addresses (Base Mainnet - v4)

| Contract | Address |
|----------|---------|
| AutopilotFactory | `0xA5BC2a02C397F66fBCFC445457325F36106788d1` |
| AutomationValidator | `0x47A6b2f3bD564F9DeA17AcF8AbE73890c546900b` |
| AutoYieldModule | `0xdCB9c356310DdBD693fbA8bF5e271123808cF6dd` |

## Features

| Feature | Status |
|---------|--------|
| Strategy Indexer | Done |
| Recommendation Engine | Done |
| Scheduler | Done |
| Dust Token Service | Done |
| Wallet Registry | Done |
| UserOp Submission (Pimlico) | Done |

## API Endpoints

### Health
- `GET /health`

### Strategies
- `GET /strategies?token=USDC&chainId=8453`
- `GET /recommend?token=USDC`
- `GET /recommendations?token=USDC&riskTolerance=medium`

### Rebalance Tasks
- `GET /rebalance-tasks`
- `POST /rebalance-tasks`
- `DELETE /rebalance-tasks/:id`
- `POST /rebalance-tasks/:id/run`

### Dust
- `GET /dust/tokens?chainId=8453`
- `GET /dust/config?chainId=8453`
- `GET /dust/summary?wallet=0x...`

### Wallet Registry
- `POST /wallets/register`
- `GET /wallets`

## Environment Variables

```env
PORT=3001

# Pimlico (bundler + paymaster)
PIMLICO_API_KEY=your_pimlico_api_key

# Automation signer
AUTOMATION_PRIVATE_KEY=0x...
```

## Development

```bash
npm install
npm run dev
```
