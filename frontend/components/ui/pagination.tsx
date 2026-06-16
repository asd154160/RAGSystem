"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./button";

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}

export function Pagination({ page, pageSize, total, onChange }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  const pages = getVisiblePages(page, totalPages);

  return (
    <div className="flex items-center justify-between mt-4 text-sm text-[var(--color-text-secondary)]">
      <span>
        共 {total} 条，显示 {start}–{end}
      </span>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          <ChevronLeft size={16} />
        </Button>
        {pages.map((p, i) =>
          p === 0 ? (
            <span key={`ellipsis-${i}`} className="px-1">...</span>
          ) : (
            <button
              key={p}
              onClick={() => onChange(p)}
              className={`min-w-[32px] h-8 rounded-md text-sm ${
                p === page
                  ? "bg-[var(--color-accent)] text-white"
                  : "hover:bg-[var(--color-background)] text-[var(--color-text-secondary)]"
              }`}
            >
              {p}
            </button>
          )
        )}
        <Button
          variant="ghost"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
        >
          <ChevronRight size={16} />
        </Button>
      </div>
    </div>
  );
}

function getVisiblePages(current: number, total: number): (number | 0)[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages: (number | 0)[] = [1];

  if (current > 3) pages.push(0);

  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  if (current < total - 2) pages.push(0);

  pages.push(total);

  return pages;
}
