"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useAccount, useReadContract } from "wagmi";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  autopilotApi,
  WalletSettings,
  ApiError,
  ValidationErrorResponse,
} from "@/lib/api/client";
import { CONTRACTS, FACTORY_ABI } from "@/lib/constants";
import { getSavedWallet } from "@/lib/services/wallet";

// Re-export types for backwards compatibility
export type { WalletSettings };
export type TokenYieldConfig = { enabled: boolean };

const SETTINGS_STORAGE_KEY = "autopilot-wallet-settings";

const defaultSettings: WalletSettings = {
  checkingThreshold: "100",
  autoYieldTokens: {
    USDC: { enabled: true },
    WETH: { enabled: false },
  },
  dustConsolidationToken: "USDC",
  dustSweepEnabled: true,
  dustThreshold: "1.00",
  riskTolerance: 3,
  yieldStrategy: "mock",
};

const consolidationTokenOptions = [
  { value: "USDC", label: "USDC (USD Coin)" },
  { value: "WETH", label: "WETH (Wrapped Ether)" },
  { value: "ETH", label: "ETH (Native Ether)" },
] as const;


export function SettingsForm() {
  const [settings, setSettings] = useState<WalletSettings>(defaultSettings);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showSuccess, setShowSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // Get connected wallet address
  const { address: ownerAddress, isConnected } = useAccount();

  // Get saved wallet from localStorage
  const savedWallet = typeof window !== "undefined" ? getSavedWallet() : null;

  // Get smart wallet address from factory contract
  const { data: onChainAccount } = useReadContract({
    address: CONTRACTS.FACTORY,
    abi: FACTORY_ABI,
    functionName: "accountOf",
    args: ownerAddress ? [ownerAddress] : undefined,
    query: {
      enabled: !!ownerAddress,
    },
  });

  // Determine the smart wallet address
  const smartWalletAddress =
    onChainAccount && onChainAccount !== "0x0000000000000000000000000000000000000000"
      ? onChainAccount
      : savedWallet?.address;

  // Load settings from backend on mount (with localStorage fallback)
  const loadSettings = useCallback(async () => {
    if (!smartWalletAddress) {
      // No wallet - try localStorage as fallback for cached settings
      const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as WalletSettings;
          setSettings(parsed);
        } catch {
          setSettings(defaultSettings);
        }
      }
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await autopilotApi.getWalletSettings(smartWalletAddress);
      setSettings(response.settings);
      // Cache to localStorage for instant feedback on next load
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(response.settings));
    } catch (err) {
      console.error("Failed to load settings from backend:", err);
      // Fall back to localStorage
      const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as WalletSettings;
          setSettings(parsed);
        } catch {
          setSettings(defaultSettings);
        }
      }
      // Don't show error for initial load - just use defaults/cache
    } finally {
      setIsLoading(false);
    }
  }, [smartWalletAddress]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleSave = async () => {
    setIsSaving(true);
    setShowSuccess(false);
    setError(null);
    setValidationErrors([]);

    // Always save to localStorage for instant local feedback
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));

    // If no wallet, just save locally
    if (!smartWalletAddress) {
      setIsSaving(false);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
      return;
    }

    try {
      await autopilotApi.saveWalletSettings(smartWalletAddress, settings);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (err) {
      console.error("Failed to save settings to backend:", err);

      if (err instanceof ApiError) {
        // Check for validation errors
        const responseData = err.originalError?.response?.data as ValidationErrorResponse | undefined;
        if (responseData?.validationErrors) {
          setValidationErrors(responseData.validationErrors.map((e) => `${e.field}: ${e.message}`));
        } else {
          setError(err.message);
        }
      } else {
        setError("Failed to save settings. Please try again.");
      }
    } finally {
      setIsSaving(false);
    }
  };

  const updateTokenYield = (token: "USDC" | "WETH", enabled: boolean) => {
    setSettings((prev) => ({
      ...prev,
      autoYieldTokens: {
        ...prev.autoYieldTokens,
        [token]: { enabled },
      },
    }));
  };

  // Show loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-gray-400">Loading settings...</span>
        </div>
      </div>
    );
  }

  // Show prompt if no wallet is connected
  if (!isConnected) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400 mb-4">Please connect your wallet to manage settings.</p>
        <Button asChild>
          <Link href="/">Connect Wallet</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* No wallet warning */}
      {!smartWalletAddress && (
        <Alert>
          <AlertTitle>No Autopilot Wallet</AlertTitle>
          <AlertDescription>
            Settings are saved locally. Create an Autopilot Wallet to sync settings to the backend.
          </AlertDescription>
        </Alert>
      )}

      {/* Success Alert */}
      {showSuccess && (
        <Alert variant="success">
          <AlertTitle>Settings Saved</AlertTitle>
          <AlertDescription>
            Your wallet preferences have been updated successfully.
          </AlertDescription>
        </Alert>
      )}

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Validation Errors */}
      {validationErrors.length > 0 && (
        <Alert variant="destructive">
          <AlertTitle>Validation Error</AlertTitle>
          <AlertDescription>
            <ul className="list-disc list-inside">
              {validationErrors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Checking Threshold */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Checking Threshold</CardTitle>
          <CardDescription>
            Minimum USDC to keep in checking. Excess is auto-deposited to yield.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-3">
            <span className="text-gray-400">$</span>
            <input
              type="number"
              min="0"
              step="10"
              value={settings.checkingThreshold}
              onChange={(e) =>
                setSettings({ ...settings, checkingThreshold: e.target.value })
              }
              className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white w-32 focus:outline-none focus:border-blue-500"
            />
            <span className="text-gray-400">USDC</span>
          </div>
        </CardContent>
      </Card>

      {/* Auto-Yield Token Toggles */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Auto-Yield Tokens</CardTitle>
          <CardDescription>
            Select which tokens should automatically earn yield when above your
            checking threshold.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* USDC Toggle */}
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-xs font-bold">
                $
              </div>
              <div>
                <p className="font-medium">USDC</p>
                <p className="text-gray-400 text-sm">USD Coin</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.autoYieldTokens.USDC.enabled}
                onChange={(e) => updateTokenYield("USDC", e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-14 h-7 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-7 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          {/* More Coming Soon */}
          <div className="border-t border-gray-800 pt-4">
            <p className="text-gray-500 text-sm italic">More tokens coming soon...</p>
          </div>
        </CardContent>
      </Card>

      {/* Dust Sweep Configuration */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Dust Sweep</CardTitle>
              <CardDescription>
                Automatically consolidate small token balances
              </CardDescription>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.dustSweepEnabled}
                onChange={(e) =>
                  setSettings({ ...settings, dustSweepEnabled: e.target.checked })
                }
                className="sr-only peer"
              />
              <div className="w-14 h-7 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-7 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>
        </CardHeader>
        {settings.dustSweepEnabled && (
          <CardContent className="space-y-4 border-t border-gray-800 pt-4">
            {/* Consolidation Token Dropdown */}
            <div>
              <label className="text-gray-400 text-sm block mb-2">
                Consolidation Token
              </label>
              <select
                value={settings.dustConsolidationToken}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    dustConsolidationToken: e.target.value as
                      | "USDC"
                      | "WETH"
                      | "ETH",
                  })
                }
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500"
              >
                {consolidationTokenOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="text-gray-500 text-xs mt-2">
                Small balances will be swapped into this token
              </p>
            </div>

            {/* Dust Threshold */}
            <div>
              <label className="text-gray-400 text-sm block mb-2">
                Dust Threshold (sweep tokens below this USD value)
              </label>
              <div className="flex items-center space-x-3">
                <span className="text-gray-400">$</span>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={settings.dustThreshold}
                  onChange={(e) =>
                    setSettings({ ...settings, dustThreshold: e.target.value })
                  }
                  className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white w-32 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-4">
        <Button
          onClick={handleSave}
          disabled={isSaving}
          className="flex-1"
          size="lg"
        >
          {isSaving ? "Saving..." : "Save Settings"}
        </Button>
        <Button variant="outline" size="lg" asChild>
          <Link href="/dashboard">Back to Dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
