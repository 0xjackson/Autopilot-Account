import {
  type Address,
  type Hex,
  encodeFunctionData,
  keccak256,
  concat,
  toHex,
  pad,
  createPublicClient,
  http,
} from "viem";
import { baseSepolia } from "viem/chains";
import {
  CONTRACTS,
  FACTORY_ADDRESS,
  FACTORY_ABI,
  CHAIN_CONFIG,
  isFactoryReady,
} from "@/lib/constants";

/**
 * Public client for read operations
 */
const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(CHAIN_CONFIG.RPC_URL),
});

/**
 * Wallet creation response from the factory
 */
export interface CreateWalletResponse {
  smartAccountAddress: Address;
  transactionHash: string;
}

/**
 * Wallet creation configuration
 */
export interface CreateWalletConfig {
  owner: Address;
  initialCheckingThreshold?: bigint;
}

/**
 * Result of preparing a smart wallet creation transaction
 */
export interface PreparedSmartWalletTx {
  /** The predicted counterfactual address of the smart wallet */
  predictedAddress: Address;
  /** The salt used for deterministic deployment */
  salt: Hex;
  /** The transaction request ready to be submitted */
  txRequest: {
    to: Address;
    data: Hex;
  };
  /** Whether the factory contract is deployed and ready */
  isFactoryReady: boolean;
}

/**
 * Generate a deterministic salt from owner address
 * Uses a simple approach: keccak256(owner + nonce)
 * The nonce of 0 means first wallet for this owner
 *
 * @param owner - The EOA owner address
 * @param nonce - Optional nonce for multiple wallets (default: 0)
 * @returns A bytes32 salt value
 */
export function generateSalt(owner: Address, nonce: number = 0): Hex {
  const packed = concat([owner as Hex, pad(toHex(nonce), { size: 32 })]);
  return keccak256(packed);
}

/**
 * Predict the counterfactual smart wallet address
 * This uses CREATE2 address derivation based on factory + salt + initCodeHash
 *
 * @param owner - The EOA owner address
 * @param salt - The salt for deterministic deployment
 * @returns The predicted smart wallet address
 */
export async function predictSmartWalletAddress(
  owner: Address,
  salt: Hex
): Promise<Address> {
  // If factory is not deployed, return a mock address for development
  if (!isFactoryReady() || !FACTORY_ADDRESS || !FACTORY_ABI) {
    console.log(
      "[DEV] Factory not deployed, generating mock counterfactual address"
    );
    // Generate a deterministic mock address based on owner and salt
    const mockHash = keccak256(concat([owner as Hex, salt]));
    return `0x${mockHash.slice(26)}` as Address;
  }

  // Call factory.getAddress(owner, salt) to get the counterfactual address
  try {
    const address = await publicClient.readContract({
      address: FACTORY_ADDRESS,
      abi: FACTORY_ABI,
      functionName: "getAddress",
      args: [owner, salt],
    });
    return address as Address;
  } catch (error) {
    console.error("Failed to predict address from factory:", error);
    // Fallback to mock address
    const mockHash = keccak256(concat([owner as Hex, salt]));
    return `0x${mockHash.slice(26)}` as Address;
  }
}

/**
 * Prepare the smart wallet creation transaction
 *
 * This function:
 * 1. Generates a deterministic salt from the owner address
 * 2. Predicts the counterfactual smart wallet address
 * 3. Prepares the transaction call for the factory's createAccountFor function
 * 4. Returns the predicted address and transaction request
 *
 * NOTE: This does NOT execute the transaction - it only prepares the data.
 * The actual transaction should be submitted using wagmi's writeContract.
 *
 * @param owner - The EOA address that will own the smart wallet
 * @returns PreparedSmartWalletTx with predicted address and tx request
 */
