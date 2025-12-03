"use client";

import { useState, useEffect, useMemo } from "react";
import { supportedTokens, mockBalances } from "@/lib/mock-data";

type SendStatus = "idle" | "loading" | "success" | "error";

interface Toast {
  message: string;
  type: "success" | "error";
}

function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

export default function SendPage() {
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [selectedToken, setSelectedToken] = useState("USDC");
  const [sendStatus, setSendStatus] = useState<SendStatus>("idle");
  const [toast, setToast] = useState<Toast | null>(null);
  const [recipientTouched, setRecipientTouched] = useState(false);

  // Parse balances (remove commas for calculations)
  const checkingBalance = parseFloat(mockBalances.checking.replace(/,/g, ""));
  const yieldBalance = parseFloat(mockBalances.yield.replace(/,/g, ""));
  const totalBalance = parseFloat(mockBalances.total.replace(/,/g, ""));

  // Validation states
  const recipientValid = isValidAddress(recipient);
  const recipientError = recipientTouched && recipient.length > 0 && !recipientValid;

  const amountNum = parseFloat(amount) || 0;
  const amountExceedsBalance = amountNum > totalBalance;
  const amountValid = amountNum > 0 && !amountExceedsBalance;

  // Calculate how much needs to come from yield
  const yieldWithdrawAmount = useMemo(() => {
    if (amountNum <= checkingBalance) return 0;
    return Math.min(amountNum - checkingBalance, yieldBalance);
  }, [amountNum, checkingBalance, yieldBalance]);

  const canSend = recipientValid && amountValid && sendStatus !== "loading";

  // Auto-hide toast after 4 seconds
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const handleMaxClick = () => {
    setAmount(totalBalance.toString());
  };

  const handleSend = async () => {
    if (!canSend) return;

    setSendStatus("loading");

    // Simulate network request
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Simulate 90% success rate
    const isSuccess = Math.random() > 0.1;

    if (isSuccess) {
      setSendStatus("success");
      setToast({
        message: `Successfully sent ${amount} ${selectedToken} to ${recipient.slice(0, 6)}...${recipient.slice(-4)}`,
        type: "success",
      });
      setRecipient("");
      setAmount("");
      setRecipientTouched(false);
      // Reset status after showing success
      setTimeout(() => setSendStatus("idle"), 100);
    } else {
      setSendStatus("error");
      setToast({
        message: "Transaction failed. Please try again.",
        type: "error",
      });
      // Allow retry after error
      setTimeout(() => setSendStatus("idle"), 100);
    }
  };

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold">Send</h1>

      <div className="max-w-lg">
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 space-y-6 shadow-xl">
          {/* Available Balance Header */}
          <div className="bg-gradient-to-r from-gray-800 to-gray-800/50 rounded-lg p-4">
            <p className="text-gray-400 text-sm">Available Balance</p>
            <p className="text-2xl font-bold mt-1">${mockBalances.total} <span className="text-lg font-normal text-gray-400">USDC</span></p>
            <div className="flex gap-4 mt-2 text-sm">
              <span className="text-gray-400">Checking: <span className="text-white">${mockBalances.checking}</span></span>
              <span className="text-gray-400">Yield: <span className="text-green-400">${mockBalances.yield}</span></span>
            </div>
          </div>

          {/* Recipient Input */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Recipient Address
            </label>
            <div className="relative">
              <input
                type="text"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                onBlur={() => setRecipientTouched(true)}
                placeholder="0x..."
                className={`w-full bg-gray-800 border rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none transition-colors ${
                  recipientError
                    ? "border-red-500 focus:border-red-500"
                    : recipientValid && recipient.length > 0
                    ? "border-green-500 focus:border-green-500"
                    : "border-gray-700 focus:border-blue-500"
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
              <p className="mt-2 text-sm text-red-400">
                Please enter a valid Ethereum address (0x followed by 40 hex characters)
              </p>
            )}
          </div>

          {/* Amount Input with Token Selector */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Amount
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  className={`w-full bg-gray-800 border rounded-lg px-4 py-3 pr-16 text-white placeholder-gray-500 focus:outline-none transition-colors ${
                    amountExceedsBalance
                      ? "border-red-500 focus:border-red-500"
                      : "border-gray-700 focus:border-blue-500"
                  }`}
                />
                <button
                  type="button"
                  onClick={handleMaxClick}
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs font-semibold text-blue-400 hover:text-blue-300 hover:bg-blue-900/30 rounded transition-colors"
                >
                  MAX
                </button>
              </div>
              <select
                value={selectedToken}
                onChange={(e) => setSelectedToken(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500 cursor-pointer min-w-[100px]"
              >
                {supportedTokens.map((token) => (
                  <option key={token.symbol} value={token.symbol}>
                    {token.symbol}
                  </option>
                ))}
              </select>
            </div>
            {amountExceedsBalance && (
              <p className="mt-2 text-sm text-red-400">
                Insufficient balance. Maximum available: ${totalBalance.toLocaleString()}
              </p>
            )}
          </div>

          {/* Preview Text */}
          {amountNum > 0 && !amountExceedsBalance && (
            <div className="bg-blue-900/20 border border-blue-800/50 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-blue-300 text-sm leading-relaxed">
                  You have <span className="font-semibold text-white">${mockBalances.checking}</span> in checking.
                  {yieldWithdrawAmount > 0 ? (
                    <> This will withdraw <span className="font-semibold text-yellow-300">${yieldWithdrawAmount.toFixed(2)}</span> from yield to cover the transfer.</>
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
                ? "bg-blue-600 hover:bg-blue-500 active:bg-blue-700 shadow-lg hover:shadow-blue-500/25"
                : "bg-gray-700 cursor-not-allowed text-gray-400"
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
                <span>Send {selectedToken}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 px-6 py-4 rounded-lg shadow-2xl flex items-center gap-3 animate-slide-up ${
            toast.type === "success"
              ? "bg-green-900 border border-green-700 text-green-100"
              : "bg-red-900 border border-red-700 text-red-100"
          }`}
        >
          {toast.type === "success" ? (
            <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
          <span className="font-medium">{toast.message}</span>
          <button
            onClick={() => setToast(null)}
            className="ml-2 text-gray-300 hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      <style jsx>{`
        @keyframes slide-up {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
