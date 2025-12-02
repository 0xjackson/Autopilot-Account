"use client";

import { useState } from "react";
import { supportedTokens, mockBalances } from "@/lib/mock-data";

export default function PayPage() {
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [selectedToken, setSelectedToken] = useState(supportedTokens[0].symbol);
  const [isPaying, setIsPaying] = useState(false);

  const handlePay = () => {
    if (!recipient || !amount) {
      alert("Please enter recipient and amount");
      return;
    }

    setIsPaying(true);
    // Simulate payment - this will later become executeWithAutoYield
    setTimeout(() => {
      setIsPaying(false);
      alert(
        `Payment of ${amount} ${selectedToken} to ${recipient} initiated (mock)\n\nThis will use executeWithAutoYield:\n1. Withdraw from yield if needed\n2. Execute transfer\n3. Re-deposit surplus`
      );
      setRecipient("");
      setAmount("");
    }, 2000);
  };

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold">Pay</h1>

      <div className="max-w-lg">
        <div className="bg-gray-900 rounded-lg p-6 border border-gray-800 space-y-6">
          {/* Available Balance */}
          <div className="bg-gray-800 rounded-lg p-4">
            <p className="text-gray-400 text-sm">Available (Checking + Yield)</p>
            <p className="text-xl font-bold">${mockBalances.total} USDC</p>
          </div>

          {/* Recipient Input */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Recipient Address
            </label>
            <input
              type="text"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="0x..."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Amount Input */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Amount
            </label>
            <div className="flex space-x-3">
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
              <select
                value={selectedToken}
                onChange={(e) => setSelectedToken(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500"
              >
                {supportedTokens.map((token) => (
                  <option key={token.symbol} value={token.symbol}>
                    {token.symbol}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Info Box */}
          <div className="bg-blue-900/30 border border-blue-800 rounded-lg p-4">
            <p className="text-blue-300 text-sm">
              Autopilot will automatically withdraw from yield if your checking
              balance is insufficient. All in a single gasless transaction.
            </p>
          </div>

          {/* Pay Button */}
          <button
            onClick={handlePay}
            disabled={isPaying || !recipient || !amount}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed py-4 rounded-lg font-semibold text-lg transition-colors"
          >
            {isPaying ? "Processing..." : "Pay with Autopilot"}
          </button>
        </div>
      </div>
    </div>
  );
}
