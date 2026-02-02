"use client";

import { useEffect, useMemo, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "/api";

type FormField = { name: string; label: string };

type Form = {
  id: string;
  name: string;
  field_order?: string[];
  fields?: FormField[];
};

type Submission = {
  id: number;
  tenant_id: string;
  agent_id: string;
  version: number | null;
  thread_id: string | null;
  form_id: string | null;
  form_name: string | null;
  delivery_type: string | null;
  delivery_target: string | null;
  delivery_status: string | null;
  payload: Record<string, unknown> | null;
  delivery_result: Record<string, unknown> | null;
  created_at: string | null;
};

const formatValue = (value: unknown) => {
  if (value === null || value === undefined) return "-";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
};

export function SubmissionsPanel() {
  const [forms, setForms] = useState<Form[]>([]);
  const [selectedFormId, setSelectedFormId] = useState<string>("");
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loadingForms, setLoadingForms] = useState(false);
  const [loadingSubs, setLoadingSubs] = useState(false);
  const [message, setMessage] = useState<string>("");

  const selectedForm = useMemo(() => forms.find((form) => form.id === selectedFormId) || null, [forms, selectedFormId]);

  const columns = useMemo(() => {
    if (!selectedForm) return [] as FormField[];
    const fields = selectedForm.fields || [];
    const order = selectedForm.field_order || fields.map((field) => field.name);
    return order
      .map((name) => fields.find((field) => field.name === name))
      .filter(Boolean) as FormField[];
  }, [selectedForm]);

  const loadForms = async () => {
    setLoadingForms(true);
    setMessage("");
    try {
      const res = await fetch(`${API_BASE}/config/forms`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const items = (data.forms || []).map((form: any) => ({
        id: form.id,
        name: form.name,
        field_order: form.field_order,
        fields: (form.fields || []).map((field: any) => ({ name: field.name, label: field.label || field.name })),
      }));
      setForms(items);
      if (!selectedFormId && items.length > 0) {
        setSelectedFormId(items[0].id);
      }
    } catch (err) {
      setMessage(`Failed to load forms: ${String(err)}`);
    } finally {
      setLoadingForms(false);
    }
  };

  const loadSubmissions = async (formId: string) => {
    if (!formId) return;
    setLoadingSubs(true);
    setMessage("");
    try {
      const res = await fetch(`${API_BASE}/submissions?form_id=${encodeURIComponent(formId)}`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setSubmissions(data.items || []);
    } catch (err) {
      setMessage(`Failed to load submissions: ${String(err)}`);
    } finally {
      setLoadingSubs(false);
    }
  };

  useEffect(() => {
    void loadForms();
  }, []);

  useEffect(() => {
    if (selectedFormId) {
      void loadSubmissions(selectedFormId);
    }
  }, [selectedFormId]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Submissions</h2>
          <p className="text-sm text-slate-500">Pick a form to see its submitted field values.</p>
        </div>
      </div>

      {message && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {message}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-3 text-xs font-semibold uppercase text-slate-500">Forms</div>
          {loadingForms && <div className="text-sm text-slate-500">Loading forms…</div>}
          <div className="space-y-2">
            {forms.map((form) => (
              <button
                key={form.id}
                className={`w-full rounded-md border px-3 py-2 text-left text-sm transition ${
                  selectedFormId === form.id
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
                onClick={() => setSelectedFormId(form.id)}
              >
                <div className="font-medium">{form.name}</div>
                <div className={`text-xs ${selectedFormId === form.id ? "text-slate-200" : "text-slate-500"}`}>
                  {form.id}
                </div>
              </button>
            ))}
            {forms.length === 0 && !loadingForms && (
              <div className="text-sm text-slate-500">No forms configured.</div>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div>
              <div className="text-xs font-semibold uppercase text-slate-500">Submissions</div>
              <div className="text-sm font-medium text-slate-900">{selectedForm?.name || "Select a form"}</div>
            </div>
            <button
              className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              onClick={() => selectedFormId && loadSubmissions(selectedFormId)}
              disabled={loadingSubs}
            >
              Refresh
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3">Thread</th>
                  {columns.map((field) => (
                    <th key={field.name} className="px-4 py-3">
                      {field.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {submissions.map((item) => (
                  <tr key={item.id} className="border-t border-slate-200">
                    <td className="px-4 py-3 text-slate-600">
                      {item.created_at ? new Date(item.created_at).toLocaleString() : "-"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{item.thread_id || "-"}</td>
                    {columns.map((field) => (
                      <td key={`${item.id}-${field.name}`} className="px-4 py-3 text-slate-600">
                        {formatValue(item.payload?.[field.name])}
                      </td>
                    ))}
                  </tr>
                ))}
                {submissions.length === 0 && !loadingSubs && (
                  <tr>
                    <td colSpan={2 + columns.length} className="px-4 py-6 text-center text-sm text-slate-500">
                      No submissions found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
