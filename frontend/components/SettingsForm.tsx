"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

// Types for settings
export interface TokenYieldConfig {
  enabled: boolean;
}

export interface WalletSettings {
  checkingThreshold: string;
  autoYieldTokens: {
    USDC: TokenYieldConfig;
    WETH: TokenYieldConfig;
  };
  dustConsolidationToken: "USDC" | "WETH" | "ETH";
  dustSweepEnabled: boolean;
  dustThreshold: string;
  riskTolerance: number; // 1-5 scale
  yieldStrategy: string;
}

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
  yieldStrategy: "aerodrome",
};

const consolidationTokenOptions = [
  { value: "USDC", label: "USDC (USD Coin)" },
  { value: "WETH", label: "WETH (Wrapped Ether)" },
  { value: "ETH", label: "ETH (Native Ether)" },
] as const;

const yieldStrategyOptions = [
  { value: "aerodrome", label: "Aerodrome USDC Vault", apy: "4.2%" },
  { value: "beefy", label: "Beefy Finance Vault", apy: "3.8%" },
  { value: "mock", label: "Mock Vault (Demo)", apy: "5.0%" },
] as const;

const riskLabels = ["Very Low", "Low", "Medium", "High", "Very High"];

export function SettingsForm() {
  const [settings, setSettings] = useState<WalletSettings>(defaultSettings);
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load settings from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as WalletSettings;
        setSettings(parsed);
      } catch {
        // If parsing fails, use defaults
        setSettings(defaultSettings);
      }
    }
    setIsLoaded(true);
  }, []);

  const handleSave = () => {
    setIsSaving(true);
    setShowSuccess(false);

    // Save to localStorage
    setTimeout(() => {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
      setIsSaving(false);
      setShowSuccess(true);

      // Hide success message after 3 seconds
      setTimeout(() => setShowSuccess(false), 3000);
    }, 500);
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

  // Don't render until settings are loaded from localStorage
  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-400">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Success Alert */}
      {showSuccess && (
        <Alert variant="success">
          <AlertTitle>Settings Saved</AlertTitle>
          <AlertDescription>
            Your wallet preferences have been updated successfully.
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

          {/* WETH Toggle */}
          <div className="flex items-center justify-between py-2 border-t border-gray-800 pt-4">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center text-xs font-bold">
                W
              </div>
              <div>
                <p className="font-medium">WETH</p>
                <p className="text-gray-400 text-sm">Wrapped Ether</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.autoYieldTokens.WETH.enabled}
                onChange={(e) => updateTokenYield("WETH", e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-14 h-7 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-7 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
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

      {/* Risk Tolerance Slider */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Risk Tolerance</CardTitle>
          <CardDescription>
            Adjust your preferred risk level for yield strategies
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <input
              type="range"
              min="1"
              max="5"
              value={settings.riskTolerance}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  riskTolerance: parseInt(e.target.value),
                })
              }
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
            <div className="flex justify-between text-xs text-gray-400">
              {riskLabels.map((label, index) => (
                <span
                  key={label}
                  className={
                    settings.riskTolerance === index + 1
                      ? "text-blue-400 font-medium"
                      : ""
                  }
                >
                  {label}
                </span>
              ))}
            </div>
            <p className="text-center text-sm">
              Current:{" "}
              <span className="text-blue-400 font-medium">
                {riskLabels[settings.riskTolerance - 1]}
              </span>
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Yield Strategy Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Yield Strategy</CardTitle>
          <CardDescription>
            Select which vault to use for yield generation
          </CardDescription>
        </CardHeader>
        <CardContent>
          <select
            value={settings.yieldStrategy}
            onChange={(e) =>
              setSettings({ ...settings, yieldStrategy: e.target.value })
            }
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500"
          >
            {yieldStrategyOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label} ({option.apy} APY)
              </option>
            ))}
          </select>
        </CardContent>
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
