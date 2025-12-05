"use client";

import { useEffect, useState, useCallback } from "react";
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
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain();
  const [hasRedirected, setHasRedirected] = useState(false);
  const [autoCreateTriggered, setAutoCreateTriggered] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [currentOwner, setCurrentOwner] = useState<string | undefined>(undefined);

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

  // Handle EOA switch - reset state when owner changes (only if no tx in progress)
  useEffect(() => {
    if (ownerAddress && ownerAddress !== currentOwner) {
      // Only reset if no transaction is pending or confirming
      if (!isPending && !isConfirming) {
        setCurrentOwner(ownerAddress);
        setHasRedirected(false);
        setAutoCreateTriggered(false);
        setStatusMessage("");
      }
    }
  }, [ownerAddress, currentOwner, isPending, isConfirming]);

  // Handle the create wallet button click - switches chain if needed, then creates wallet
  const handleCreateClick = useCallback(() => {
    if (!salt || isPending || isConfirming) return;

    // If not on Base, switch first - the effect below will trigger wallet creation after switch
    if (!isOnBase && !isSwitchingChain) {
      setAutoCreateTriggered(true); // Mark that user initiated the flow
      setStatusMessage("Switching to Base network...");
      switchChain({ chainId: base.id });
      return;
    }

    // Already on Base, create wallet directly
    setAutoCreateTriggered(true);
    setStatusMessage("Waiting for signature...");
    writeContract({
      address: CONTRACTS.FACTORY,
      abi: FACTORY_ABI,
      functionName: "createAccount",
      args: [salt],
    });
  }, [salt, isOnBase, isSwitchingChain, isPending, isConfirming, switchChain, writeContract]);

  // After chain switch completes, auto-trigger wallet creation (only if user initiated)
  useEffect(() => {
    if (autoCreateTriggered && isOnBase && salt && !isPending && !isConfirming && !hash && !isSwitchingChain) {
      setStatusMessage("Waiting for signature...");
      writeContract({
        address: CONTRACTS.FACTORY,
        abi: FACTORY_ABI,
        functionName: "createAccount",
        args: [salt],
      });
    }
  }, [autoCreateTriggered, isOnBase, salt, isPending, isConfirming, hash, isSwitchingChain, writeContract]);

  // Check if user already has an account and redirect
  useEffect(() => {
    if (existingAccount && existingAccount !== "0x0000000000000000000000000000000000000000" && ownerAddress && !hasRedirected) {
      saveWallet(existingAccount as `0x${string}`, ownerAddress);

      // Register with backend for scheduler monitoring
      autopilotApi.registerWallet(existingAccount as string, ownerAddress)
        .catch((err) => console.error("Failed to register wallet with backend:", err));

      setHasRedirected(true);
      window.location.href = "/dashboard";
    }
  }, [existingAccount, ownerAddress, hasRedirected]);

  // Update status message based on state
  useEffect(() => {
    if (isPending) {
      setStatusMessage("Waiting for signature...");
    } else if (isConfirming) {
      setStatusMessage("Creating wallet...");
    } else if (isSwitchingChain) {
      setStatusMessage("Switching to Base network...");
    }
  }, [isPending, isConfirming, isSwitchingChain]);

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

  // Determine the current status for display
  const isProcessing = isSwitchingChain || isPending || isConfirming;
  const displayStatus = statusMessage || (
    isSwitchingChain ? "Switching to Base network..." :
    isPending ? "Waiting for signature..." :
    isConfirming ? "Creating wallet..." :
    "Setting up your wallet..."
  );

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Create Autopilot Wallet</CardTitle>
        <CardDescription>
          Deploy your smart wallet on Base with auto-yield enabled
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-sm text-gray-400">
          <p>Owner: {ownerAddress?.slice(0, 6)}...{ownerAddress?.slice(-4)}</p>
          {predictedAddress && (
            <p>Wallet address: {(predictedAddress as string).slice(0, 6)}...{(predictedAddress as string).slice(-4)}</p>
          )}
          <p className="mt-1">Network: {isOnBase ? "Base" : `Switching to Base...`}</p>
        </div>

        {isProcessing ? (
          <div className="flex items-center justify-center gap-3 py-4">
            <div className="w-5 h-5 border-2 border-[#4169E1] border-t-transparent rounded-full animate-spin" />
            <span className="text-gray-600">{displayStatus}</span>
          </div>
        ) : (
          <Button
            onClick={handleCreateClick}
            disabled={!salt}
            className="w-full"
          >
            Create Wallet
          </Button>
        )}

        {error && (
          <div className="space-y-2">
            <p className="text-red-400 text-sm">{error.message}</p>
            <Button
              onClick={() => {
                setAutoCreateTriggered(false);
                handleCreateClick();
              }}
              className="w-full"
              variant="outline"
            >
              Try Again
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
