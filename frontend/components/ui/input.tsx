"use client";

import { clsx } from "clsx";
import { forwardRef } from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string;
  label?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ error, label, className, id, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={id}
            className="block mb-1.5 text-sm font-medium text-[var(--color-text-primary)]"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          className={clsx(
            "w-full rounded-lg border bg-white px-3 py-2.5 text-sm",
            "placeholder:text-gray-400",
            "transition-colors duration-150",
            "focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20",
            error
              ? "border-red-300 focus:border-red-400"
              : "border-[var(--color-border)] focus:border-[var(--color-accent)]"
          )}
          {...props}
        />
        {error && (
          <p className="mt-1 text-xs text-red-500">{error}</p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";

/* Textarea variant */
interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: string;
  label?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ error, label, className, id, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={id}
            className="block mb-1.5 text-sm font-medium text-[var(--color-text-primary)]"
          >
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={id}
          className={clsx(
            "w-full rounded-lg border bg-white px-3 py-2.5 text-sm resize-none",
            "placeholder:text-gray-400",
            "transition-colors duration-150",
            "focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20",
            error
              ? "border-red-300"
              : "border-[var(--color-border)] focus:border-[var(--color-accent)]"
          )}
          {...props}
        />
        {error && (
          <p className="mt-1 text-xs text-red-500">{error}</p>
        )}
      </div>
    );
  }
);

Textarea.displayName = "Textarea";
