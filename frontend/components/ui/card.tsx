"use client";

import { clsx } from "clsx";

interface CardProps {
  hover?: boolean;
  onClick?: () => void;
  className?: string;
  children: React.ReactNode;
}

export function Card({ hover = false, onClick, className, children }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={clsx(
        "rounded-card border border-[var(--color-border)] bg-white p-6",
        "transition-all duration-200",
        hover &&
          "cursor-pointer hover:border-[var(--color-accent)] hover:shadow-md hover:-translate-y-0.5",
        className
      )}
    >
      {children}
    </div>
  );
}
