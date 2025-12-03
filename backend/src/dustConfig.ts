/**
 * B4: Dust Token Metadata Registry
 *
 * Contains metadata for tokens that may appear as "dust" in wallets,
 * including airdrop tokens, small LP remnants, and other low-value balances.
 *
 * NOTE: This is mocked data for demo purposes.
 * TODO: In production, fetch token metadata from on-chain or external APIs
 *       (e.g., CoinGecko, token lists, or DEX metadata).
 */

import { DustTokenMeta } from "./types";
import { CHAIN_IDS, TOKEN_ADDRESSES } from "./strategies";

// ============================================================================
// Dust Token Registry
// ============================================================================

/**
 * Registry of known tokens on Base that may be treated as dust
 *
 * Includes:
 * - Consolidation targets (USDC, WETH) - tokens to sweep INTO
 * - Dust sources (airdrops, meme coins, LP tokens) - tokens to sweep FROM
 */
export const dustTokens: DustTokenMeta[] = [
  // ============ Consolidation Targets (Base Mainnet) ============
  {
    chainId: CHAIN_IDS.BASE_MAINNET,
    tokenAddress: TOKEN_ADDRESSES[CHAIN_IDS.BASE_MAINNET].USDC,
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    isDustSource: false,
    suggestedAction: "hold",
    isConsolidationTarget: true,
    notes: "Primary consolidation target - stablecoin",
  },
  {
    chainId: CHAIN_IDS.BASE_MAINNET,
    tokenAddress: TOKEN_ADDRESSES[CHAIN_IDS.BASE_MAINNET].WETH,
    symbol: "WETH",
    name: "Wrapped Ether",
    decimals: 18,
    isDustSource: false,
    suggestedAction: "hold",
    isConsolidationTarget: true,
    notes: "Secondary consolidation target",
  },
  {
    chainId: CHAIN_IDS.BASE_MAINNET,
    tokenAddress: TOKEN_ADDRESSES[CHAIN_IDS.BASE_MAINNET].USDbC,
    symbol: "USDbC",
    name: "Bridged USD Coin",
    decimals: 6,
    isDustSource: true,
    suggestedAction: "swap",
    consolidationTarget: TOKEN_ADDRESSES[CHAIN_IDS.BASE_MAINNET].USDC,
    notes: "Old bridged USDC - swap to native USDC",
    dustThreshold: 1,
  },

  // ============ Dust Sources - Airdrop Tokens (Base Mainnet) ============
  {
    chainId: CHAIN_IDS.BASE_MAINNET,
    tokenAddress: "0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed",
    symbol: "DEGEN",
    name: "Degen",
    decimals: 18,
    isDustSource: true,
    suggestedAction: "swap",
    consolidationTarget: TOKEN_ADDRESSES[CHAIN_IDS.BASE_MAINNET].USDC,
    notes: "Farcaster airdrop token",
    dustThreshold: 100,
  },
  {
    chainId: CHAIN_IDS.BASE_MAINNET,
    tokenAddress: "0x940181a94A35A4569E4529A3CDfB74e38FD98631",
    symbol: "AERO",
    name: "Aerodrome Finance",
    decimals: 18,
    isDustSource: true,
    suggestedAction: "swap",
    consolidationTarget: TOKEN_ADDRESSES[CHAIN_IDS.BASE_MAINNET].USDC,
    notes: "Aerodrome DEX token - may have value",
    dustThreshold: 10,
  },
  {
    chainId: CHAIN_IDS.BASE_MAINNET,
    tokenAddress: "0x0578d8A44db98B23BF096A382e016e29a5Ce0ffe",
    symbol: "HIGHER",
    name: "Higher",
    decimals: 18,
    isDustSource: true,
    suggestedAction: "swap",
    consolidationTarget: TOKEN_ADDRESSES[CHAIN_IDS.BASE_MAINNET].USDC,
    notes: "Meme token airdrop",
    dustThreshold: 1000,
  },
  {
    chainId: CHAIN_IDS.BASE_MAINNET,
    tokenAddress: "0xAC1Bd2486aAf3B5C0fc3Fd868558b082a531B2B4",
    symbol: "TOSHI",
    name: "Toshi",
    decimals: 18,
    isDustSource: true,
    suggestedAction: "swap",
    consolidationTarget: TOKEN_ADDRESSES[CHAIN_IDS.BASE_MAINNET].USDC,
    notes: "Base meme coin",
    dustThreshold: 10000,
  },
  {
    chainId: CHAIN_IDS.BASE_MAINNET,
    tokenAddress: "0x532f27101965dd16442E59d40670FaF5eBB142E4",
    symbol: "BRETT",
    name: "Brett",
    decimals: 18,
    isDustSource: true,
    suggestedAction: "swap",
    consolidationTarget: TOKEN_ADDRESSES[CHAIN_IDS.BASE_MAINNET].USDC,
    notes: "Pepe-inspired meme coin on Base",
    dustThreshold: 1000,
  },

  // ============ Tokens to Ignore (Base Mainnet) ============
  {
    chainId: CHAIN_IDS.BASE_MAINNET,
    tokenAddress: "0x0000000000000000000000000000000000001234",
    symbol: "SCAM",
    name: "Fake Airdrop Token",
    decimals: 18,
    isDustSource: false,
    suggestedAction: "ignore",
    notes: "Known scam token - do not interact",
  },
  {
    chainId: CHAIN_IDS.BASE_MAINNET,
    tokenAddress: "0x0000000000000000000000000000000000005678",
    symbol: "PHISH",
    name: "Phishing Token",
    decimals: 18,
    isDustSource: false,
    suggestedAction: "ignore",
    notes: "Malicious token - ignore completely",
  },

  // ============ Base Sepolia (Testnet) ============
  {
    chainId: CHAIN_IDS.BASE_SEPOLIA,
    tokenAddress: TOKEN_ADDRESSES[CHAIN_IDS.BASE_SEPOLIA].USDC,
    symbol: "USDC",
    name: "USD Coin (Testnet)",
    decimals: 6,
    isDustSource: false,
    suggestedAction: "hold",
    isConsolidationTarget: true,
    notes: "Testnet USDC - consolidation target",
  },
  {
    chainId: CHAIN_IDS.BASE_SEPOLIA,
    tokenAddress: TOKEN_ADDRESSES[CHAIN_IDS.BASE_SEPOLIA].WETH,
    symbol: "WETH",
    name: "Wrapped Ether (Testnet)",
    decimals: 18,
    isDustSource: false,
    suggestedAction: "hold",
    isConsolidationTarget: true,
    notes: "Testnet WETH",
  },
  {
    chainId: CHAIN_IDS.BASE_SEPOLIA,
    tokenAddress: "0xTEST0000000000000000000000000000DUST01",
    symbol: "TDUST",
    name: "Test Dust Token",
    decimals: 18,
    isDustSource: true,
    suggestedAction: "swap",
    consolidationTarget: TOKEN_ADDRESSES[CHAIN_IDS.BASE_SEPOLIA].USDC,
    notes: "Test airdrop token for demo",
    dustThreshold: 100,
  },
];

// ============================================================================
// Default Consolidation Configuration
// ============================================================================

/**
 * Default consolidation token by chain
 */
export const DEFAULT_CONSOLIDATION_TOKEN: Record<number, string> = {
  [CHAIN_IDS.BASE_MAINNET]: "USDC",
  [CHAIN_IDS.BASE_SEPOLIA]: "USDC",
};

/**
 * Default consolidation address by chain
 */
export const DEFAULT_CONSOLIDATION_ADDRESS: Record<number, string> = {
  [CHAIN_IDS.BASE_MAINNET]: TOKEN_ADDRESSES[CHAIN_IDS.BASE_MAINNET].USDC,
  [CHAIN_IDS.BASE_SEPOLIA]: TOKEN_ADDRESSES[CHAIN_IDS.BASE_SEPOLIA].USDC,
};

// TODO: In production, token metadata would be fetched from:
// - On-chain token contracts (name, symbol, decimals)
// - CoinGecko API for pricing and metadata
// - Token list registries (e.g., Uniswap token lists)
// - DEX subgraphs for liquidity/tradability info
