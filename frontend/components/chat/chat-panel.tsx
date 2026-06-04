"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Bot, User, Loader2, Database, ThumbsUp, ThumbsDown } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChatMessage, RagSource } from "@/types";
import ThinkBlock, { parseThinkBlocks } from "./think-block";

function MessageContent({ content }: { content: string }) {
  const blocks = parseThinkBlocks(content);
  return (
    <div className="prose prose-sm max-w-none">
      {blocks.map((block, i) =>
        block.type === "think" ? (
          <ThinkBlock key={i} content={block.content} />
        ) : (
          <ReactMarkdown key={i} remarkPlugins={[remarkGfm]}>{block.content}</ReactMarkdown>
        )
      )}
    </div>
  );
}

interface KB { id: string; name: string; }

interface Props {
  messages: ChatMessage[];
  streaming: boolean;
  streamContent: string;
  statusMsg: string;
  onSend: (question: string) => void;
  onSourceHover: (index: number | null) => void;
  onFeedback: (messageId: string, rating: string, reason: string) => Promise<void>;
  kbList?: KB[];
  selectedKbIds: string[];
  onKbToggle?: (kbId: string) => void;
}

export default function ChatPanel({
  messages, streaming, streamContent, statusMsg,
  onSend, onSourceHover, onFeedback,
  kbList, selectedKbIds, onKbToggle,
}: Props) {
  const [input, setInput] = useState("");
  const [dislikeActive, setDislikeActive] = useState<Record<string, boolean>>({});
  const [dislikeReason, setDislikeReason] = useState<Record<string, string>>({});
  const [submittingFeedback, setSubmittingFeedback] = useState<Record<string, boolean>>({});
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamContent, statusMsg]);

  const handleSend = () => {
    const q = input.trim();
    if (!q || streaming) return;
    setInput("");
    onSend(q);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleLike = async (messageId: string) => {
    setSubmittingFeedback(prev => ({ ...prev, [messageId]: true }));
    try { await onFeedback(messageId, "like", ""); } catch {}
    setSubmittingFeedback(prev => ({ ...prev, [messageId]: false }));
  };

  const handleDislike = (messageId: string) => {
    setDislikeActive(prev => ({ ...prev, [messageId]: !prev[messageId] }));
  };

  const handleDislikeSubmit = async (messageId: string) => {
    const reason = dislikeReason[messageId] || "";
    if (!reason.trim()) return;
    setSubmittingFeedback(prev => ({ ...prev, [messageId]: true }));
    try { await onFeedback(messageId, "dislike", reason); } catch {}
    setSubmittingFeedback(prev => ({ ...prev, [messageId]: false }));
    setDislikeActive(prev => ({ ...prev, [messageId]: false }));
    setDislikeReason(prev => ({ ...prev, [messageId]: "" }));
  };

  return (
    <div className="flex h-full flex-col">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        {messages.length === 0 && !streaming && (
          <div className="flex h-full items-center justify-center">
            <div className="text-center text-gray-400">
              <Bot size={48} className="mx-auto mb-3 text-gray-300" />
              <p className="text-sm">输入问题开始对话</p>
            </div>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className="mb-6">
            <div className={`flex gap-3 ${m.role === "user" ? "justify-end" : ""}`}>
              {m.role === "assistant" && (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100">
                  <Bot size={16} className="text-blue-600" />
                </div>
              )}
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  m.role === "user"
                    ? "bg-blue-600 text-white"
                    : "bg-white border text-gray-700"
                }`}
              >
                {m.role === "user" ? (
                  <p>{m.content}</p>
                ) : (
                  <MessageContent content={m.content} />
                )}
              </div>
              {m.role === "user" && (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-200">
                  <User size={16} className="text-gray-500" />
                </div>
              )}
            </div>
            {/* Sources inline for assistant */}
            {m.role === "assistant" && m.sources && m.sources.length > 0 && (
              <div className="ml-11 mt-2 flex flex-wrap gap-1.5">
                {m.sources.map((s: RagSource, i: number) => (
                  <span
                    key={i}
                    onMouseEnter={() => onSourceHover(i)}
                    onMouseLeave={() => onSourceHover(null)}
                    className="inline-flex cursor-pointer items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500 hover:bg-blue-100 hover:text-blue-600"
                  >
                    [{i + 1}] {s.document_name}
                  </span>
                ))}
              </div>
            )}
            {/* Feedback buttons */}
            {m.role === "assistant" && !m.rating && (
              <div className="ml-11 mt-2 flex items-center gap-2">
                <button
                  onClick={() => handleLike(m.id)}
                  disabled={submittingFeedback[m.id]}
                  className="flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors"
                >
                  <ThumbsUp size={13} /> 有用
                </button>
                <button
                  onClick={() => handleDislike(m.id)}
                  disabled={submittingFeedback[m.id]}
                  className={`flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors ${
                    dislikeActive[m.id]
                      ? "bg-red-100 text-red-700"
                      : "text-gray-400 hover:text-red-600 hover:bg-red-50"
                  }`}
                >
                  <ThumbsDown size={13} /> 无用
                </button>
                {dislikeActive[m.id] && (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      placeholder="请填写反馈原因"
                      value={dislikeReason[m.id] || ""}
                      onChange={e => setDislikeReason(prev => ({ ...prev, [m.id]: e.target.value }))}
                      className="flex-1 text-xs border rounded px-2 py-1 text-gray-600 placeholder-gray-300"
                    />
                    <button
                      onClick={() => handleDislikeSubmit(m.id)}
                      disabled={submittingFeedback[m.id] || !(dislikeReason[m.id] || "").trim()}
                      className="rounded px-2.5 py-1 text-xs bg-red-600 text-white hover:bg-red-700 disabled:opacity-40"
                    >
                      提交
                    </button>
                  </div>
                )}
              </div>
            )}
            {/* Feedback result */}
            {m.role === "assistant" && m.rating && (
              <div className="ml-11 mt-2">
                <span className={`inline-flex items-center gap-1 text-xs ${
                  m.rating === "like" ? "text-green-600" : "text-red-600"
                }`}>
                  {m.rating === "like" ? <ThumbsUp size={12} /> : <ThumbsDown size={12} />}
                  {m.rating === "like" ? "已反馈：有用" : `已反馈：无用${m.rating_reason ? ` — ${m.rating_reason}` : ""}`}
                </span>
              </div>
            )}
          </div>
        ))}

        {/* Streaming content */}
        {streaming && (
          <div className="mb-6">
            <div className="flex gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100">
                <Bot size={16} className="text-blue-600" />
              </div>
              <div className="max-w-[80%] rounded-2xl border bg-white px-4 py-3 text-sm leading-relaxed text-gray-700">
                {statusMsg ? (
                  <div className="flex items-center gap-2 text-gray-400">
                    <Loader2 size={14} className="animate-spin" />
                    <span>{statusMsg}</span>
                  </div>
                ) : streamContent ? (
                  <MessageContent content={streamContent} />
                ) : (
                  <div className="flex items-center gap-2 text-gray-400">
                    <Loader2 size={14} className="animate-spin" />
                    <span>思考中...</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* KB Selector */}
      {kbList && kbList.length > 0 && (
        <div className="border-t bg-gray-50 px-4 py-2">
          <div className="flex items-center gap-2">
            <Database size={14} className="text-gray-400 shrink-0" />
            <span className="text-xs text-gray-500 shrink-0">检索范围:</span>
            <div className="flex flex-wrap gap-1">
              <button
                onClick={() => onKbToggle?.("__all__")}
                className={`rounded-full px-2.5 py-0.5 text-xs border transition-colors ${
                  selectedKbIds.length === 0
                    ? "bg-blue-100 text-blue-700 border-blue-300"
                    : "bg-white text-gray-500 border-gray-200 hover:border-blue-200"
                }`}
              >全部</button>
              {kbList.map(kb => {
                const active = selectedKbIds.includes(kb.id);
                return (
                  <button key={kb.id}
                    onClick={() => onKbToggle?.(kb.id)}
                    className={`rounded-full px-2.5 py-0.5 text-xs border transition-colors truncate max-w-[120px] ${
                      active
                        ? "bg-blue-100 text-blue-700 border-blue-300"
                        : "bg-white text-gray-500 border-gray-200 hover:border-blue-200"
                    }`}
                  >{kb.name}</button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="border-t bg-white px-4 py-3">
        <div className="flex items-end gap-3">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入你的问题... (Enter 发送, Shift+Enter 换行)"
            rows={1}
            disabled={streaming}
            className="flex-1 resize-none rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || streaming}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