export async function createSmartWallet(
  owner: Address
): Promise<PreparedSmartWalletTx> {
  // Step 1: Generate salt
  const salt = generateSalt(owner, 0);
  console.log("[Wallet] Generated salt:", salt);

  // Step 2: Predict counterfactual address
  const predictedAddress = await predictSmartWalletAddress(owner, salt);
  console.log("[Wallet] Predicted smart wallet address:", predictedAddress);

  // Step 3: Check if factory is ready
  const factoryReady = isFactoryReady();

  // Step 4: Prepare transaction data (even if factory not deployed, for testing)
  const factoryAbi = FACTORY_ABI ?? [
    {
      name: "createAccountFor",
      type: "function",
      stateMutability: "nonpayable",
      inputs: [
        { name: "owner", type: "address" },
        { name: "salt", type: "bytes32" },
      ],
      outputs: [{ name: "account", type: "address" }],
    },
  ];

  const data = encodeFunctionData({
    abi: factoryAbi,
    functionName: "createAccountFor",
    args: [owner, salt],
  });

  console.log("[Wallet] Encoded createAccountFor calldata:", data);

  // Step 5: Build transaction request
  const txRequest = {
    to: FACTORY_ADDRESS ?? CONTRACTS.FACTORY,
    data,
  };

  console.log("[Wallet] Transaction request prepared:", {
    to: txRequest.to,
    dataLength: txRequest.data.length,
    isFactoryReady: factoryReady,
  });

  return {
    predictedAddress,
    salt,
    txRequest,
    isFactoryReady: factoryReady,
  };
}

/**
 * Check if a smart account already exists for an owner
 *
 * @param owner - The EOA address to check
 * @returns The smart account address if exists, null otherwise
 */
export async function getExistingSmartAccount(
  owner: Address
): Promise<Address | null> {
  // If factory is not deployed, return null
  if (!isFactoryReady() || !FACTORY_ADDRESS || !FACTORY_ABI) {
    console.log("[DEV] Factory not deployed, checking localStorage fallback");

    // Check localStorage for previously created wallet
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("autopilotWalletAddress");
      const storedOwner = localStorage.getItem("autopilotWalletOwner");
      if (stored && storedOwner === owner) {
        return stored as Address;
      }
    }
    return null;
  }

  try {
    // Call factory.accountOf(owner) to check if account exists
    const existingAddress = await publicClient.readContract({
      address: FACTORY_ADDRESS,
      abi: FACTORY_ABI,
      functionName: "accountOf",
      args: [owner],
    });

    // If address is zero, no account exists
    if (
      existingAddress === "0x0000000000000000000000000000000000000000" ||
      !existingAddress
    ) {
      return null;
    }

    // Verify there's code at the address (account is deployed)
    const code = await publicClient.getBytecode({
      address: existingAddress as Address,
    });

    if (!code || code === "0x") {
      return null;
    }

    return existingAddress as Address;
  } catch (error) {
    console.error("Failed to check existing smart account:", error);
    return null;
  }
}

/**
 * Get the smart account address for an owner (counterfactual)
 * Does not deploy - just computes what the address would be
 *
 * @param owner - The EOA owner address
 * @returns The counterfactual smart account address
 */
export async function getSmartAccountAddress(owner: Address): Promise<Address> {
  const salt = generateSalt(owner, 0);
  return predictSmartWalletAddress(owner, salt);
}

/**
 * Check if a smart account is deployed
 *
 * @param address - The smart account address to check
 * @returns True if deployed, false otherwise
 */
export async function isSmartAccountDeployed(
  address: Address
): Promise<boolean> {
  try {
    const code = await publicClient.getBytecode({ address });
    return code !== undefined && code !== "0x";
  } catch (error) {
    console.error("Failed to check deployment status:", error);
    return false;
  }
}

/**
 * Mock session key registration with backend
 * This will be replaced with actual backend API call
 *
 * @param smartAccountAddress - The smart account address
 * @param ownerAddress - The owner EOA address
 * @returns Promise resolving to success status
 */
export async function registerSessionKey(
  smartAccountAddress: Address,
  ownerAddress: Address
): Promise<{ success: boolean; sessionKeyAddress?: Address }> {
  console.log("[Mock] Registering session key for:", {
    smartAccountAddress,
    ownerAddress,
  });

  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Return mock response
  return {
    success: true,
    sessionKeyAddress: "0x1234567890123456789012345678901234567890" as Address,
  };
}
