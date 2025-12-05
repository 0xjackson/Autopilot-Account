"use client";

import { useEffect, useState } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract, useSwitchChain } from "wagmi";
import { keccak256, toBytes } from "viem";
import { base } from "wagmi/chains";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CONTRACTS, FACTORY_ABI } from "@/lib/constants";
import { saveWallet } from "@/lib/services/wallet";
import { autopilotApi } from "@/lib/api/client";

export function CreateWallet() {
  const { address: ownerAddress, isConnected, chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const [hasRedirected, setHasRedirected] = useState(false);

  // Check if on correct chain
  const isOnBase = chainId === base.id;

  // Generate salt from owner address
  const salt = ownerAddress ? keccak256(toBytes(ownerAddress)) : null;

  // Check if user already has an account
  const { data: existingAccount, isLoading: isCheckingAccount } = useReadContract({
    address: CONTRACTS.FACTORY,
    abi: FACTORY_ABI,
    functionName: "accountOf",
    args: ownerAddress ? [ownerAddress] : undefined,
    query: {
      enabled: !!ownerAddress,
    },
  });

  // Predict the wallet address
  const { data: predictedAddress } = useReadContract({
    address: CONTRACTS.FACTORY,
    abi: FACTORY_ABI,
    functionName: "getAddress",
    args: ownerAddress && salt ? [ownerAddress, salt] : undefined,
    query: {
      enabled: !!ownerAddress && !!salt,
    },
  });

  const { writeContract, data: hash, isPending, error } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  // Check if user already has an account and redirect
  useEffect(() => {
    if (existingAccount && existingAccount !== "0x0000000000000000000000000000000000000000" && ownerAddress && !hasRedirected) {
      saveWallet(existingAccount as `0x${string}`, ownerAddress);
      setHasRedirected(true);
      window.location.href = "/dashboard";
    }
  }, [existingAccount, ownerAddress, hasRedirected]);

  // Switch to Base network
  const handleSwitchChain = () => {
    switchChain({ chainId: base.id });
  };

  // Create the wallet - uses msg.sender as owner
  const handleCreate = () => {
    if (!salt || !isOnBase) return;

    writeContract({
      address: CONTRACTS.FACTORY,
      abi: FACTORY_ABI,
      functionName: "createAccount",
      args: [salt],
    });
  };

  // When transaction confirms, save the wallet and redirect
  useEffect(() => {
    if (isSuccess && hash && ownerAddress && predictedAddress && !hasRedirected) {
      saveWallet(predictedAddress as `0x${string}`, ownerAddress);

      // Register with backend for scheduler monitoring
      autopilotApi.registerWallet(predictedAddress as string, ownerAddress)
        .catch((err) => console.error("Failed to register wallet with backend:", err));

      setHasRedirected(true);
      window.location.href = "/dashboard";
    }
  }, [isSuccess, hash, ownerAddress, predictedAddress, hasRedirected]);

  if (!isConnected) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Connect Wallet</CardTitle>
          <CardDescription>
            Connect your wallet to create an Autopilot account
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // Show loading while checking for existing account
  if (isCheckingAccount) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Checking Account...</CardTitle>
          <CardDescription>
            Looking for existing Autopilot wallet
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // If user already has an account, show redirect message
  if (existingAccount && existingAccount !== "0x0000000000000000000000000000000000000000") {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Account Found</CardTitle>
          <CardDescription>
            Redirecting to your dashboard...
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Create Autopilot Wallet</CardTitle>
        <CardDescription>
          Deploy your smart wallet on Base with auto-yield enabled
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isOnBase && (
          <div className="bg-yellow-900/50 border border-yellow-600 rounded-lg p-3 text-sm text-yellow-200">
            You're not on Base network. Click below to switch.
          </div>
        )}

        <div className="text-sm text-gray-400">
          <p>Owner: {ownerAddress?.slice(0, 6)}...{ownerAddress?.slice(-4)}</p>
          {predictedAddress && (
            <p>Wallet address: {(predictedAddress as string).slice(0, 6)}...{(predictedAddress as string).slice(-4)}</p>
          )}
          <p className="mt-1">Network: {isOnBase ? "Base" : `Wrong chain (${chainId})`}</p>
        </div>

        {!isOnBase ? (
          <Button
            onClick={handleSwitchChain}
            className="w-full"
          >
            Switch to Base Network
          </Button>
        ) : (
          <Button
            onClick={handleCreate}
            disabled={isPending || isConfirming || !salt}
            className="w-full"
          >
            {isPending ? "Waiting for signature..." :
             isConfirming ? "Creating wallet..." :
             "Create Wallet"}
          </Button>
        )}

        {error && (
          <p className="text-red-400 text-sm">{error.message}</p>
        )}
      </CardContent>
    </Card>
  );
}
