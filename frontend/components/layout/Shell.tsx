import { ReactNode } from "react";

import { AppSidebar } from "@/components/layout/AppSidebar";
import { AppTopBar } from "@/components/layout/AppTopBar";

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-slate-50">
      <AppSidebar />
      <div className="flex flex-1 flex-col">
        <AppTopBar />
        <main className="flex-1 px-6 py-6">
          {children}
        </main>
      </div>
    </div>
  );
}
