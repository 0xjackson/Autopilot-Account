"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useReadContract, useSignMessage } from "wagmi";
import { CONTRACTS, FACTORY_ABI, MODULE_ABI } from "@/lib/constants";
import { getSavedWallet, clearSavedWallet } from "@/lib/services/wallet";
import { prepareSend, submitSigned, autopilotApi, type CurrentStrategyInfo } from "@/lib/api/client";
import { DustBalances } from "@/components/DustBalances";

type SendStatus = "idle" | "loading" | "success" | "error";

interface Toast {
  message: string;
  type: "success" | "error";
}

function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

export default function DashboardPage() {
  const router = useRouter();
  const { address: ownerAddress, isConnected } = useAccount();
  const [isVerifying, setIsVerifying] = useState(true);

  // Send form state
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [sendStatus, setSendStatus] = useState<SendStatus>("idle");
  const [toast, setToast] = useState<Toast | null>(null);
  const [recipientTouched, setRecipientTouched] = useState(false);

  // Strategy info state
  const [currentStrategy, setCurrentStrategy] = useState<CurrentStrategyInfo | null>(null);
  const [isLoadingStrategy, setIsLoadingStrategy] = useState(false);

  // Dust refresh key - increment to force DustBalances to refetch
  const [dustRefreshKey, setDustRefreshKey] = useState(0);

  // Get saved wallet from localStorage
  const savedWallet = typeof window !== "undefined" ? getSavedWallet() : null;

  // Hook for signing messages
  const { signMessageAsync } = useSignMessage();

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

  // Send form validation
  const recipientValid = isValidAddress(recipient);
  const recipientError = recipientTouched && recipient.length > 0 && !recipientValid;

  const checkingNum = Number(checkingBalance || 0n) / 1e6;
  const yieldNum = Number(yieldBalance || 0n) / 1e6;
  const totalNum = Number(totalBalance || 0n) / 1e6;

  const amountNum = parseFloat(amount) || 0;
  const amountExceedsBalance = amountNum > totalNum;
  const amountValid = amountNum > 0 && !amountExceedsBalance;

  const yieldWithdrawAmount = useMemo(() => {
    if (amountNum <= checkingNum) return 0;
    return Math.min(amountNum - checkingNum, yieldNum);
  }, [amountNum, checkingNum, yieldNum]);

  const canSend = recipientValid && amountValid && sendStatus !== "loading";

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

  // Auto-hide toast after 4 seconds
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Register wallet with backend on dashboard load (for scheduler monitoring)
  useEffect(() => {
    if (!smartWalletAddress || !ownerAddress || isVerifying) return;

    autopilotApi.registerWallet(smartWalletAddress, ownerAddress)
      .then(() => console.log("[dashboard] Wallet registered with backend"))
      .catch((err) => console.error("[dashboard] Failed to register wallet:", err));
  }, [smartWalletAddress, ownerAddress, isVerifying]);

  // Fetch strategy info when wallet is available
  useEffect(() => {
    if (!smartWalletAddress || isVerifying) return;

    const fetchStrategyInfo = async () => {
      setIsLoadingStrategy(true);
      try {
        const summary = await autopilotApi.getWalletSummary(smartWalletAddress);
        setCurrentStrategy(summary.currentStrategy || null);
      } catch (error) {
        console.error("Failed to fetch strategy info:", error);
        setCurrentStrategy(null);
      } finally {
        setIsLoadingStrategy(false);
      }
    };

    fetchStrategyInfo();
  }, [smartWalletAddress, isVerifying]);

  // Format balance from wei (6 decimals for USDC)
  const formatUSDC = (value: bigint | undefined) => {
    if (!value) return "0.00";
    return (Number(value) / 1e6).toFixed(2);
  };

  const handleMaxClick = () => {
    setAmount(totalNum.toString());
  };

  const handleSend = async () => {
    if (!canSend || !smartWalletAddress) return;

    setSendStatus("loading");

    try {
      // 1. Backend prepares UserOp with paymaster data
      const { userOp, userOpHash } = await prepareSend({
        walletAddress: smartWalletAddress,
        recipient,
        amount: Math.floor(amountNum * 1e6).toString(), // USDC has 6 decimals
      });

      // 2. User signs the UserOp hash (ONE wallet popup)
      console.log("[DEBUG] userOpHash from backend:", userOpHash);
      const signature = await signMessageAsync({
        message: { raw: userOpHash as `0x${string}` },
      });
      console.log("[DEBUG] signature:", signature);

      // 3. Submit signed UserOp to bundler
      await submitSigned({ userOp, signature });

      setSendStatus("success");
      setToast({
        message: `Sent ${amount} USDC to ${recipient.slice(0, 6)}...${recipient.slice(-4)}`,
        type: "success",
      });
      setRecipient("");
      setAmount("");
      setRecipientTouched(false);
    } catch (err: unknown) {
      console.error("Send failed:", err);
      setSendStatus("error");
      const message = err instanceof Error ? err.message : "Transaction failed. Please try again.";
      setToast({
        message,
        type: "error",
      });
    } finally {
      setTimeout(() => setSendStatus("idle"), 100);
    }
  };

  // Show loading while verifying
  if (isVerifying || isCheckingOnChain) {
    return (
      <div className="min-h-[calc(100vh-12rem)] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-[#4169E1] border-t-transparent rounded-full animate-spin" />
          <span className="text-gray-600">Verifying wallet...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <div className="text-sm text-gray-500">
          Wallet: {smartWalletAddress?.slice(0, 6)}...{smartWalletAddress?.slice(-4)}
        </div>
      </div>

      {/* Balance Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg p-6 border border-gray-200 shadow-sm">
          <p className="text-gray-500 text-sm">Total Balance</p>
          <p className="text-2xl font-bold mt-1 text-gray-900">${formatUSDC(totalBalance as bigint)}</p>
          <p className="text-gray-400 text-xs mt-1">USDC</p>
        </div>

        <div className="bg-white rounded-lg p-6 border border-gray-200 shadow-sm">
          <p className="text-gray-500 text-sm">Yield Balance</p>
          <p className="text-2xl font-bold mt-1 text-green-600">
            ${formatUSDC(yieldBalance as bigint)}
          </p>
          <p className="text-gray-400 text-xs mt-1">
            Earning yield automatically
          </p>
        </div>

        <div className="bg-white rounded-lg p-6 border border-gray-200 shadow-sm">
          <p className="text-gray-500 text-sm">Current APY</p>
          {isLoadingStrategy ? (
            <div className="h-7 w-20 bg-gray-100 rounded animate-pulse mt-1" />
          ) : (
            <p className="text-2xl font-bold mt-1 text-green-600">
              {currentStrategy ? `${(currentStrategy.apy * 100).toFixed(2)}%` : "—"}
            </p>
          )}
          {isLoadingStrategy ? (
            <div className="h-4 w-32 bg-gray-100 rounded animate-pulse mt-1" />
          ) : (
            <p className="text-gray-400 text-xs mt-1">
              {currentStrategy?.name || "No active strategy"}
            </p>
          )}
        </div>
      </div>

      {/* Strategy Info Section */}
      {(currentStrategy || isLoadingStrategy) && (
        <div className="bg-white rounded-lg p-6 border border-gray-200 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Current Strategy</p>
              {isLoadingStrategy ? (
                <div className="h-6 w-32 bg-gray-100 rounded animate-pulse" />
              ) : (
                <p className="text-gray-900 font-medium">{currentStrategy?.name || "None"}</p>
              )}
            </div>
            <div>
              <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Current APY</p>
              {isLoadingStrategy ? (
                <div className="h-6 w-20 bg-gray-100 rounded animate-pulse" />
              ) : (
                <p className="text-green-600 font-medium">
                  {currentStrategy ? `${(currentStrategy.apy * 100).toFixed(2)}%` : "—"}
                </p>
              )}
            </div>
            <div>
              <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Vault</p>
              {isLoadingStrategy ? (
                <div className="h-6 w-40 bg-gray-100 rounded animate-pulse" />
              ) : currentStrategy?.vaultAddress ? (
                <p className="text-gray-800 font-mono text-sm">
                  {currentStrategy.vaultAddress.slice(0, 10)}...{currentStrategy.vaultAddress.slice(-6)}
                </p>
              ) : (
                <p className="text-gray-400">—</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Dust Balances Section */}
      {smartWalletAddress && (
        <DustBalances
          key={dustRefreshKey}
          walletAddress={smartWalletAddress}
          onSweepComplete={() => {
            setDustRefreshKey((k) => k + 1);
            setToast({
              message: "Dust tokens swept to USDC and deposited to yield!",
              type: "success",
            });
          }}
        />
      )}


      {/* Send Section */}
      <div className="bg-white rounded-xl p-6 border border-gray-200 space-y-6 shadow-lg">
        <h2 className="text-lg font-semibold text-gray-900">Send USDC</h2>

        {/* Recipient Input */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Recipient Address
          </label>
          <div className="relative">
            <input
              type="text"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              onBlur={() => setRecipientTouched(true)}
              placeholder="0x..."
              className={`w-full bg-white border rounded-lg px-4 py-3 text-gray-900 placeholder-gray-400 focus:outline-none transition-colors ${
                recipientError
                  ? "border-red-500 focus:border-red-500"
                  : recipientValid && recipient.length > 0
                  ? "border-green-500 focus:border-green-500"
                  : "border-gray-300 focus:border-[#4169E1] focus:ring-1 focus:ring-[#4169E1]"
              }`}
            />
            {recipient.length > 0 && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {recipientValid ? (
                  <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : recipientError ? (
                  <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : null}
              </div>
            )}
          </div>
          {recipientError && (
            <p className="mt-2 text-sm text-red-500">
              Please enter a valid Ethereum address (0x followed by 40 hex characters)
            </p>
          )}
        </div>

        {/* Amount Input */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Amount
          </label>
          <div className="relative">
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              min="0"
              step="0.01"
              className={`w-full bg-white border rounded-lg px-4 py-3 pr-24 text-gray-900 placeholder-gray-400 focus:outline-none transition-colors ${
                amountExceedsBalance
                  ? "border-red-500 focus:border-red-500"
                  : "border-gray-300 focus:border-[#4169E1] focus:ring-1 focus:ring-[#4169E1]"
              }`}
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
              <button
                type="button"
                onClick={handleMaxClick}
                className="px-2 py-1 text-xs font-semibold text-[#4169E1] hover:text-[#4169E1]/80 hover:bg-[#4169E1]/10 rounded transition-colors"
              >
                MAX
              </button>
              <span className="text-gray-500 text-sm">USDC</span>
            </div>
          </div>
          {amountExceedsBalance && (
            <p className="mt-2 text-sm text-red-500">
              Insufficient balance. Maximum available: ${totalNum.toLocaleString()}
            </p>
          )}
        </div>

        {/* Preview Text */}
        {amountNum > 0 && !amountExceedsBalance && (
          <div className="bg-[#4169E1]/5 border border-[#4169E1]/20 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-[#4169E1] mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-gray-700 text-sm leading-relaxed">
                You have <span className="font-semibold text-gray-900">${checkingNum.toFixed(2)}</span> in checking.
                {yieldWithdrawAmount > 0 ? (
                  <> This will withdraw <span className="font-semibold text-amber-600">${yieldWithdrawAmount.toFixed(2)}</span> from yield to cover the transfer.</>
                ) : (
                  <> This transfer will be covered entirely from your checking balance.</>
                )}
              </p>
            </div>
          </div>
        )}

        {/* Send Button */}
        <button
          onClick={handleSend}
          disabled={!canSend}
          className={`w-full py-4 rounded-lg font-semibold text-lg transition-all flex items-center justify-center gap-2 ${
            canSend
              ? "bg-[#4169E1] hover:bg-[#4169E1]/90 active:bg-[#4169E1] text-white shadow-lg hover:shadow-[#4169E1]/25"
              : "bg-gray-200 cursor-not-allowed text-gray-400"
          }`}
        >
          {sendStatus === "loading" ? (
            <>
              <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span>Sending...</span>
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
              <span>Send USDC</span>
            </>
          )}
        </button>
      </div>

      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 px-6 py-4 rounded-lg shadow-2xl flex items-center gap-3 animate-slide-up ${
            toast.type === "success"
              ? "bg-green-50 border border-green-200 text-green-800"
              : "bg-red-50 border border-red-200 text-red-800"
          }`}
        >
          {toast.type === "success" ? (
            <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
          <span className="font-medium">{toast.message}</span>
          <button
            onClick={() => setToast(null)}
            className="ml-2 text-gray-500 hover:text-gray-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Wallet Address Section */}
      <div className="bg-white rounded-lg p-6 border border-gray-200 shadow-sm">
        <h2 className="text-lg font-semibold mb-4 text-gray-900">Wallet Details</h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between py-2">
            <span className="text-gray-600">Smart Wallet Address</span>
            <code className="text-sm bg-gray-100 px-3 py-1 rounded text-gray-800">
              {smartWalletAddress}
            </code>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-gray-600">Owner (EOA)</span>
            <code className="text-sm bg-gray-100 px-3 py-1 rounded text-gray-800">
              {ownerAddress}
            </code>
          </div>
          <div className="pt-2">
            <p className="text-gray-500 text-sm">
              Send USDC to your smart wallet address above to get started.
              Funds will automatically be allocated to yield.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
