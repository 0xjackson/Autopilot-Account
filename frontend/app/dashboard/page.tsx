"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useReadContract } from "wagmi";
import { CONTRACTS, FACTORY_ABI, MODULE_ABI } from "@/lib/constants";
import { getSavedWallet, clearSavedWallet } from "@/lib/services/wallet";

export default function DashboardPage() {
  const router = useRouter();
  const { address: ownerAddress, isConnected } = useAccount();
  const [isRebalancing, setIsRebalancing] = useState(false);
  const [isVerifying, setIsVerifying] = useState(true);

  // Get saved wallet from localStorage
  const savedWallet = typeof window !== "undefined" ? getSavedWallet() : null;

  // Verify wallet exists on-chain
  const { data: onChainAccount, isLoading: isCheckingOnChain } = useReadContract({
    address: CONTRACTS.FACTORY,
    abi: FACTORY_ABI,
    functionName: "accountOf",
    args: ownerAddress ? [ownerAddress] : undefined,
    query: {
      enabled: !!ownerAddress,
    },
  });

  // Get wallet balances from the module
  const smartWalletAddress = onChainAccount && onChainAccount !== "0x0000000000000000000000000000000000000000"
    ? onChainAccount
    : savedWallet?.address;

  const { data: checkingBalance } = useReadContract({
    address: CONTRACTS.MODULE,
    abi: MODULE_ABI,
    functionName: "getCheckingBalance",
    args: smartWalletAddress ? [smartWalletAddress, CONTRACTS.USDC] : undefined,
    query: {
      enabled: !!smartWalletAddress,
    },
  });

  const { data: yieldBalance } = useReadContract({
    address: CONTRACTS.MODULE,
    abi: MODULE_ABI,
    functionName: "getYieldBalance",
    args: smartWalletAddress ? [smartWalletAddress, CONTRACTS.USDC] : undefined,
    query: {
      enabled: !!smartWalletAddress,
    },
  });

  const { data: totalBalance } = useReadContract({
    address: CONTRACTS.MODULE,
    abi: MODULE_ABI,
    functionName: "getTotalBalance",
    args: smartWalletAddress ? [smartWalletAddress, CONTRACTS.USDC] : undefined,
    query: {
      enabled: !!smartWalletAddress,
    },
  });

  // Verify wallet and redirect if needed
  useEffect(() => {
    if (!isConnected) {
      router.push("/");
      return;
    }

    if (isCheckingOnChain) return;

    const hasOnChainWallet = onChainAccount && onChainAccount !== "0x0000000000000000000000000000000000000000";

    if (!hasOnChainWallet) {
      // Clear invalid localStorage data
      clearSavedWallet();
      router.push("/create");
      return;
    }

    setIsVerifying(false);
  }, [isConnected, isCheckingOnChain, onChainAccount, router]);

  // Format balance from wei (6 decimals for USDC)
  const formatUSDC = (value: bigint | undefined) => {
    if (!value) return "0.00";
    return (Number(value) / 1e6).toFixed(2);
  };

  const handleRebalance = () => {
    setIsRebalancing(true);
    // TODO: Implement actual rebalance call
    setTimeout(() => {
      setIsRebalancing(false);
      alert("Rebalance complete (mock)");
    }, 1500);
  };

  // Show loading while verifying
  if (isVerifying || isCheckingOnChain) {
    return (
      <div className="min-h-[calc(100vh-12rem)] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-gray-400">Verifying wallet...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <div className="text-sm text-gray-400">
          Wallet: {smartWalletAddress?.slice(0, 6)}...{smartWalletAddress?.slice(-4)}
        </div>
      </div>

      {/* Balance Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
          <p className="text-gray-400 text-sm">Checking Balance</p>
          <p className="text-2xl font-bold mt-1">${formatUSDC(checkingBalance as bigint)}</p>
          <p className="text-gray-500 text-xs mt-1">Available for spending</p>
        </div>

        <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
          <p className="text-gray-400 text-sm">Yield Balance</p>
          <p className="text-2xl font-bold mt-1 text-green-400">
            ${formatUSDC(yieldBalance as bigint)}
          </p>
          <p className="text-gray-500 text-xs mt-1">
            Earning yield automatically
          </p>
        </div>

        <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
          <p className="text-gray-400 text-sm">Total Balance</p>
          <p className="text-2xl font-bold mt-1">${formatUSDC(totalBalance as bigint)}</p>
          <p className="text-gray-500 text-xs mt-1">USDC</p>
        </div>
      </div>

      {/* Rebalance Section */}
      <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Auto-Yield Status</h2>
            <p className="text-gray-400 text-sm mt-1">
              Your wallet automatically manages yield allocation
            </p>
          </div>
          <button
            onClick={handleRebalance}
            disabled={isRebalancing}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed px-6 py-2 rounded-lg font-medium transition-colors"
          >
            {isRebalancing ? "Rebalancing..." : "Rebalance Now"}
          </button>
        </div>
      </div>

      {/* Wallet Address Section */}
      <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
        <h2 className="text-lg font-semibold mb-4">Wallet Details</h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between py-2">
            <span className="text-gray-400">Smart Wallet Address</span>
            <code className="text-sm bg-gray-800 px-3 py-1 rounded">
              {smartWalletAddress}
            </code>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-gray-400">Owner (EOA)</span>
            <code className="text-sm bg-gray-800 px-3 py-1 rounded">
              {ownerAddress}
            </code>
          </div>
          <div className="pt-2">
            <p className="text-gray-500 text-sm">
              Send USDC to your smart wallet address above to get started.
              Funds above your checking threshold will automatically be allocated to yield.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
