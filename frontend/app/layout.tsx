import "./globals.css";
import { ReactNode } from "react";

import { Shell } from "@/components/layout/Shell";
import { Toaster } from "@/components/ui/toaster";

export const metadata = {
  title: "Agent Builder",
  description: "Authoring UI for intents, forms, knowledge, and deployment settings",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-900">
        <Shell>{children}</Shell>
        <Toaster />
      </body>
    </html>
  );
}
