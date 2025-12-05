import { Pool } from "pg";

// ============================================================================
// Database Connection
// ============================================================================

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("localhost")
    ? false
    : { rejectUnauthorized: false }, // Railway requires SSL
});

// ============================================================================
// Types
// ============================================================================

export interface RegisteredWallet {
  wallet: string;
  owner: string;
  created_at: Date;
}

// ============================================================================
// Database Initialization
// ============================================================================

/**
 * Initialize the database schema
 * Creates the wallets table if it doesn't exist
 */
export async function initDatabase(): Promise<void> {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS wallets (
        wallet VARCHAR(42) PRIMARY KEY,
        owner VARCHAR(42) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log("[db] Database initialized successfully");
  } catch (error) {
    console.error("[db] Failed to initialize database:", error);
    throw error;
  }
}

// ============================================================================
// Wallet Registry Functions
// ============================================================================

/**
 * Register a wallet in the database
 * Idempotent: updates owner if wallet already exists
 */
export async function registerWallet(
  wallet: string,
  owner: string
): Promise<void> {
  const walletLower = wallet.toLowerCase();
  const ownerLower = owner.toLowerCase();

  await pool.query(
    `INSERT INTO wallets (wallet, owner, created_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (wallet) DO UPDATE SET owner = $2`,
    [walletLower, ownerLower]
  );
}

/**
 * Get all registered wallet addresses
 * Used by scheduler to check wallets for rebalancing
 */
export async function getRegisteredWallets(): Promise<string[]> {
  const result = await pool.query("SELECT wallet FROM wallets");
  return result.rows.map((row) => row.wallet);
}

/**
 * Get a specific wallet by address
 */
export async function getWallet(
  address: string
): Promise<RegisteredWallet | null> {
  const result = await pool.query(
    "SELECT wallet, owner, created_at FROM wallets WHERE wallet = $1",
    [address.toLowerCase()]
  );
  return result.rows[0] || null;
}

/**
 * Get count of registered wallets
 */
export async function getRegisteredWalletCount(): Promise<number> {
  const result = await pool.query("SELECT COUNT(*) FROM wallets");
  return parseInt(result.rows[0].count, 10);
}

/**
 * Check if database is connected
 */
export async function isDatabaseConnected(): Promise<boolean> {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}
