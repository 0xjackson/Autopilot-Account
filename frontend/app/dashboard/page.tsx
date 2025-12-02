"use client";

import { useState } from "react";
import {
  mockBalances,
  mockYieldStrategy,
  mockTransactions,
} from "@/lib/mock-data";

export default function DashboardPage() {
  const [isRebalancing, setIsRebalancing] = useState(false);

  const handleRebalance = () => {
    setIsRebalancing(true);
    // Simulate rebalance action
    setTimeout(() => {
      setIsRebalancing(false);
      alert("Rebalance complete (mock)");
    }, 1500);
  };

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold">Dashboard</h1>

      {/* Balance Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
          <p className="text-gray-400 text-sm">Checking Balance</p>
          <p className="text-2xl font-bold mt-1">${mockBalances.checking}</p>
          <p className="text-gray-500 text-xs mt-1">Available for spending</p>
        </div>

        <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
          <p className="text-gray-400 text-sm">Yield Balance</p>
          <p className="text-2xl font-bold mt-1 text-green-400">
            ${mockBalances.yield}
          </p>
          <p className="text-gray-500 text-xs mt-1">
            {mockYieldStrategy.name} • {mockYieldStrategy.apy} APY
          </p>
        </div>

        <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
          <p className="text-gray-400 text-sm">Total Balance</p>
          <p className="text-2xl font-bold mt-1">${mockBalances.total}</p>
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

      {/* Recent Activity */}
      <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
        <h2 className="text-lg font-semibold mb-4">Recent Activity</h2>
        <div className="space-y-3">
          {mockTransactions.map((tx) => (
            <div
              key={tx.id}
              className="flex items-center justify-between py-3 border-b border-gray-800 last:border-0"
            >
              <div>
                <p className="font-medium capitalize">
                  {tx.type.replace("_", " ")}
                </p>
                <p className="text-gray-500 text-sm">
                  {tx.timestamp.toLocaleString()}
                </p>
              </div>
              <div className="text-right">
                <p
                  className={`font-medium ${
                    tx.type === "receive" || tx.type === "yield_withdraw"
                      ? "text-green-400"
                      : ""
                  }`}
                >
                  {tx.type === "receive" || tx.type === "yield_withdraw"
                    ? "+"
                    : "-"}
                  ${tx.amount} {tx.token}
                </p>
                <p className="text-gray-500 text-xs capitalize">{tx.status}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
