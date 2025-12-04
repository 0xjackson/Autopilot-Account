"use client";

import { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface FeatureCardProps {
  icon: ReactNode;
  title: string;
  description: string;
  iconColor?: string;
  className?: string;
}

export function FeatureCard({
  icon,
  title,
  description,
  iconColor = "text-blue-400",
  className,
}: FeatureCardProps) {
  return (
    <Card
      className={cn(
        "group relative overflow-hidden",
        "bg-gray-900/50 backdrop-blur-sm",
        "border-gray-800 hover:border-gray-700",
        "transition-all duration-300 hover:shadow-lg hover:shadow-blue-500/5",
        "hover:-translate-y-1",
        className
      )}
    >
      {/* Hover gradient effect */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

      <CardContent className="relative p-6 space-y-4">
        {/* Icon container */}
        <div
          className={cn(
            "w-12 h-12 rounded-xl flex items-center justify-center",
            "bg-gray-800/80 border border-gray-700/50",
            "group-hover:scale-110 transition-transform duration-300",
            iconColor
          )}
        >
          {icon}
        </div>

        {/* Content */}
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-white group-hover:text-blue-400 transition-colors duration-300">
            {title}
          </h3>
          <p className="text-sm text-gray-400 leading-relaxed">{description}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// Pre-built feature icons
export function TrendingUpIcon({ className }: { className?: string }) {
  return (
    <svg
      className={cn("h-6 w-6", className)}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
      />
    </svg>
  );
}

export function ZapIcon({ className }: { className?: string }) {
  return (
    <svg
      className={cn("h-6 w-6", className)}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M13 10V3L4 14h7v7l9-11h-7z"
      />
    </svg>
  );
}

export function CursorClickIcon({ className }: { className?: string }) {
  return (
    <svg
      className={cn("h-6 w-6", className)}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122"
      />
    </svg>
  );
}

export function SparklesIcon({ className }: { className?: string }) {
  return (
    <svg
      className={cn("h-6 w-6", className)}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
      />
    </svg>
  );
}
