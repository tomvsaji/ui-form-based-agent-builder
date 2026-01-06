"use client";

import { useEffect, useMemo, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_RUNTIME_BASE || "/runtime";

type Form = {
  id: string;
  name: string;
  description: string;
  mode: "step-by-step" | "one-shot";
  field_order?: string[];
  fields?: Array<{
    name: string;
    label: string;
    type: string;
    dropdown_options?: string[] | null;
  }>;
};

type ChatTurn = { role: "user" | "assistant"; content: string };
type ChatState = {
  current_form_id?: string;
  current_step_index?: number;
  awaiting_field?: boolean;
  field_options?: Record<string, string[]>;
};

export default function ChatTester() {
  const [forms, setForms] = useState<Form[]>([]);
  const [threadId, setThreadId] = useState<string>(() => `thread-${Date.now()}`);
  const [input, setInput] = useState<string>("");
  const [log, setLog] = useState<ChatTurn[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [status, setStatus] = useState<string>("");
  const [selectedFormId, setSelectedFormId] = useState<string>("");
  const [lastState, setLastState] = useState<ChatState | null>(null);
  const [selectValue, setSelectValue] = useState<string>("");

  const defaultFormName = useMemo(() => forms[0]?.name || "", [forms]);
  const selectedForm = useMemo(
    () => forms.find((f) => f.id === selectedFormId) || forms[0] || null,
    [forms, selectedFormId]
  );
  const currentForm = useMemo(() => {
    if (lastState?.current_form_id) {
      return forms.find((f) => f.id === lastState.current_form_id) || null;
    }
    return selectedForm;
  }, [forms, lastState, selectedForm]);
  const currentField = useMemo(() => {
    if (
      !lastState?.awaiting_field ||
      currentForm?.mode !== "step-by-step" ||
      !currentForm?.field_order ||
      !currentForm.fields
    ) {
      return null;
    }
    const idx = lastState.current_step_index ?? 0;
    const fieldName = currentForm.field_order[idx];
    return currentForm.fields.find((f) => f.name === fieldName) || null;
  }, [currentForm, lastState]);
  const currentOptions = useMemo(() => {
    if (!currentField) return [];
    const dynamic = lastState?.field_options?.[currentField.name];
    if (dynamic && dynamic.length > 0) return dynamic;
    return currentField.dropdown_options || [];
  }, [currentField, lastState]);

  const loadForms = async () => {
    try {
      const res = await fetch(`${API_BASE}/forms`);
      if (res.status === 404) {
        setStatus("No published version found. Publish a version in the builder first.");
        setForms([]);
        return;
      }
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setForms(data.forms || []);
      setSelectedFormId(data.forms?.[0]?.id || "");
      setStatus("Loaded forms.");
    } catch (err) {
      setStatus(`Failed to load forms: ${String(err)}`);
    }
  };

  useEffect(() => {
    void loadForms();
  }, []);

  const sendMessage = async () => {
    const messageToSend = input.trim();
    if (!messageToSend) return;
    const userMsg: ChatTurn = { role: "user", content: messageToSend };
    setLog((prev) => [...prev, userMsg]);
    setLoading(true);
    setStatus("");
    try {
      const res = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thread_id: threadId, message: messageToSend }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const assistantMsg: ChatTurn = { role: "assistant", content: data.reply };
      setLog((prev) => [...prev, assistantMsg]);
      setLastState(data.state || null);
      setStatus("Message processed.");
      setInput("");
      setSelectValue("");
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
    <main style={{ maxWidth: 1000, margin: "0 auto", padding: "32px 16px" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
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

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 16 }}>
        <div className="card" style={{ display: "flex", flexDirection: "column", minHeight: 520 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <input
              className="w-full"
              value={threadId}
              onChange={(e) => setThreadId(e.target.value)}
              placeholder="Thread id"
            />
            <span className="text-sm text-slate-600" style={{ alignSelf: "center" }}>
              Default: {defaultFormName || "None"}
            </span>
          </div>

          <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
            {log.length === 0 && <p className="text-sm text-slate-600">Send a message to start the thread.</p>}
            {log.map((m, idx) => (
              <div
                key={idx}
                style={{
                  display: "flex",
                  justifyContent: m.role === "user" ? "flex-end" : "flex-start",
                }}
              >
                <div
                  className="border rounded p-2"
                  style={{
                    maxWidth: "75%",
                    background: m.role === "user" ? "#0f172a" : "#f1f5f9",
                    color: m.role === "user" ? "#fff" : "#0f172a",
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>
                    {m.role === "user" ? "You" : "Assistant"}
                  </div>
                  <div>{m.content}</div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 12, display: "grid", gap: 8, gridTemplateColumns: "1fr auto" }}>
            <div className="space-y-2">
              {currentField?.type === "dropdown" || currentField?.type === "enum" ? (
                <select
                  className="w-full"
                  value={selectValue}
                  onChange={(e) => {
                    setSelectValue(e.target.value);
                    setInput(e.target.value);
                  }}
                >
                  <option value="">Select {currentField.label}</option>
                  {currentOptions.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              ) : currentField?.type === "boolean" ? (
                <select
                  className="w-full"
                  value={selectValue}
                  onChange={(e) => {
                    setSelectValue(e.target.value);
                    setInput(e.target.value);
                  }}
                >
                  <option value="">Select {currentField.label}</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              ) : null}
              <textarea
                className="w-full"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type a message"
              />
            </div>
            <button className="btn" disabled={loading} onClick={sendMessage}>
              {loading ? "Sending..." : "Send"}
            </button>
          </div>
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0 }}>Form preview</h2>
          {forms.length === 0 && <p>No forms loaded yet.</p>}
          {forms.length > 0 && (
            <>
              <select
                className="w-full"
                value={selectedForm?.id || ""}
                onChange={(e) => setSelectedFormId(e.target.value)}
              >
                {forms.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
              {selectedForm && (
                <div className="space-y-2" style={{ marginTop: 12 }}>
                  <div className="text-sm text-slate-600">{selectedForm.description}</div>
                  {selectedForm.fields?.map((field) => (
                    <div key={field.name} className="border rounded p-2">
                      <div style={{ fontWeight: 600 }}>{field.label}</div>
                      <div className="text-sm text-slate-600">{field.type}</div>
                      {field.type === "dropdown" && field.dropdown_options && (
                        <div className="text-sm" style={{ marginTop: 4 }}>
                          Options: {field.dropdown_options.join(", ")}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
