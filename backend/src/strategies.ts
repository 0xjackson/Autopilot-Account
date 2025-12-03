import { Strategy } from "./types";
import { getAdapterAddress } from "./config/adapterAddresses";

/**
 * Chain IDs for supported networks
 */
export const CHAIN_IDS = {
  BASE_MAINNET: 8453,
  BASE_SEPOLIA: 84532,
} as const;

/**
 * Known token addresses on Base
 * Note: These are placeholder addresses for demo purposes.
 * In production, use actual deployed contract addresses.
 */
export const TOKEN_ADDRESSES = {
  [CHAIN_IDS.BASE_MAINNET]: {
    USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // Real USDC on Base
    WETH: "0x4200000000000000000000000000000000000006", // Real WETH on Base
    USDbC: "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA", // Bridged USDC on Base
  },
  [CHAIN_IDS.BASE_SEPOLIA]: {
    USDC: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // Test USDC on Base Sepolia
    WETH: "0x4200000000000000000000000000000000000006", // WETH on Base Sepolia
  },
} as const;

/**
 * Curated list of yield strategies
 *
 * For hackathon/demo: APY values are mocked.
 * TODO: In production, these would be fetched from DeFiLlama or protocol APIs
 * via refreshApyForAllStrategies() (see strategyService.ts)
 */
export const strategies: Strategy[] = [
  // ============ USDC Strategies on Base Mainnet ============
  {
    id: "aave-usdc-base",
    chainId: CHAIN_IDS.BASE_MAINNET,
    token: "USDC",
    tokenAddress: TOKEN_ADDRESSES[CHAIN_IDS.BASE_MAINNET].USDC,
    vaultAddress: "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5", // Aave aUSDC on Base (placeholder)
    adapterAddress: getAdapterAddress(CHAIN_IDS.BASE_MAINNET, "aave", "USDC"),
    protocolName: "Aave V3",
    apy: 0.052, // 5.2% APY (mocked)
    riskTier: "low",
    isActive: true,
  },
  {
    id: "moonwell-usdc-base",
    chainId: CHAIN_IDS.BASE_MAINNET,
    token: "USDC",
    tokenAddress: TOKEN_ADDRESSES[CHAIN_IDS.BASE_MAINNET].USDC,
    vaultAddress: "0xEdc817A28E8B93B03976FBd4a3dDBc9f7D176c22", // Moonwell mUSDC (placeholder)
    adapterAddress: getAdapterAddress(CHAIN_IDS.BASE_MAINNET, "moonwell", "USDC"),
    protocolName: "Moonwell",
    apy: 0.078, // 7.8% APY (mocked)
    riskTier: "low",
    isActive: true,
  },
  {
    id: "compound-usdc-base",
    chainId: CHAIN_IDS.BASE_MAINNET,
    token: "USDC",
    tokenAddress: TOKEN_ADDRESSES[CHAIN_IDS.BASE_MAINNET].USDC,
    vaultAddress: "0x9c4ec768c28520B50860ea7a15bd7213a9fF58bf", // Compound cUSDCv3 (placeholder)
    adapterAddress: "0xAdapterCompoundUSDC0000000000000000000", // No Compound adapter yet
    protocolName: "Compound V3",
    apy: 0.061, // 6.1% APY (mocked)
    riskTier: "low",
    isActive: true,
  },
  {
    id: "mock-highyield-usdc-base",
    chainId: CHAIN_IDS.BASE_MAINNET,
    token: "USDC",
    tokenAddress: TOKEN_ADDRESSES[CHAIN_IDS.BASE_MAINNET].USDC,
    vaultAddress: "0x1234567890123456789012345678901234567890", // Mock vault
    adapterAddress: "0xAdapterMockVaultUSDC00000000000000000", // Mock adapter
    protocolName: "MockYieldVault",
    apy: 0.15, // 15% APY (mocked - for demo)
    riskTier: "high",
    isActive: true,
  },
  {
    id: "deprecated-usdc-vault",
    chainId: CHAIN_IDS.BASE_MAINNET,
    token: "USDC",
    tokenAddress: TOKEN_ADDRESSES[CHAIN_IDS.BASE_MAINNET].USDC,
    vaultAddress: "0x0000000000000000000000000000000000000001",
    adapterAddress: "0xAdapterDeprecated000000000000000000000",
    protocolName: "DeprecatedVault",
    apy: 0.20, // High APY but inactive
    riskTier: "high",
    isActive: false, // Not active - should be filtered out
  },

  // ============ WETH Strategies on Base Mainnet ============
  {
    id: "aave-weth-base",
    chainId: CHAIN_IDS.BASE_MAINNET,
    token: "WETH",
    tokenAddress: TOKEN_ADDRESSES[CHAIN_IDS.BASE_MAINNET].WETH,
    vaultAddress: "0xD4a0e0b9149BCee3C920d2E00b5dE09138fd8bb7", // Aave aWETH (placeholder)
    adapterAddress: getAdapterAddress(CHAIN_IDS.BASE_MAINNET, "aave", "WETH"),
    protocolName: "Aave V3",
    apy: 0.021, // 2.1% APY (mocked)
    riskTier: "low",
    isActive: true,
  },
  {
    id: "moonwell-weth-base",
    chainId: CHAIN_IDS.BASE_MAINNET,
    token: "WETH",
    tokenAddress: TOKEN_ADDRESSES[CHAIN_IDS.BASE_MAINNET].WETH,
    vaultAddress: "0x628ff693426583D9a7FB391E54366292F509D457", // Moonwell mWETH (placeholder)
    adapterAddress: getAdapterAddress(CHAIN_IDS.BASE_MAINNET, "moonwell", "WETH"),
    protocolName: "Moonwell",
    apy: 0.032, // 3.2% APY (mocked)
    riskTier: "low",
    isActive: true,
  },

  // ============ USDC Strategies on Base Sepolia (for testing) ============
  {
    id: "mock-usdc-vault-sepolia",
    chainId: CHAIN_IDS.BASE_SEPOLIA,
    token: "USDC",
    tokenAddress: TOKEN_ADDRESSES[CHAIN_IDS.BASE_SEPOLIA].USDC,
    vaultAddress: "0xABCDEF1234567890ABCDEF1234567890ABCDEF12", // Mock vault for testnet
    adapterAddress: getAdapterAddress(CHAIN_IDS.BASE_SEPOLIA, "morpho", "USDC"),
    protocolName: "MockYieldVault",
    apy: 0.12, // 12% APY (mocked)
    riskTier: "med",
    isActive: true,
  },
  {
    id: "test-usdc-vault-sepolia",
    chainId: CHAIN_IDS.BASE_SEPOLIA,
    token: "USDC",
    tokenAddress: TOKEN_ADDRESSES[CHAIN_IDS.BASE_SEPOLIA].USDC,
    vaultAddress: "0xFEDCBA0987654321FEDCBA0987654321FEDCBA09", // Another test vault
    adapterAddress: getAdapterAddress(CHAIN_IDS.BASE_SEPOLIA, "aave", "USDC"),
    protocolName: "TestVault",
    apy: 0.08, // 8% APY (mocked)
    riskTier: "low",
    isActive: true,
  },
];

// TODO: Add more strategies as they become available
// - Yearn vaults on Base
// - Beefy Finance strategies
// - Native Base LP strategies (Aerodrome, BaseSwap)
