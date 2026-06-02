"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Brain } from "lucide-react";
import ReactMarkdown from "react-markdown";

interface ThinkBlockProps {
  content: string;
  defaultExpanded?: boolean;
}

export default function ThinkBlock({ content, defaultExpanded = false }: ThinkBlockProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  if (!content.trim()) return null;

  return (
    <div className="my-2 rounded-lg border border-gray-200 bg-gray-50/80">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-xs text-gray-500 hover:text-gray-700 transition-colors"
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Brain size={14} className="text-purple-400" />
        <span>思考过程</span>
      </button>
      {expanded && (
        <div className="border-t border-gray-200 px-4 py-3">
          <div className="prose prose-sm max-w-none text-gray-500">
            <ReactMarkdown>{content}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * 解析内容，将 <think>...</think> 块和普通内容分离
 * 返回 [{type, content}] 数组，支持流式输出中的不完整标签
 */
export function parseThinkBlocks(text: string): { type: "think" | "content"; content: string }[] {
  const blocks: { type: "think" | "content"; content: string }[] = [];
  const regex = /<think>([\s\S]*?)(?:<\/think>|$)/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // 前面的普通文本
    if (match.index > lastIndex) {
      const before = text.slice(lastIndex, match.index).trim();
      if (before) {
        blocks.push({ type: "content", content: before });
      }
    }
    // think 块
    const thinkContent = match[1].trim();
    if (thinkContent) {
      blocks.push({ type: "think", content: thinkContent });
    }
    lastIndex = match.index + match[0].length;
  }

  // 剩余普通文本
  const remaining = text.slice(lastIndex).trim();
  if (remaining && !remaining.startsWith("<think>")) {
    blocks.push({ type: "content", content: remaining });
  }

  // 如果没有任何块，返回原文作为 content
  if (blocks.length === 0 && text.trim()) {
    blocks.push({ type: "content", content: text.trim() });
  }

  return blocks;
}
