"use client";

import { cn } from "@/lib/utils";

interface PilotMascotProps {
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function PilotMascot({ className, size = "lg" }: PilotMascotProps) {
  const sizeClasses = {
    sm: "w-32 h-48",
    md: "w-48 h-72",
    lg: "w-64 h-96",
  };

  return (
    <div className={cn("relative", sizeClasses[size], className)}>
      <svg
        viewBox="0 0 200 280"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full"
      >
        {/* Dollar signs floating */}
        <g>
          {/* Left dollar in circle */}
          <circle cx="35" cy="70" r="16" fill="#22c55e" />
          <text
            x="35"
            y="77"
            textAnchor="middle"
            fontSize="18"
            fontWeight="bold"
            fill="white"
          >
            $
          </text>

          {/* Right floating dollars */}
          <text
            x="168"
            y="55"
            textAnchor="middle"
            fontSize="24"
            fontWeight="bold"
            fill="#22c55e"
          >
            $
          </text>
          <text
            x="178"
            y="85"
            textAnchor="middle"
            fontSize="28"
            fontWeight="bold"
            fill="#22c55e"
          >
            $
          </text>
        </g>

        {/* Propeller */}
        <g>
          {/* Propeller center */}
          <circle cx="100" cy="22" r="6" fill="#1e40af" />
          {/* Propeller blades */}
          <ellipse cx="70" cy="18" rx="28" ry="6" fill="#2563eb" transform="rotate(-15 70 18)" />
          <ellipse cx="130" cy="18" rx="28" ry="6" fill="#2563eb" transform="rotate(15 130 18)" />
        </g>

        {/* Head */}
        <ellipse cx="100" cy="85" rx="55" ry="50" fill="#1e40af" />

        {/* Ear muffs */}
        <ellipse cx="45" cy="95" rx="12" ry="18" fill="#1e40af" />
        <ellipse cx="155" cy="95" rx="12" ry="18" fill="#1e40af" />
        <ellipse cx="45" cy="95" rx="8" ry="12" fill="#1e3a8a" />
        <ellipse cx="155" cy="95" rx="8" ry="12" fill="#1e3a8a" />

        {/* Goggles on forehead */}
        <ellipse cx="75" cy="55" rx="18" ry="14" fill="#1e3a8a" stroke="#3b82f6" strokeWidth="3" />
        <ellipse cx="125" cy="55" rx="18" ry="14" fill="#1e3a8a" stroke="#3b82f6" strokeWidth="3" />
        <ellipse cx="75" cy="55" rx="12" ry="9" fill="#60a5fa" opacity="0.5" />
        <ellipse cx="125" cy="55" rx="12" ry="9" fill="#60a5fa" opacity="0.5" />
        {/* Goggles bridge */}
        <rect x="91" y="51" width="18" height="8" fill="#3b82f6" rx="2" />

        {/* Face visor */}
        <rect x="60" y="72" width="80" height="50" fill="#e0f2fe" rx="12" />
        <rect x="65" y="77" width="70" height="40" fill="#bae6fd" rx="8" opacity="0.5" />

        {/* Eyes */}
        <ellipse cx="82" cy="95" rx="8" ry="12" fill="#1e3a8a" />
        <ellipse cx="118" cy="95" rx="8" ry="12" fill="#1e3a8a" />
        {/* Eye highlights */}
        <ellipse cx="84" cy="91" rx="3" ry="4" fill="white" opacity="0.8" />
        <ellipse cx="120" cy="91" rx="3" ry="4" fill="white" opacity="0.8" />

        {/* Body */}
        <ellipse cx="100" cy="175" rx="45" ry="55" fill="#1e40af" />
        <ellipse cx="100" cy="175" rx="40" ry="50" fill="#2563eb" opacity="0.3" />

        {/* Chest emblem circle */}
        <circle cx="100" cy="165" r="22" fill="#1e3a8a" />
        <circle cx="100" cy="165" r="18" fill="#e0f2fe" />
        <text
          x="100"
          y="173"
          textAnchor="middle"
          fontSize="22"
          fontWeight="bold"
          fill="#1e40af"
        >
          A
        </text>

        {/* Left arm */}
        <path
          d="M55 150 Q35 140 30 115"
          stroke="#1e40af"
          strokeWidth="22"
          strokeLinecap="round"
          fill="none"
        />
        {/* Left hand/fist raised */}
        <circle cx="30" cy="110" r="14" fill="#1e40af" />
        <circle cx="30" cy="110" r="10" fill="#1e3a8a" />

        {/* Right arm */}
        <path
          d="M145 155 Q165 170 168 200"
          stroke="#1e40af"
          strokeWidth="22"
          strokeLinecap="round"
          fill="none"
        />
        {/* Right hand */}
        <circle cx="168" cy="205" r="14" fill="#1e40af" />
        <circle cx="168" cy="205" r="10" fill="#1e3a8a" />

        {/* Legs */}
        <ellipse cx="78" cy="235" rx="16" ry="25" fill="#1e40af" />
        <ellipse cx="122" cy="235" rx="16" ry="25" fill="#1e40af" />

        {/* Feet */}
        <ellipse cx="75" cy="260" rx="20" ry="10" fill="#1e3a8a" />
        <ellipse cx="125" cy="260" rx="20" ry="10" fill="#1e3a8a" />

        {/* Ground shadow */}
        <ellipse cx="100" cy="272" rx="40" ry="8" fill="#93c5fd" opacity="0.4" />
      </svg>
    </div>
  );
}
