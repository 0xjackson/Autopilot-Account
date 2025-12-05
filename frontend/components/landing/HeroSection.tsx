"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { PilotMascot } from "./PilotMascot";

interface HeroSectionProps {
  hasWallet: boolean;
  onCreateWallet: () => void | Promise<void>;
  onGoToDashboard: () => void;
}

export function HeroSection({
  hasWallet,
  onCreateWallet,
  onGoToDashboard,
}: HeroSectionProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreateWallet = async () => {
    setIsCreating(true);
    setError(null);
    try {
      await onCreateWallet();
      setIsSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create wallet");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <section className="relative flex flex-col items-center justify-center text-center py-12 md:py-20">
      {/* Subtle background accent */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#4169E1]/5 rounded-full blur-[100px]" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-[#4169E1]/3 rounded-full blur-[80px]" />
      </div>

      {/* Content */}
      <div className="relative z-10 w-full max-w-5xl mx-auto px-4">
        <div className="flex flex-col lg:flex-row items-center gap-8 lg:gap-12">
          {/* Text content */}
          <div className="flex-1 space-y-6 text-center lg:text-left">
            {/* Main tagline with animation */}
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight animate-fade-in">
              <span className="block text-gray-900">Never let your</span>
              <span className="block text-[#4169E1]">
                money sleep
              </span>
            </h1>

            {/* Subheading */}
            <p className="text-lg sm:text-xl text-gray-600 max-w-xl mx-auto lg:mx-0 leading-relaxed animate-fade-in-delay">
              A smart wallet that automatically puts your idle capital to work.
              Deposit funds, and watch them earn yield on autopilot.
            </p>

            {/* CTA Section */}
            <div className="pt-4 animate-fade-in-delay-2">
              {isSuccess ? (
                <Alert variant="success" className="max-w-md mx-auto lg:mx-0">
                  <CheckCircleIcon className="h-5 w-5" />
                  <AlertTitle>Wallet Created!</AlertTitle>
                  <AlertDescription>
                    Your Autopilot wallet is ready. Redirecting to dashboard...
                  </AlertDescription>
                </Alert>
              ) : error ? (
                <div className="space-y-4">
                  <Alert variant="destructive" className="max-w-md mx-auto lg:mx-0">
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                  <Button
                    size="lg"
                    onClick={handleCreateWallet}
                    disabled={isCreating}
                    className="h-14 px-10 text-lg bg-[#4169E1] hover:bg-[#4169E1]/90 text-white"
                  >
                    Try Again
                  </Button>
                </div>
              ) : hasWallet ? (
                <div className="space-y-4">
                  <Button
                    size="lg"
                    onClick={onGoToDashboard}
                    className={cn(
                      "h-14 px-10 text-lg font-semibold",
                      "bg-[#4169E1] hover:bg-[#4169E1]/90",
                      "text-white",
                      "shadow-lg shadow-[#4169E1]/25",
                      "transition-all duration-300 hover:scale-105 hover:shadow-[#4169E1]/40"
                    )}
                  >
                    Go to Dashboard
                  </Button>
                  <p className="text-sm text-gray-500">
                    You already have an Autopilot wallet
                  </p>
                </div>
              ) : (
                <Button
                  size="lg"
                  onClick={handleCreateWallet}
                  disabled={isCreating}
                  className={cn(
                    "h-16 px-12 text-xl font-semibold",
                    "bg-[#4169E1] hover:bg-[#4169E1]/90",
                    "text-white",
                    "shadow-xl shadow-[#4169E1]/30",
                    "transition-all duration-300 hover:scale-105 hover:shadow-[#4169E1]/50"
                  )}
                >
                  {isCreating ? (
                    <span className="flex items-center gap-3">
                      <Spinner size="sm" />
                      Creating Wallet...
                    </span>
                  ) : (
                    "Get Started"
                  )}
                </Button>
              )}
            </div>

            {/* Trust indicators */}
            <div className="pt-6 flex flex-wrap items-center justify-center lg:justify-start gap-6 text-sm text-gray-500 animate-fade-in-delay-3">
              <div className="flex items-center gap-2">
                <ShieldIcon className="h-4 w-4 text-green-600" />
                <span>Self-custodial</span>
              </div>
              <div className="flex items-center gap-2">
                <LayersIcon className="h-4 w-4 text-[#4169E1]" />
                <span>Built on Base</span>
              </div>
              <div className="flex items-center gap-2">
                <LockIcon className="h-4 w-4 text-gray-700" />
                <span>ERC-4337</span>
              </div>
            </div>
          </div>

          {/* Pilot Mascot */}
          <div className="flex-shrink-0 animate-fade-in-delay">
            <div className="animate-float">
              <PilotMascot size="lg" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// Icon components
function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
      />
    </svg>
  );
}

function LayersIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
      />
    </svg>
  );
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
      />
    </svg>
  );
}
