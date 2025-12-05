"use client";

import { useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useReadContract } from "wagmi";
import {
  HeroSection,
  FeatureCard,
  TrendingUpIcon,
  ZapIcon,
  CursorClickIcon,
} from "@/components/landing";
import { CONTRACTS, FACTORY_ABI } from "@/lib/constants";
import { clearSavedWallet } from "@/lib/services/wallet";

const FEATURES = [
  {
    icon: <TrendingUpIcon />,
    iconColor: "text-green-600",
    title: "Auto-Yield",
    description:
      "Your excess USDC automatically moves into the highest-yielding strategies. No clicks, no monitoring - it just happens.",
  },
  {
    icon: <ZapIcon />,
    iconColor: "text-[#4169E1]",
    title: "Gasless UX",
    description:
      "Never worry about ETH for gas again. All transactions are sponsored. Your funds stay 100% productive.",
  },
  {
    icon: <CursorClickIcon />,
    iconColor: "text-[#4169E1]",
    title: "One-Click Spend",
    description:
      "Spend directly from your wallet. Funds are automatically pulled from yield if needed - all in a single transaction.",
  },
] as const;

export default function LandingPage() {
  const router = useRouter();
  const { address: ownerAddress, isConnected } = useAccount();

  // Check on-chain if user has a wallet
  const { data: onChainAccount, isLoading: isCheckingOnChain } = useReadContract({
    address: CONTRACTS.FACTORY,
    abi: FACTORY_ABI,
    functionName: "accountOf",
    args: ownerAddress ? [ownerAddress] : undefined,
    query: {
      enabled: !!ownerAddress,
    },
  });

  const hasWallet = onChainAccount && onChainAccount !== "0x0000000000000000000000000000000000000000";

  useEffect(() => {
    // If connected and has on-chain wallet, redirect to dashboard
    if (isConnected && !isCheckingOnChain && hasWallet) {
      router.push("/dashboard");
    }

    // Clear stale localStorage if no on-chain wallet
    if (isConnected && !isCheckingOnChain && !hasWallet) {
      clearSavedWallet();
    }
  }, [isConnected, isCheckingOnChain, hasWallet, router]);

  const handleCreateWallet = useCallback(() => {
    router.push("/create");
  }, [router]);

  const handleGoToDashboard = useCallback(() => {
    router.push("/dashboard");
  }, [router]);

  // Show loading state while checking wallet status
  if (isConnected && isCheckingOnChain) {
    return (
      <div className="min-h-[calc(100vh-12rem)] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-[#4169E1] border-t-transparent rounded-full animate-spin" />
          <span className="text-gray-600">Checking wallet status...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-12rem)]">
      {/* Hero Section */}
      <HeroSection
        hasWallet={!!hasWallet}
        onCreateWallet={handleCreateWallet}
        onGoToDashboard={handleGoToDashboard}
      />

      {/* Why Autopilot Section */}
      <section className="py-16 md:py-24 bg-gray-50">
        <div className="max-w-5xl mx-auto px-4">
          <div className="text-center mb-16 animate-fade-in">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
              Why Let Your Money Sit Idle?
            </h2>
            <p className="text-gray-600 max-w-2xl mx-auto text-lg">
              Traditional wallets leave your funds doing nothing. Autopilot puts every dollar to work,
              earning yield around the clock while staying ready for whenever you need to spend.
            </p>
          </div>

          {/* Comparison Diagram */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-16">
            {/* Traditional Wallet */}
            <div className="bg-white rounded-2xl p-8 border border-gray-200 shadow-sm">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center">
                  <span className="text-2xl">😴</span>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Traditional Wallet</h3>
                  <p className="text-sm text-gray-500">Your money sleeps</p>
                </div>
              </div>
              <div className="space-y-4">
                <div className="flex items-center gap-3 text-gray-600">
                  <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  <span>Funds sit idle earning 0%</span>
                </div>
                <div className="flex items-center gap-3 text-gray-600">
                  <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  <span>Manual DeFi management required</span>
                </div>
                <div className="flex items-center gap-3 text-gray-600">
                  <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  <span>Pay gas fees on every transaction</span>
                </div>
              </div>
              {/* Visual: Sleeping money bag */}
              <div className="mt-6 flex justify-center">
                <div className="relative">
                  <svg width="120" height="80" viewBox="0 0 120 80" fill="none">
                    <ellipse cx="60" cy="60" rx="50" ry="20" fill="#e5e7eb" />
                    <path d="M35 55 Q60 20 85 55" fill="#9ca3af" />
                    <circle cx="60" cy="45" r="25" fill="#d1d5db" />
                    <text x="60" y="52" textAnchor="middle" fontSize="20" fill="#6b7280">$</text>
                    <text x="95" y="30" fontSize="12" fill="#9ca3af">z z z</text>
                  </svg>
                </div>
              </div>
            </div>

            {/* Autopilot Wallet */}
            <div className="bg-white rounded-2xl p-8 border-2 border-[#4169E1] shadow-lg shadow-[#4169E1]/10">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-full bg-[#4169E1] flex items-center justify-center">
                  <span className="text-2xl">🚀</span>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Autopilot Wallet</h3>
                  <p className="text-sm text-[#4169E1]">Your money works 24/7</p>
                </div>
              </div>
              <div className="space-y-4">
                <div className="flex items-center gap-3 text-gray-600">
                  <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Automatic yield on idle funds</span>
                </div>
                <div className="flex items-center gap-3 text-gray-600">
                  <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Smart rebalancing, zero effort</span>
                </div>
                <div className="flex items-center gap-3 text-gray-600">
                  <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Gasless transactions, always</span>
                </div>
              </div>
              {/* Visual: Growing money */}
              <div className="mt-6 flex justify-center">
                <div className="relative">
                  <svg width="120" height="80" viewBox="0 0 120 80" fill="none">
                    <ellipse cx="60" cy="65" rx="50" ry="15" fill="#dbeafe" />
                    <path d="M30 60 L50 40 L70 50 L90 25" stroke="#4169E1" strokeWidth="3" strokeLinecap="round" />
                    <circle cx="90" cy="25" r="8" fill="#4169E1" />
                    <text x="90" y="29" textAnchor="middle" fontSize="10" fill="white">$</text>
                    <path d="M85 20 L95 10" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" />
                    <path d="M90 15 L95 10 L100 15" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" fill="none" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 md:py-24">
        <div className="text-center mb-12 animate-fade-in">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
            Powerful Features, Simple Experience
          </h2>
          <p className="text-gray-600 max-w-xl mx-auto">
            Deposit once. Everything else is automatic.
            No complex DeFi knowledge required.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto px-4">
          {FEATURES.map((feature, index) => (
            <div
              key={feature.title}
              className="animate-fade-in"
              style={{ animationDelay: `${0.2 + index * 0.1}s` }}
            >
              <FeatureCard
                icon={feature.icon}
                iconColor={feature.iconColor}
                title={feature.title}
                description={feature.description}
              />
            </div>
          ))}
        </div>
      </section>

      {/* How It Works - Step by Step */}
      <section className="py-16 md:py-24 bg-gray-50">
        <div className="max-w-5xl mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
              Get Started in 2 Simple Steps
            </h2>
            <p className="text-gray-600 max-w-xl mx-auto">
              From zero to earning yield in under a minute. No seed phrases, no complexity.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl mx-auto">
            <StepCard
              number="1"
              title="Deposit USDC"
              description="Send USDC to your new smart wallet address."
              detail="Your funds are secured by the same technology that protects billions in DeFi."
            />
            <StepCard
              number="2"
              title="Sit Back & Earn"
              description="Watch your capital generate yield automatically, 24/7. 100% goes to work."
              detail="Spend anytime - your automation key withdraws from yield seamlessly for you."
            />
          </div>

          {/* Flow Diagram */}
          <div className="mt-16 bg-white rounded-2xl p-8 border border-gray-200">
            <h3 className="text-lg font-semibold text-center text-gray-900 mb-8">
              How Your Money Flows
            </h3>

            {/* Main Flow - 3 boxes */}
            <div className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-6">
              <FlowBox label="Deposit USDC" sublabel="To your wallet" color="gray" />
              <FlowArrow />
              <div className="flex flex-col items-center">
                <FlowBox label="System Handles" sublabel="Secure automation" color="blue" />
                <div className="hidden md:block text-[#4169E1] mt-2">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                  </svg>
                </div>
              </div>
              <FlowArrow />
              <FlowBox label="Earning Yield" sublabel="In top vault" color="green" />
            </div>

            {/* Detailed System Flow */}
            <div className="mt-8 pt-6 border-t border-gray-100">
              <p className="text-center text-xs text-gray-400 uppercase tracking-wide mb-4">Under the hood</p>
              <div className="flex flex-col md:flex-row items-center justify-center gap-2 md:gap-3 flex-wrap">
                <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-3 text-center w-[170px]">
                  <p className="text-xs font-medium text-gray-700">Detect & Build</p>
                  <p className="text-xs text-gray-500 mt-1">Cron detects idle balance, finds top vault, creates UserOp, signs with session key</p>
                </div>
                <div className="text-gray-300 rotate-90 md:rotate-0">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-3 text-center w-[170px]">
                  <p className="text-xs font-medium text-gray-700">Sponsor Gas</p>
                  <p className="text-xs text-gray-500 mt-1">Paymaster signs to sponsor gas fees for the UserOp</p>
                </div>
                <div className="text-gray-300 rotate-90 md:rotate-0">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-3 text-center w-[170px]">
                  <p className="text-xs font-medium text-gray-700">Bundle & Submit</p>
                  <p className="text-xs text-gray-500 mt-1">Sent to Pimlico bundler, submitted to EntryPoint</p>
                </div>
                <div className="text-gray-300 rotate-90 md:rotate-0">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-3 text-center w-[170px]">
                  <p className="text-xs font-medium text-gray-700">Validate & Execute</p>
                  <p className="text-xs text-gray-500 mt-1">Automation validator verifies signature, executes deposit</p>
                </div>
              </div>
            </div>

            <p className="text-center text-gray-500 text-sm mt-6">
              You deposit once. Our system securely handles everything else - finding the best yield,
              signing with your automation key, and executing gasless transactions.
            </p>
          </div>
        </div>
      </section>

      {/* Footer note */}
      <section className="py-12 text-center border-t border-gray-200">
        <p className="text-sm text-gray-500 max-w-lg mx-auto">
          Built with ERC-4337 smart accounts and ERC-7579 modules.
          Self-custodial, permissionless, and deployed on Base.
        </p>
      </section>
    </div>
  );
}

function StepCard({
  number,
  title,
  description,
  detail,
}: {
  number: string;
  title: string;
  description: string;
  detail: string;
}) {
  return (
    <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center gap-4 mb-4">
        <div className="w-10 h-10 rounded-full bg-[#4169E1] flex items-center justify-center text-lg font-bold text-white shadow-lg shadow-[#4169E1]/20">
          {number}
        </div>
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-gray-600 mb-3">{description}</p>
      <p className="text-sm text-gray-500 italic">{detail}</p>
    </div>
  );
}

function FlowBox({ label, sublabel, color }: { label: string; sublabel: string; color: "gray" | "blue" | "green" }) {
  const colors = {
    gray: "bg-gray-100 border-gray-300 text-gray-700",
    blue: "bg-[#4169E1]/10 border-[#4169E1] text-[#4169E1]",
    green: "bg-green-50 border-green-500 text-green-700",
  };

  return (
    <div className={`px-6 py-4 rounded-xl border-2 ${colors[color]} text-center min-w-[140px]`}>
      <div className="font-semibold">{label}</div>
      <div className="text-sm opacity-75">{sublabel}</div>
    </div>
  );
}

function FlowArrow() {
  return (
    <div className="text-[#4169E1] rotate-90 md:rotate-0">
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
      </svg>
    </div>
  );
}
