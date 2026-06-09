"use client";

import { clsx } from "clsx";

interface AvatarProps {
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeStyles: Record<string, string> = {
  sm: "w-6 h-6 text-xs",
  md: "w-8 h-8 text-sm",
  lg: "w-10 h-10 text-base",
};

function getInitials(name: string): string {
  return name
    .split(/[\s_]+/)
    .map((s) => s[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "?";
}

function hashColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 45%, 88%)`;
}

export function Avatar({ name, size = "md", className }: AvatarProps) {
  return (
    <div
      className={clsx(
        "inline-flex items-center justify-center rounded-full font-medium text-gray-600 shrink-0",
        sizeStyles[size],
        className
      )}
      style={{ background: hashColor(name) }}
      title={name}
    >
      {getInitials(name)}
    </div>
  );
}
