"use client";

import { useEffect, useMemo, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "/api";

type ThreadSummary = { thread_id: string; last_activity?: string | null };
type ThreadMessage = { role: string; content: string; created_at?: string | null };

export function RunsPanel() {
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string>("");
  const [threadMessages, setThreadMessages] = useState<ThreadMessage[]>([]);
  const [search, setSearch] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string>("");

  const filteredThreads = useMemo(() => {
    if (!search.trim()) return threads;
    const query = search.toLowerCase();
    return threads.filter((t) => t.thread_id.toLowerCase().includes(query));
  }, [threads, search]);

  const loadThreads = async () => {
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch(`${API_BASE}/threads`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setThreads(data.threads || []);
    } catch (err) {
      setMessage(`Failed to load threads: ${String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  const loadThreadMessages = async (threadId: string) => {
    if (!threadId) return;
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch(`${API_BASE}/threads/${threadId}/messages`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setThreadMessages(data.messages || []);
      setSelectedThreadId(threadId);
    } catch (err) {
      setMessage(`Failed to load thread messages: ${String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadThreads();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Runs</h2>
          <p className="text-sm text-slate-500">Browse thread activity and review conversations.</p>
        </div>
        <button
          className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          onClick={loadThreads}
          disabled={loading}
        >
          Refresh
        </button>
      </div>

      {message && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {message}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-3 text-xs font-semibold uppercase text-slate-500">Threads</div>
          <input
            className="mb-3 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            placeholder="Search thread id"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="space-y-2">
            {filteredThreads.map((thread) => (
              <button
                key={thread.thread_id}
                className={`w-full rounded-md border px-3 py-2 text-left text-sm transition ${
                  selectedThreadId === thread.thread_id
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
                onClick={() => loadThreadMessages(thread.thread_id)}
              >
                <div className="truncate font-medium">{thread.thread_id}</div>
                <div className={`text-xs ${selectedThreadId === thread.thread_id ? "text-slate-200" : "text-slate-500"}`}>
                  {thread.last_activity ? new Date(thread.last_activity).toLocaleString() : "No activity"}
                </div>
              </button>
            ))}
            {filteredThreads.length === 0 && (
              <div className="text-sm text-slate-500">No threads found.</div>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold uppercase text-slate-500">Conversation</div>
              <div className="text-sm font-medium text-slate-900">{selectedThreadId || "Select a thread"}</div>
            </div>
          </div>
          <div className="space-y-4">
            {threadMessages.map((msg, idx) => (
              <div key={`${msg.role}-${idx}`} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="uppercase">{msg.role}</span>
                  <span>{msg.created_at ? new Date(msg.created_at).toLocaleString() : ""}</span>
                </div>
                <div className="mt-2 whitespace-pre-wrap text-slate-900">{msg.content}</div>
              </div>
            ))}
            {threadMessages.length === 0 && (
              <div className="text-sm text-slate-500">No messages loaded.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
