"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useConnect, useAccount, useDisconnect } from "wagmi";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { useWalletCreation } from "@/hooks/useWalletCreation";
import { CHAIN_CONFIG } from "@/lib/constants";

/**
 * CreateWallet Component
 *
 * Implements the F1 wallet creation flow:
 * 1. Connect EOA wallet (Coinbase Wallet / MetaMask)
 * 2. Click "Create Autopilot Wallet"
 * 3. Sign message and deploy smart account
 * 4. Show success with new wallet address
 */
export function CreateWallet() {
  const router = useRouter();
  const { connectors, connect, isPending: isConnecting } = useConnect();
  const { isConnected, address } = useAccount();
  const { disconnect } = useDisconnect();

  const {
    status,
    smartAccountAddress,
    transactionHash,
    error,
    createWallet,
    reset,
  } = useWalletCreation();

  // Navigate to dashboard after successful wallet creation
  useEffect(() => {
    if (status === "success" && smartAccountAddress) {
      // Store the smart account address in localStorage for now
      // In production, this would be managed by a proper state management solution
      localStorage.setItem("autopilotWalletAddress", smartAccountAddress);
    }
  }, [status, smartAccountAddress]);

  const handleGoToDashboard = () => {
    router.push("/dashboard");
  };

  const handleTryAgain = () => {
    reset();
  };

  // Step 1: Connect wallet
  if (!isConnected) {
    return (
      <Card className="max-w-md mx-auto">
        <CardHeader className="text-center">
          <CardTitle>Create Autopilot Wallet</CardTitle>
          <CardDescription>
            Connect your wallet to create a smart account on Base that
            automatically manages your idle capital.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            {connectors.map((connector) => (
              <Button
                key={connector.uid}
                onClick={() => connect({ connector })}
                disabled={isConnecting}
                variant="outline"
                className="w-full justify-start gap-3 h-12"
              >
                {isConnecting ? (
                  <Spinner size="sm" />
                ) : (
                  <WalletIcon name={connector.name} />
                )}
                {connector.name}
              </Button>
            ))}
          </div>
          <p className="text-xs text-gray-500 text-center mt-4">
            Your existing wallet will be the owner of your new Autopilot smart
            account.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Step 2: Create smart wallet (connected but not created yet)
  if (status === "idle") {
    return (
      <Card className="max-w-md mx-auto">
        <CardHeader className="text-center">
          <CardTitle>Create Autopilot Wallet</CardTitle>
          <CardDescription>
            Your wallet is connected. Now create your Autopilot smart account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-gray-800 rounded-lg p-4">
            <p className="text-sm text-gray-400">Connected Wallet</p>
            <p className="font-mono text-sm mt-1 truncate">{address}</p>
          </div>

          <div className="space-y-3">
            <div className="flex items-start gap-3 text-sm">
              <CheckIcon className="h-5 w-5 text-green-400 flex-shrink-0 mt-0.5" />
              <span>Gasless transactions via Base Paymaster</span>
            </div>
            <div className="flex items-start gap-3 text-sm">
              <CheckIcon className="h-5 w-5 text-green-400 flex-shrink-0 mt-0.5" />
              <span>Automatic yield on idle USDC</span>
            </div>
            <div className="flex items-start gap-3 text-sm">
              <CheckIcon className="h-5 w-5 text-green-400 flex-shrink-0 mt-0.5" />
              <span>One-click payments with auto-rebalancing</span>
            </div>
            <div className="flex items-start gap-3 text-sm">
              <CheckIcon className="h-5 w-5 text-green-400 flex-shrink-0 mt-0.5" />
              <span>Dust token cleanup</span>
            </div>
          </div>

          <Button onClick={createWallet} className="w-full h-12">
            Create Autopilot Wallet
          </Button>

          <Button
            onClick={() => disconnect()}
            variant="ghost"
            className="w-full text-gray-400 hover:text-white"
          >
            Disconnect Wallet
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Step 3: Creating wallet (in progress)
  if (status === "checking" || status === "creating") {
    return (
      <Card className="max-w-md mx-auto">
        <CardHeader className="text-center">
          <CardTitle>Creating Autopilot Wallet</CardTitle>
          <CardDescription>
            {status === "checking"
              ? "Checking for existing wallet..."
              : "Deploying your smart account on Base..."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center py-8">
          <Spinner size="lg" className="mb-4" />
          <p className="text-sm text-gray-400">
            {status === "checking"
              ? "This will only take a moment"
              : "Please wait while your wallet is being created"}
          </p>
        </CardContent>
      </Card>
    );
  }

  // Step 4: Error state
  if (status === "error") {
    return (
      <Card className="max-w-md mx-auto">
        <CardHeader className="text-center">
          <CardTitle>Creation Failed</CardTitle>
          <CardDescription>
            There was an issue creating your wallet.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert variant="destructive">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>

          <Button onClick={handleTryAgain} className="w-full">
            Try Again
          </Button>

          <Button
            onClick={() => disconnect()}
            variant="ghost"
            className="w-full text-gray-400 hover:text-white"
          >
            Disconnect Wallet
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Step 5: Success state
  if (status === "success" && smartAccountAddress) {
    return (
      <Card className="max-w-md mx-auto">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-green-900/50 rounded-full flex items-center justify-center mb-4">
            <CheckIcon className="h-6 w-6 text-green-400" />
          </div>
          <CardTitle>Wallet Created!</CardTitle>
          <CardDescription>
            Your Autopilot smart account is ready to use.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-gray-800 rounded-lg p-4">
            <p className="text-sm text-gray-400">Your Autopilot Wallet</p>
            <p className="font-mono text-sm mt-1 break-all">
              {smartAccountAddress}
            </p>
          </div>

          {transactionHash && (
            <a
              href={`${CHAIN_CONFIG.BLOCK_EXPLORER}/tx/${transactionHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-center text-sm text-blue-400 hover:text-blue-300"
            >
              View transaction on BaseScan
            </a>
          )}

          <Alert variant="success">
            <AlertTitle>Next Steps</AlertTitle>
            <AlertDescription>
              Send USDC to your new wallet address to start earning yield
              automatically.
            </AlertDescription>
          </Alert>

          <Button onClick={handleGoToDashboard} className="w-full h-12">
            Go to Dashboard
          </Button>
        </CardContent>
      </Card>
    );
  }

  return null;
}

// Helper components
function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function WalletIcon({ name }: { name: string }) {
  // Simple wallet icon - in production you'd use actual wallet logos
  const iconClass = "h-5 w-5";

  if (name.toLowerCase().includes("coinbase")) {
    return (
      <div className={`${iconClass} bg-blue-600 rounded-full flex items-center justify-center`}>
        <span className="text-white text-xs font-bold">C</span>
      </div>
    );
  }

  if (name.toLowerCase().includes("metamask")) {
    return (
      <div className={`${iconClass} bg-orange-500 rounded-full flex items-center justify-center`}>
        <span className="text-white text-xs font-bold">M</span>
      </div>
    );
  }

  return (
    <svg
      className={iconClass}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
      />
    </svg>
  );
}
