// Mock data for development - replace with real blockchain data later

export interface WalletBalances {
  checking: string;
  yield: string;
  total: string;
}

export interface YieldStrategy {
  name: string;
  apy: string;
  enabled: boolean;
}

export interface Settings {
  checkingThreshold: string;
  yieldEnabled: boolean;
  dustSweepEnabled: boolean;
  dustThreshold: string;
}

export interface Transaction {
  id: string;
  type: "send" | "receive" | "yield_deposit" | "yield_withdraw";
  amount: string;
  token: string;
  timestamp: Date;
  status: "pending" | "confirmed";
}

// Mock wallet balances
export const mockBalances: WalletBalances = {
  checking: "500.00",
  yield: "2,450.00",
  total: "2,950.00",
};

// Mock yield strategy info
export const mockYieldStrategy: YieldStrategy = {
  name: "Aerodrome USDC Vault",
  apy: "4.2%",
  enabled: true,
};

// Mock settings
export const mockSettings: Settings = {
  checkingThreshold: "500",
  yieldEnabled: true,
  dustSweepEnabled: true,
  dustThreshold: "1.00",
};

// Mock recent transactions
export const mockTransactions: Transaction[] = [
  {
    id: "1",
    type: "send",
    amount: "50.00",
    token: "USDC",
    timestamp: new Date(Date.now() - 3600000),
    status: "confirmed",
  },
  {
    id: "2",
    type: "yield_deposit",
    amount: "200.00",
    token: "USDC",
    timestamp: new Date(Date.now() - 7200000),
    status: "confirmed",
  },
  {
    id: "3",
    type: "receive",
    amount: "1,000.00",
    token: "USDC",
    timestamp: new Date(Date.now() - 86400000),
    status: "confirmed",
  },
];

// Supported tokens for pay page
export const supportedTokens = [
  { symbol: "USDC", name: "USD Coin", address: "0x..." },
  { symbol: "ETH", name: "Ethereum", address: "native" },
];
