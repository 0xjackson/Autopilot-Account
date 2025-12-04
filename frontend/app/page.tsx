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
    iconColor: "text-green-400",
    title: "Auto-Yield",
    description:
      "Your excess USDC automatically moves into the highest-yielding strategies. No clicks, no monitoring - it just happens.",
  },
  {
    icon: <ZapIcon />,
    iconColor: "text-yellow-400",
    title: "Gasless UX",
    description:
      "Never worry about ETH for gas again. All transactions are sponsored. Your funds stay 100% productive.",
  },
  {
    icon: <CursorClickIcon />,
    iconColor: "text-purple-400",
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
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-gray-400">Checking wallet status...</span>
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

      {/* Features Section */}
      <section className="py-16 md:py-24">
        <div className="text-center mb-12 animate-fade-in">
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
            How It Works
          </h2>
          <p className="text-gray-400 max-w-xl mx-auto">
            Set your checking balance once. Everything else is automatic.
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

      {/* How it works visual section */}
      <section className="py-16 border-t border-gray-800/50">
        <div className="max-w-4xl mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
            <Step
              number="1"
              title="Deposit USDC"
              description="Send funds to your smart wallet"
            />
            <Step
              number="2"
              title="Set Threshold"
              description="Choose how much to keep liquid"
            />
            <Step
              number="3"
              title="Relax"
              description="Everything above your threshold earns yield"
            />
          </div>
        </div>
      </section>

      {/* Footer note */}
      <section className="py-12 text-center">
        <p className="text-sm text-gray-500 max-w-lg mx-auto">
          Built with ERC-4337 smart accounts and ERC-7579 modules.
          Self-custodial, permissionless, and deployed on Base.
        </p>
      </section>
    </div>
  );
}

function Step({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-xl font-bold text-white shadow-lg shadow-blue-500/20">
        {number}
      </div>
      <h3 className="text-lg font-semibold text-white">{title}</h3>
      <p className="text-sm text-gray-400">{description}</p>
    </div>
  );
}
