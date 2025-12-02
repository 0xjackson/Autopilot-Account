"use client";

import { useState } from "react";
import { mockSettings } from "@/lib/mock-data";

export default function SettingsPage() {
  const [settings, setSettings] = useState(mockSettings);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = () => {
    setIsSaving(true);
    setTimeout(() => {
      setIsSaving(false);
      alert("Settings saved (mock)");
    }, 1000);
  };

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold">Settings</h1>

      <div className="max-w-2xl space-y-6">
        {/* Checking Threshold */}
        <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
          <h2 className="text-lg font-semibold mb-4">Checking Threshold</h2>
          <p className="text-gray-400 text-sm mb-4">
            Minimum USDC to keep in checking. Excess is auto-deposited to yield.
          </p>
          <div className="flex items-center space-x-3">
            <span className="text-gray-400">$</span>
            <input
              type="number"
              value={settings.checkingThreshold}
              onChange={(e) =>
                setSettings({ ...settings, checkingThreshold: e.target.value })
              }
              className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white w-32 focus:outline-none focus:border-blue-500"
            />
            <span className="text-gray-400">USDC</span>
          </div>
        </div>

        {/* Yield Toggle */}
        <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Auto-Yield</h2>
              <p className="text-gray-400 text-sm mt-1">
                Automatically deposit excess funds into yield strategies
              </p>
            </div>
            <button
              onClick={() =>
                setSettings({ ...settings, yieldEnabled: !settings.yieldEnabled })
              }
              className={`relative w-14 h-7 rounded-full transition-colors ${
                settings.yieldEnabled ? "bg-blue-600" : "bg-gray-700"
              }`}
            >
              <span
                className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-transform ${
                  settings.yieldEnabled ? "translate-x-8" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        </div>

        {/* Dust Sweep Configuration */}
        <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold">Dust Sweep</h2>
              <p className="text-gray-400 text-sm mt-1">
                Automatically consolidate small token balances into USDC
              </p>
            </div>
            <button
              onClick={() =>
                setSettings({
                  ...settings,
                  dustSweepEnabled: !settings.dustSweepEnabled,
                })
              }
              className={`relative w-14 h-7 rounded-full transition-colors ${
                settings.dustSweepEnabled ? "bg-blue-600" : "bg-gray-700"
              }`}
            >
              <span
                className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-transform ${
                  settings.dustSweepEnabled ? "translate-x-8" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          {settings.dustSweepEnabled && (
            <div className="mt-4 pt-4 border-t border-gray-800">
              <label className="text-gray-400 text-sm block mb-2">
                Dust Threshold (sweep tokens below this USD value)
              </label>
              <div className="flex items-center space-x-3">
                <span className="text-gray-400">$</span>
                <input
                  type="number"
                  value={settings.dustThreshold}
                  onChange={(e) =>
                    setSettings({ ...settings, dustThreshold: e.target.value })
                  }
                  className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white w-32 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          )}
        </div>

        {/* Strategy Selection Placeholder */}
        <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
          <h2 className="text-lg font-semibold mb-4">Yield Strategy</h2>
          <p className="text-gray-400 text-sm mb-4">
            Select which vault to use for yield generation
          </p>
          <select
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500"
            defaultValue="aerodrome"
          >
            <option value="aerodrome">Aerodrome USDC Vault (4.2% APY)</option>
            <option value="mock" disabled>
              More strategies coming soon...
            </option>
          </select>
        </div>

        {/* Save Button */}
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 py-3 rounded-lg font-semibold transition-colors"
        >
          {isSaving ? "Saving..." : "Save Settings"}
        </button>
      </div>
    </div>
  );
}
