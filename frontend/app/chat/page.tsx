"use client";

import { useEffect, useMemo, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_RUNTIME_BASE || "/runtime";

type Form = {
  id: string;
  name: string;
  description: string;
  mode: "step-by-step" | "one-shot";
};

type ChatTurn = { role: "user" | "assistant"; content: string };

export default function ChatTester() {
  const [forms, setForms] = useState<Form[]>([]);
  const [threadId, setThreadId] = useState<string>(() => `thread-${Date.now()}`);
  const [input, setInput] = useState<string>("");
  const [log, setLog] = useState<ChatTurn[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [status, setStatus] = useState<string>("");

  const defaultFormName = useMemo(() => forms[0]?.name || "", [forms]);

  const loadForms = async () => {
    try {
      const res = await fetch(`${API_BASE}/forms`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setForms(data.forms || []);
      setStatus("Loaded forms.");
    } catch (err) {
      setStatus(`Failed to load forms: ${String(err)}`);
    }
  };

  useEffect(() => {
    void loadForms();
  }, []);

  const sendMessage = async () => {
    if (!input.trim()) return;
    const userMsg: ChatTurn = { role: "user", content: input };
    setLog((prev) => [...prev, userMsg]);
    setLoading(true);
    setStatus("");
    try {
      const res = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thread_id: threadId, message: input }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const assistantMsg: ChatTurn = { role: "assistant", content: data.reply };
      setLog((prev) => [...prev, assistantMsg]);
      setStatus("Message processed.");
      setInput("");
    } catch (err) {
      setStatus(`Send failed: ${String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  const resetThread = () => {
    setThreadId(`thread-${Date.now()}`);
    setLog([]);
    setStatus("New thread created.");
  };

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "32px 16px" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>Chat tester</h1>
          <p style={{ color: "#475569", margin: "4px 0" }}>Use this page to send messages against the configured backend graph.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <a className="btn secondary" href="/">
            ← Back to builder
          </a>
          <button className="btn secondary" onClick={resetThread}>
            New thread
          </button>
        </div>
      </header>

      {status && <div className="card" style={{ marginBottom: 12 }}>{status}</div>}

      <div className="card" style={{ marginBottom: 12 }}>
        <h2 style={{ marginTop: 0 }}>Available forms</h2>
        {forms.length === 0 && <p>No forms loaded yet.</p>}
        <ul className="space-y-1">
          {forms.map((f) => (
            <li key={f.id}>
              <strong>{f.name}</strong> — {f.description} ({f.mode})
            </li>
          ))}
        </ul>
      </div>

      <div className="card">
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input
            className="w-full"
            value={threadId}
            onChange={(e) => setThreadId(e.target.value)}
            placeholder="Thread id"
          />
          <span className="text-sm text-slate-600" style={{ alignSelf: "center" }}>
            First form (if routed): {defaultFormName || "None"}
          </span>
        </div>
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr auto" }}>
          <textarea
            className="w-full"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message"
          />
          <button className="btn" disabled={loading} onClick={sendMessage}>
            {loading ? "Sending..." : "Send"}
          </button>
        </div>
        <div style={{ marginTop: 12 }} className="space-y-2">
          {log.map((m, idx) => (
            <div key={idx} className="border rounded p-2">
              <div style={{ fontWeight: 600 }}>{m.role === "user" ? "You" : "Assistant"}</div>
              <div>{m.content}</div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
