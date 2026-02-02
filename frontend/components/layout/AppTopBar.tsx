"use client";

export function AppTopBar() {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b bg-white/80 px-6 py-4 backdrop-blur">
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-semibold text-slate-900">AI Agent Builder</h1>
      </div>
      <div className="flex flex-1 items-center justify-end gap-3" />
    </header>
  );
}
