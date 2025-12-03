"use client";

import { SettingsForm } from "@/components/SettingsForm";

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-gray-400 mt-2">
          Configure your Autopilot Wallet preferences
        </p>
      </div>

      <div className="max-w-2xl">
        <SettingsForm />
      </div>
    </div>
  );
}
