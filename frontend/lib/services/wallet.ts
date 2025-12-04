import { type Address, createPublicClient, http, keccak256, toBytes } from "viem";
import { baseSepolia } from "viem/chains"; // Use base for mainnet
import { CONTRACTS, FACTORY_ABI, API_URL } from "../constants";

// =============================================================================
// Types
// =============================================================================

export interface CreateWalletResponse {
  smartAccountAddress: Address;
  transactionHash: string;
}

export interface CreateWalletConfig {
  owner: Address;
}

// =============================================================================
// Viem Client
// =============================================================================

const publicClient = createPublicClient({
  chain: baseSepolia, // Change to `base` for mainnet
  transport: http(),
});

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Generate a deterministic salt from the owner address
 * This ensures the same owner always gets the same wallet address
 */
function generateSalt(owner: Address): `0x${string}` {
  return keccak256(toBytes(owner));
}

/**
 * Fetch the automation session key from the backend
 */
async function getAutomationKey(): Promise<Address> {
  try {
    const response = await fetch(`${API_URL}/automation-key`);
    if (!response.ok) {
      throw new Error("Failed to fetch automation key");
    }
    const data = await response.json();
    return data.address as Address;
  } catch (error) {
    console.warn("Could not fetch automation key, using mock:", error);
    // Mock address for development when backend isn't running
    return "0x1234567890123456789012345678901234567890" as Address;
  }
}

// =============================================================================
// Main Functions
// =============================================================================

/**
 * Check if a smart account already exists for an owner
 */
export async function getExistingSmartAccount(
  owner: Address
): Promise<Address | null> {
  try {
    const salt = generateSalt(owner);

    // Get the counterfactual address
    const predictedAddress = await publicClient.readContract({
      address: CONTRACTS.FACTORY,
      abi: FACTORY_ABI,
      functionName: "getAddress",
      args: [owner, salt],
    });

    // Check if code exists at that address
    const code = await publicClient.getBytecode({ address: predictedAddress });

    if (code && code !== "0x") {
      return predictedAddress;
    }

    return null;
  } catch (error) {
    console.error("Error checking existing account:", error);
    return null;
  }
}

/**
 * Create a new Autopilot smart wallet
 *
 * This function is called after the user signs with their EOA.
 * It calls the factory contract to deploy a new Kernel wallet
 * with the AutoYieldModule pre-installed.
 */
export async function createSmartWallet(
  config: CreateWalletConfig
): Promise<CreateWalletResponse> {
  const { owner } = config;

  // Step 1: Get the automation key (for now this is mocked)
  const automationKey = await getAutomationKey();
  console.log("[wallet] Using automation key:", automationKey);

  // Step 2: Generate salt
  const salt = generateSalt(owner);
  console.log("[wallet] Generated salt:", salt);

  // Step 3: Check if factory is deployed (is address non-zero?)
  if (CONTRACTS.FACTORY === "0x0000000000000000000000000000000000000000") {
    console.warn("[wallet] Factory not deployed yet, returning mock response");

    // Return a mock response for development
    // The "address" is deterministic based on owner so it's consistent
    const mockAddress = `0x${owner.slice(2, 10).padEnd(40, "0")}` as Address;

    // Save to localStorage
    localStorage.setItem("autopilotWalletAddress", mockAddress);
    localStorage.setItem("autopilotWalletOwner", owner);

    return {
      smartAccountAddress: mockAddress,
      transactionHash: `0x${"0".repeat(64)}`,
    };
  }

  // Step 4: Actually call the factory
  // This requires the user to sign a transaction
  // We use wagmi's writeContract in the component, not here
  // This function is called AFTER the transaction is submitted

  throw new Error(
    "Real factory deployment not implemented yet. " +
    "This will use wagmi's useWriteContract hook in the CreateWallet component."
  );
}

/**
 * Get the counterfactual address for an owner
 * Does not deploy, just computes what the address would be
 */
export async function getSmartAccountAddress(owner: Address): Promise<Address> {
  if (CONTRACTS.FACTORY === "0x0000000000000000000000000000000000000000") {
    // Mock: return deterministic address
    return `0x${owner.slice(2, 10).padEnd(40, "0")}` as Address;
  }

  const salt = generateSalt(owner);

  return await publicClient.readContract({
    address: CONTRACTS.FACTORY,
    abi: FACTORY_ABI,
    functionName: "getAddress",
    args: [owner, salt],
  });
}

/**
 * Load saved wallet from localStorage
 */
export function getSavedWallet(): { address: Address; owner: Address } | null {
  const address = localStorage.getItem("autopilotWalletAddress");
  const owner = localStorage.getItem("autopilotWalletOwner");

  if (address && owner) {
    return {
      address: address as Address,
      owner: owner as Address,
    };
  }

  return null;
}

/**
 * Save wallet to localStorage
 */
export function saveWallet(address: Address, owner: Address): void {
  localStorage.setItem("autopilotWalletAddress", address);
  localStorage.setItem("autopilotWalletOwner", owner);
}

/**
 * Clear saved wallet from localStorage
 */
export function clearSavedWallet(): void {
  localStorage.removeItem("autopilotWalletAddress");
  localStorage.removeItem("autopilotWalletOwner");
}
