"use client";

import { useState } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { keccak256, toBytes } from "viem";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CONTRACTS, FACTORY_ABI } from "@/lib/constants";
import { saveWallet, getSmartAccountAddress } from "@/lib/services/wallet";

export function CreateWallet() {
  const { address: ownerAddress, isConnected } = useAccount();
  const [predictedAddress, setPredictedAddress] = useState<string | null>(null);

  const { writeContract, data: hash, isPending, error } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  // Generate salt from owner address
  const salt = ownerAddress ? keccak256(toBytes(ownerAddress)) : null;

  // Predict the wallet address
  const predictAddress = async () => {
    if (!ownerAddress) return;
    const predicted = await getSmartAccountAddress(ownerAddress);
    setPredictedAddress(predicted);
  };

  // Create the wallet
  const handleCreate = () => {
    if (!ownerAddress || !salt) return;

    // If factory isn't deployed, use mock flow
    if (CONTRACTS.FACTORY === "0x0000000000000000000000000000000000000000") {
      // Mock: just save a fake address
      const mockAddress = `0x${ownerAddress.slice(2, 10).padEnd(40, "0")}`;
      saveWallet(mockAddress as `0x${string}`, ownerAddress);
      window.location.href = "/dashboard";
      return;
    }

    // Real factory call
    writeContract({
      address: CONTRACTS.FACTORY,
      abi: FACTORY_ABI,
      functionName: "createAccount",
      args: [ownerAddress, salt],
    });
  };

  // When transaction confirms, save the wallet and redirect
  if (isSuccess && hash && ownerAddress) {
    // Get the created address and save it
    getSmartAccountAddress(ownerAddress).then((address) => {
      saveWallet(address, ownerAddress);
      window.location.href = "/dashboard";
    });
  }

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
            <p>Predicted address: {predictedAddress.slice(0, 6)}...{predictedAddress.slice(-4)}</p>
          )}
        </div>

        <Button
          onClick={handleCreate}
          disabled={isPending || isConfirming}
          className="w-full"
        >
          {isPending ? "Waiting for signature..." :
           isConfirming ? "Creating wallet..." :
           "Create Wallet"}
        </Button>

        {error && (
          <p className="text-red-400 text-sm">{error.message}</p>
        )}
      </CardContent>
    </Card>
  );
}
