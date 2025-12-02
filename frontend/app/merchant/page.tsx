"use client";

import { useState } from "react";

export default function MerchantPage() {
  const [paymentReceived, setPaymentReceived] = useState(false);

  // Simulate receiving a payment
  const simulatePayment = () => {
    setPaymentReceived(true);
  };

  const resetDemo = () => {
    setPaymentReceived(false);
  };

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold">Merchant Demo</h1>
      <p className="text-gray-400">
        This page simulates a merchant receiving payment via Autopilot Wallet.
      </p>

      <div className="max-w-lg">
        {!paymentReceived ? (
          <div className="bg-gray-900 rounded-lg p-8 border border-gray-800 text-center">
            <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-gray-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h2 className="text-xl font-semibold mb-2">Awaiting Payment</h2>
            <p className="text-gray-400 mb-6">
              Waiting for customer to complete payment...
            </p>

            {/* Demo: Simulate Payment Button */}
            <div className="border-t border-gray-800 pt-6 mt-6">
              <p className="text-gray-500 text-sm mb-3">Demo Controls</p>
              <button
                onClick={simulatePayment}
                className="bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-lg text-sm transition-colors"
              >
                Simulate Payment Received
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-gray-900 rounded-lg p-8 border border-green-800 text-center">
            <div className="w-16 h-16 bg-green-900 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-green-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h2 className="text-xl font-semibold mb-2 text-green-400">
              Payment Received!
            </h2>
            <p className="text-gray-400 mb-4">
              Transaction confirmed on Base Sepolia
            </p>

            <div className="bg-gray-800 rounded-lg p-4 text-left mb-6">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-400">Amount:</span>
                <span className="font-medium">100.00 USDC</span>
              </div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-400">From:</span>
                <span className="font-mono text-xs">0x1234...5678</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Tx Hash:</span>
                <span className="font-mono text-xs text-blue-400">
                  0xabcd...ef01
                </span>
              </div>
            </div>

            <button
              onClick={resetDemo}
              className="bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-lg text-sm transition-colors"
            >
              Reset Demo
            </button>
          </div>
        )}

        {/* Info Box */}
        <div className="bg-blue-900/30 border border-blue-800 rounded-lg p-4 mt-6">
          <h3 className="font-medium text-blue-300 mb-2">How it works</h3>
          <p className="text-blue-200/70 text-sm">
            When a customer pays using Autopilot Wallet, funds are automatically
            withdrawn from yield if needed, transferred to the merchant, and any
            surplus is re-deposited—all in one gasless transaction.
          </p>
        </div>
      </div>
    </div>
  );
}
