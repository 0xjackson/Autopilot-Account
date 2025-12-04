# Autopilot Backend

Backend service for the Autopilot Wallet, deployed on Railway.

## Features

### Completed (B1-B4)

| Feature | Description | Status |
|---------|-------------|--------|
| **Strategy Indexer** | Live yield data from Morpho/Aave/Moonwell APIs | Done |
| **Recommendation Engine** | Risk-based strategy selection | Done |
| **Scheduler** | Task framework for periodic rebalancing | Done (simulated) |
| **Dust Token Service** | 90+ token metadata catalog | Done |
| **Wallet Registry** | Store registered wallets for automation | Done |

### In Progress (B5-B6)

| Feature | Description | Status |
|---------|-------------|--------|
| **Real UserOp Submission** | Replace `[SIMULATED]` with bundler calls | In Progress |
| **Cron + Registry Integration** | Iterate registered wallets for auto-rebalance | TODO |

## API Endpoints

### Health
- `GET /health` - Service health check

### Strategies
- `GET /strategies?token=USDC&chainId=8453` - List yield strategies
- `GET /recommend?token=USDC` - Get top strategy recommendation
- `GET /recommendations?token=USDC&riskTolerance=medium` - Scored recommendations

### Rebalance Tasks
- `GET /rebalance-tasks` - List scheduled tasks
- `POST /rebalance-tasks` - Create new task
- `DELETE /rebalance-tasks/:id` - Remove task
- `POST /rebalance-tasks/:id/run` - Manually trigger task

### Dust
- `GET /dust/tokens?chainId=8453` - List dust token metadata
- `GET /dust/config?chainId=8453` - Get dust sweep config
- `GET /dust/summary?wallet=0x...` - Wallet dust summary (mock)

### Wallet Registry
- `POST /wallets/register` - Register wallet for automation
- `GET /wallets` - List registered wallets

### Admin
- `POST /admin/refresh-strategies` - Force cache refresh
- `GET /admin/cache-status?chainId=8453` - Check cache status

## Environment Variables

```env
PORT=3001
NODE_ENV=production

# Contract addresses (v2 deployment)
FACTORY_ADDRESS=0xcf10279BAA0d5407Dbb637517d23055A55E72923
MODULE_ADDRESS=0x71b5A4663A49FF02BE672Ea9560256D2268727B7
ADAPTER_ADDRESS=0x42EFecD83447e5b90c5F706309FaC8f9615bd68F

# Automation (for B5)
AUTOMATION_PRIVATE_KEY=0x...
CDP_API_KEY=your_cdp_api_key
```

## Development

```bash
npm install
npm run dev  # Runs on :3001
```

## Deployment

Deployed on Railway at: https://your-railway-url.up.railway.app
