"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAccount } from "wagmi";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function HomePage() {
  const router = useRouter();
  const { isConnected } = useAccount();
  const [hasWallet, setHasWallet] = useState<boolean | null>(null);

  useEffect(() => {
    // Check if user already has an Autopilot wallet
    const storedAddress = localStorage.getItem("autopilotWalletAddress");
    setHasWallet(!!storedAddress);

    // If connected and has wallet, redirect to dashboard
    if (isConnected && storedAddress) {
      router.push("/dashboard");
    }
  }, [isConnected, router]);

  // Show loading state while checking
  if (hasWallet === null) {
    return (
      <div className="min-h-[calc(100vh-12rem)] flex items-center justify-center">
        <div className="animate-pulse text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-12rem)] flex flex-col items-center justify-center">
      <div className="max-w-2xl mx-auto text-center space-y-8">
        <div className="space-y-4">
          <h1 className="text-4xl md:text-5xl font-bold">
            Your Wallet on{" "}
            <span className="text-blue-400">Autopilot</span>
          </h1>
          <p className="text-xl text-gray-400 max-w-lg mx-auto">
            A smart wallet that automatically manages your idle capital. Set
            your checking balance, and let the rest earn yield.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-left">
          <FeatureCard
            title="Auto-Yield"
            description="Excess USDC automatically moves into yield strategies"
          />
          <FeatureCard
            title="Seamless Payments"
            description="Pay directly from yield without manual withdrawals"
          />
          <FeatureCard
            title="Gasless"
            description="No ETH needed - all transactions are sponsored"
          />
        </div>

        <div className="pt-4">
          {hasWallet ? (
            <div className="space-y-4">
              <Button asChild size="lg" className="h-14 px-8 text-lg">
                <Link href="/dashboard">Go to Dashboard</Link>
              </Button>
              <p className="text-sm text-gray-500">
                You already have an Autopilot wallet
              </p>
            </div>
          ) : (
            <Button asChild size="lg" className="h-14 px-8 text-lg">
              <Link href="/create">Create Autopilot Wallet</Link>
            </Button>
          )}
        </div>

        <p className="text-xs text-gray-600 max-w-md mx-auto">
          Built on Base using ERC-4337 smart accounts and ERC-7579 modules.
          Self-custodial and permissionless.
        </p>
      </div>
    </div>
  );
}

function FeatureCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Card className="text-left">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <CardDescription>{description}</CardDescription>
      </CardContent>
    </Card>
  );
}
