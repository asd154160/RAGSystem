"use client";

import { Plus, MessageCircle, Trash2, Loader2 } from "lucide-react";
import { Conversation } from "@/types";

interface Props {
  sessions: Conversation[];
  activeId: string | null;
  streamingSessionIds: Set<string>;
  unreadIds: Set<string>;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}

export default function SessionList({ sessions, activeId, streamingSessionIds, unreadIds, onSelect, onNew, onDelete }: Props) {
  return (
    <div className="flex h-full flex-col border-r bg-[var(--color-background)]">
      <div className="flex items-center justify-between border-b px-3 py-3">
        <span className="text-sm font-semibold text-gray-700">会话列表</span>
        <button
          onClick={onNew}
          className="rounded-md p-1.5 text-gray-500 hover:bg-gray-200 hover:text-gray-700"
          title="新建对话"
        >
          <Plus size={18} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {sessions.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-400">暂无历史会话</p>
        ) : (
          sessions.map((s) => (
            <div
              key={s.id}
              onClick={() => onSelect(s.id)}
              className={`group flex cursor-pointer items-center justify-between px-3 py-2.5 text-sm transition-colors ${
                activeId === s.id
                  ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              <div className="flex min-w-0 items-center gap-2">
                {streamingSessionIds.has(s.id) ? (
                  <Loader2 size={14} className="shrink-0 animate-spin text-blue-500" />
                ) : unreadIds.has(s.id) ? (
                  <span className="shrink-0 w-2 h-2 rounded-full bg-red-500" />
                ) : (
                  <MessageCircle size={14} className="shrink-0" />
                )}
                <span className="truncate">{s.title || "新对话"}</span>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(s.id);
                }}
                className="ml-1 shrink-0 rounded p-0.5 text-gray-300 opacity-0 hover:bg-red-100 hover:text-red-500 group-hover:opacity-100"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
