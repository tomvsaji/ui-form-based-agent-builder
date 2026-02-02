export default function BillingPage() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Billing</h2>
        <p className="text-sm text-slate-500">Billing is not configured for this deployment yet.</p>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600">
        Connect a billing provider to manage plans, invoices, and usage reporting.
      </div>
    </div>
  );
}
