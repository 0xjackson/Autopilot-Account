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
        viewBox="0 0 200 300"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full"
      >
        {/* Cape - animated wave */}
        <g className="animate-cape">
          <path
            d="M100 95 L60 280 Q100 260 140 280 L100 95"
            fill="#4169E1"
            className="origin-top"
          />
          <path
            d="M100 95 L65 275 Q100 255 135 275 L100 95"
            fill="#2563eb"
            className="origin-top"
          />
          {/* Cape inner highlight */}
          <path
            d="M100 100 L75 260 Q100 245 125 260 L100 100"
            fill="#3b82f6"
            opacity="0.3"
          />
        </g>

        {/* Body */}
        <ellipse cx="100" cy="180" rx="45" ry="55" fill="#4169E1" />

        {/* Body highlight */}
        <ellipse cx="90" cy="170" rx="25" ry="35" fill="#2563eb" opacity="0.3" />

        {/* Neck */}
        <rect x="85" y="95" width="30" height="25" fill="#fcd9b8" rx="5" />

        {/* Head */}
        <circle cx="100" cy="70" r="45" fill="#fcd9b8" />

        {/* Face shadow */}
        <ellipse cx="105" cy="75" rx="38" ry="40" fill="#f5c9a8" opacity="0.5" />

        {/* Pilot goggles strap */}
        <path
          d="M55 55 Q100 45 145 55"
          stroke="#1a1a1a"
          strokeWidth="8"
          fill="none"
        />

        {/* Pilot goggles - left */}
        <ellipse cx="75" cy="60" rx="22" ry="18" fill="#1a1a1a" />
        <ellipse cx="75" cy="60" rx="18" ry="14" fill="#374151" />
        <ellipse cx="75" cy="60" rx="14" ry="10" fill="#60a5fa" />
        <ellipse cx="72" cy="57" rx="5" ry="3" fill="white" opacity="0.6" />

        {/* Pilot goggles - right */}
        <ellipse cx="125" cy="60" rx="22" ry="18" fill="#1a1a1a" />
        <ellipse cx="125" cy="60" rx="18" ry="14" fill="#374151" />
        <ellipse cx="125" cy="60" rx="14" ry="10" fill="#60a5fa" />
        <ellipse cx="122" cy="57" rx="5" ry="3" fill="white" opacity="0.6" />

        {/* Goggles bridge */}
        <rect x="93" y="55" width="14" height="10" fill="#1a1a1a" rx="2" />

        {/* Pilot cap */}
        <path
          d="M55 50 Q55 25 100 20 Q145 25 145 50 L140 55 Q100 48 60 55 Z"
          fill="#1a1a1a"
        />
        <path
          d="M60 48 Q100 42 140 48"
          stroke="#374151"
          strokeWidth="3"
          fill="none"
        />

        {/* Cap emblem */}
        <circle cx="100" cy="32" r="8" fill="#4169E1" />
        <path
          d="M96 32 L100 28 L104 32 L100 36 Z"
          fill="white"
        />

        {/* Smile */}
        <path
          d="M85 85 Q100 100 115 85"
          stroke="#1a1a1a"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
        />

        {/* Cheeks */}
        <circle cx="70" cy="80" r="8" fill="#ffb3b3" opacity="0.5" />
        <circle cx="130" cy="80" r="8" fill="#ffb3b3" opacity="0.5" />

        {/* Arms */}
        {/* Left arm */}
        <path
          d="M55 140 Q30 160 40 200"
          stroke="#4169E1"
          strokeWidth="20"
          strokeLinecap="round"
          fill="none"
        />
        {/* Left hand */}
        <circle cx="40" cy="205" r="12" fill="#fcd9b8" />

        {/* Right arm - waving animation */}
        <g className="origin-top-right animate-wave">
          <path
            d="M145 140 Q170 120 175 90"
            stroke="#4169E1"
            strokeWidth="20"
            strokeLinecap="round"
            fill="none"
          />
          {/* Right hand */}
          <circle cx="175" cy="85" r="12" fill="#fcd9b8" />
          {/* Fingers for wave */}
          <path
            d="M168 78 L165 70 M173 75 L172 66 M178 76 L180 68 M183 80 L188 74"
            stroke="#fcd9b8"
            strokeWidth="4"
            strokeLinecap="round"
          />
        </g>

        {/* Belt */}
        <rect x="55" y="200" width="90" height="12" fill="#1a1a1a" rx="3" />
        <rect x="92" y="198" width="16" height="16" fill="#fbbf24" rx="2" />

        {/* Legs */}
        <rect x="70" y="230" width="22" height="45" fill="#1a1a1a" rx="8" />
        <rect x="108" y="230" width="22" height="45" fill="#1a1a1a" rx="8" />

        {/* Boots */}
        <ellipse cx="81" cy="280" rx="18" ry="10" fill="#1a1a1a" />
        <ellipse cx="119" cy="280" rx="18" ry="10" fill="#1a1a1a" />
        <rect x="63" y="270" width="36" height="12" fill="#1a1a1a" rx="4" />
        <rect x="101" y="270" width="36" height="12" fill="#1a1a1a" rx="4" />

        {/* Boot highlights */}
        <path d="M68 275 L90 275" stroke="#374151" strokeWidth="2" />
        <path d="M110 275 L132 275" stroke="#374151" strokeWidth="2" />

        {/* Chest emblem */}
        <circle cx="100" cy="155" r="15" fill="white" />
        <text
          x="100"
          y="161"
          textAnchor="middle"
          fontSize="16"
          fontWeight="bold"
          fill="#4169E1"
        >
          A
        </text>
      </svg>

      {/* Add CSS animations */}
      <style jsx>{`
        @keyframes wave {
          0%, 100% {
            transform: rotate(0deg);
          }
          25% {
            transform: rotate(-15deg);
          }
          75% {
            transform: rotate(15deg);
          }
        }

        @keyframes cape-flow {
          0%, 100% {
            transform: skewX(0deg);
          }
          50% {
            transform: skewX(3deg);
          }
        }

        .animate-wave {
          animation: wave 1.5s ease-in-out infinite;
          transform-origin: 145px 140px;
        }

        .animate-cape {
          animation: cape-flow 2s ease-in-out infinite;
          transform-origin: 100px 95px;
        }
      `}</style>
    </div>
  );
}
