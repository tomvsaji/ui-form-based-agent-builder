"use client";

import { Fragment, useEffect, useMemo, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "/api";

type TraceLog = {
  trace_id: string;
  thread_id: string;
  version: number;
  data: Record<string, unknown>;
  created_at?: string | null;
};

export function LogsPanel() {
  const [traces, setTraces] = useState<TraceLog[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [threadFilter, setThreadFilter] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string>("");

  const filteredTraces = useMemo(() => {
    if (!threadFilter.trim()) return traces;
    const query = threadFilter.toLowerCase();
    return traces.filter((t) => t.thread_id.toLowerCase().includes(query));
  }, [traces, threadFilter]);

  const loadTraces = async () => {
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch(`${API_BASE}/traces`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setTraces(data.traces || []);
    } catch (err) {
      setMessage(`Failed to load traces: ${String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTraces();
  }, []);

  const renderSummary = (trace: TraceLog) => {
    const data = trace.data || {};
    const node = (data as any).node || (data as any).event || (data as any).step;
    return node ? String(node) : "Trace event";
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Logs</h2>
          <p className="text-sm text-slate-500">Trace events with expandable detail.</p>
        </div>
        <div className="flex gap-2">
          <input
            className="rounded-md border border-slate-200 px-3 py-2 text-sm"
            placeholder="Filter by thread id"
            value={threadFilter}
            onChange={(e) => setThreadFilter(e.target.value)}
          />
          <button
            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            onClick={loadTraces}
            disabled={loading}
          >
            Refresh
          </button>
        </div>
      </div>

      {message && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {message}
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Thread</th>
                <th className="px-4 py-3">Version</th>
                <th className="px-4 py-3">Summary</th>
                <th className="px-4 py-3 text-right">Details</th>
              </tr>
            </thead>
            <tbody>
              {filteredTraces.map((trace) => (
                <Fragment key={trace.trace_id}>
                  <tr className="border-t border-slate-200">
                    <td className="px-4 py-3 text-slate-600">
                      {trace.created_at ? new Date(trace.created_at).toLocaleString() : "-"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{trace.thread_id}</td>
                    <td className="px-4 py-3 text-slate-600">v{trace.version}</td>
                    <td className="px-4 py-3 text-slate-900">{renderSummary(trace)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        className="rounded-md border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                        onClick={() => setExpandedId(expandedId === trace.trace_id ? null : trace.trace_id)}
                      >
                        {expandedId === trace.trace_id ? "Hide" : "View"}
                      </button>
                    </td>
                  </tr>
                  {expandedId === trace.trace_id && (
                    <tr className="border-t border-slate-200 bg-slate-50">
                      <td colSpan={5} className="px-4 py-4">
                        <pre className="whitespace-pre-wrap text-xs text-slate-700">
                          {JSON.stringify(trace.data, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {filteredTraces.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-500">
                    No traces found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
