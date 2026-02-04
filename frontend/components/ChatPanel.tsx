"use client";

import { useEffect, useMemo, useState } from "react";
import { Bot, Loader2, RefreshCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

const shortcuts = ["/debug", "/explain", "/summarize logs"];
const RUNTIME_BASE = process.env.NEXT_PUBLIC_RUNTIME_BASE || "/runtime";
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "/api";

type FormField = {
  name: string;
  label: string;
  type: "text" | "number" | "date" | "boolean" | "dropdown" | "enum" | "file";
  dropdown_options?: string[];
};
type FormConfig = {
  id: string;
  field_order: string[];
  fields: FormField[];
};
type FormsConfig = { forms: FormConfig[] };
type RuntimeState = {
  current_form_id?: string | null;
  current_step_index?: number;
  awaiting_field?: boolean;
  field_options?: Record<string, string[]>;
};

export function ChatPanel({ agentName }: { agentName: string }) {
  const [message, setMessage] = useState("");
  const [threadId, setThreadId] = useState(() => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : String(Date.now())));
  const [messages, setMessages] = useState(() => [
    {
      id: 1,
      role: "assistant",
      content: `Hi! I'm ${agentName}. Ask me to summarize the latest incident report or run a dry test.`,
      time: "Just now",
    },
  ]);
  const [isTyping, setIsTyping] = useState(false);
  const [sessionLabel, setSessionLabel] = useState("Session: Draft preview");
  const [formsCfg, setFormsCfg] = useState<FormsConfig | null>(null);
  const [lastState, setLastState] = useState<RuntimeState | null>(null);

  const cannedResponses = useMemo(
    () => [
      "Here’s a quick summary: the last incident was resolved in 18 minutes with no customer impact.",
      "Routing policy is set to priority-first with a 0.72 escalation threshold to pager.",
      "I can run a dry test on the newest workflow if you want. Share the trigger conditions.",
    ],
    []
  );

  useEffect(() => {
    const loadForms = async () => {
      try {
        const res = await fetch(`${API_BASE}/config/forms`);
        if (!res.ok) throw new Error(await res.text());
        const data = (await res.json()) as FormsConfig;
        setFormsCfg(data);
      } catch (err) {
        toast({ title: "Failed to load forms", description: String(err) });
      }
    };
    void loadForms();
  }, []);

  useEffect(() => {
    setMessages((prev) =>
      prev.map((item) =>
        item.id === 1 ? { ...item, content: `Hi! I'm ${agentName}. Ask me to summarize the latest incident report or run a dry test.` } : item
      )
    );
  }, [agentName]);

  const sendMessage = async (content: string) => {
    const trimmed = content.trim();
    if (!trimmed) return;
    const timestamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    setMessages((prev) => [
      ...prev,
      { id: prev.length + 1, role: "user", content: trimmed, time: timestamp },
    ]);
    setMessage("");
    setIsTyping(true);
    try {
      const res = await fetch(`${RUNTIME_BASE}/chat/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thread_id: threadId, message: trimmed }),
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      const data = await res.json();
      setLastState(data?.state || null);
      const reply = data?.reply || cannedResponses[Math.floor(Math.random() * cannedResponses.length)];
      setMessages((prev) => [
        ...prev,
        { id: prev.length + 1, role: "assistant", content: reply, time: timestamp },
      ]);
      setSessionLabel("Session: Draft preview");
    } catch (err) {
      try {
        const fallback = await fetch(`${RUNTIME_BASE}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ thread_id: threadId, message: trimmed }),
        });
        if (!fallback.ok) {
          throw new Error(await fallback.text());
        }
        const data = await fallback.json();
        setLastState(data?.state || null);
        const reply = data?.reply || cannedResponses[Math.floor(Math.random() * cannedResponses.length)];
        setMessages((prev) => [
          ...prev,
          { id: prev.length + 1, role: "assistant", content: reply, time: timestamp },
        ]);
        setSessionLabel("Session: Latest published");
      } catch (fallbackErr) {
        setLastState(null);
        setMessages((prev) => [
          ...prev,
          { id: prev.length + 1, role: "assistant", content: "I hit a problem reaching the runtime. Try again in a moment.", time: timestamp },
        ]);
        toast({ title: "Runtime error", description: String(fallbackErr || err) });
      }
    } finally {
      setIsTyping(false);
    }
  };

  const currentField = useMemo(() => {
    if (!formsCfg || !lastState?.awaiting_field || !lastState.current_form_id) return null;
    const form = formsCfg.forms.find((f) => f.id === lastState.current_form_id);
    if (!form) return null;
    const idx = lastState.current_step_index ?? 0;
    const fieldName = form.field_order[idx];
    if (!fieldName) return null;
    return form.fields.find((f) => f.name === fieldName) || null;
  }, [formsCfg, lastState]);

  const optionButtons = useMemo(() => {
    if (!currentField || !lastState?.awaiting_field) return [];
    if (currentField.type !== "dropdown" && currentField.type !== "enum") return [];
    const runtimeOptions = lastState.field_options?.[currentField.name] || [];
    const staticOptions = currentField.dropdown_options || [];
    const merged = Array.from(new Set([...runtimeOptions, ...staticOptions]));
    return merged.filter(Boolean);
  }, [currentField, lastState]);

  return (
    <Card className="flex h-full min-h-[720px] flex-col border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b px-5 py-4">
        <div className="flex items-center gap-2">
          <div className="relative">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Bot className="h-4 w-4" />
            </div>
            <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500" />
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-900">{agentName}</div>
            <div className="text-xs text-slate-500">{sessionLabel}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setMessages([
                {
                  id: 1,
                  role: "assistant",
                  content: `Hi! I'm ${agentName}. Ask me to summarize the latest incident report or run a dry test.`,
                  time: "Just now",
                },
              ]);
              setThreadId(globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : String(Date.now()));
              setIsTyping(false);
              toast({ title: "Session reset", description: "Chat history cleared." });
            }}
          >
            <RefreshCcw className="h-4 w-4" />
            Reset session
          </Button>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {messages.map((msg) => (
          <div key={msg.id} className={cn("flex flex-col gap-1", msg.role === "user" ? "items-end" : "items-start")}>
            <div
              className={cn(
                "max-w-[80%] rounded-2xl px-4 py-3 text-sm",
                msg.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "border border-slate-200 bg-slate-50 text-slate-900"
              )}
            >
              {msg.content.startsWith("```") ? (
                <pre className="whitespace-pre-wrap rounded-lg bg-slate-900 p-3 text-xs text-slate-100">{msg.content.replace(/```/g, "")}</pre>
              ) : (
                msg.content
              )}
            </div>
            <span className="text-xs text-slate-400">{msg.time}</span>
          </div>
        ))}

        {isTyping && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {agentName} is thinking...
          </div>
        )}
      </div>

      <div className="border-t px-5 py-4">
        {optionButtons.length > 0 && (
          <div className="flex flex-wrap gap-2 pb-3">
            {optionButtons.map((opt) => (
              <Button key={opt} variant="outline" size="sm" onClick={() => sendMessage(opt)}>
                {opt}
              </Button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2 pb-3">
          {shortcuts.map((shortcut) => (
            <Button key={shortcut} variant="outline" size="sm" onClick={() => sendMessage(shortcut)}>
              {shortcut}
            </Button>
          ))}
        </div>
        <div className="flex gap-3">
          <Textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Send a message..."
            className="min-h-[44px] flex-1"
          />
          <Button
            className="self-end"
            onClick={() => {
              sendMessage(message);
            }}
          >
            Send
          </Button>
        </div>
      </div>
    </Card>
  );
}
