"use client";

import { useState } from "react";
import { FileText, ChevronDown, ChevronUp } from "lucide-react";
import { RagSource } from "@/types";

interface Props {
  sources: RagSource[];
  activeIndex: number | null;
  onHover: (index: number | null) => void;
}

export default function SourceCard({ sources, activeIndex, onHover }: Props) {
  if (sources.length === 0) return null;

  return (
    <div className="flex h-full flex-col border-l bg-gray-50">
      <div className="border-b px-3 py-3">
        <span className="text-sm font-semibold text-gray-700">引用来源 ({sources.length})</span>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {sources.map((s, i) => (
          <SourceItem
            key={i}
            source={s}
            index={i}
            isActive={activeIndex === i}
            onHover={(hover) => onHover(hover ? i : null)}
          />
        ))}
      </div>
    </div>
  );
}

function SourceItem({
  source,
  index,
  isActive,
  onHover,
}: {
  source: RagSource;
  index: number;
  isActive: boolean;
  onHover: (hover: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      className={`rounded-lg border bg-white p-3 text-xs transition-shadow ${
        isActive ? "ring-2 ring-blue-400 shadow-md" : "shadow-sm"
      }`}
    >
      <div className="mb-1 flex items-center gap-1.5">
        <span className="flex h-5 w-5 items-center justify-center rounded bg-blue-100 text-[10px] font-bold text-blue-600">
          {index + 1}
        </span>
        <span className="truncate font-medium text-gray-700">{source.document_name}</span>
      </div>
      {source.section_title && (
        <p className="mb-1 text-gray-400">{source.section_title}</p>
      )}
      <div className="flex items-center justify-between text-gray-400">
        <span>{(source.score * 100).toFixed(1)}% 相关</span>
        {source.page_no && <span>第 {source.page_no} 页</span>}
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-0.5 text-blue-500 hover:text-blue-600"
        >
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {expanded ? "收起" : "原文"}
        </button>
      </div>
      {expanded && (
        <p className="mt-2 rounded bg-gray-50 p-2 text-xs leading-relaxed text-gray-600 max-h-40 overflow-y-auto">
          {source.chunk_text}
        </p>
      )}
    </div>
  );
}
