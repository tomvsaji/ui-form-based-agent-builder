"use client";

import { ChevronDown, Plus, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/use-toast";

export function AppTopBar() {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b bg-white/80 px-6 py-4 backdrop-blur">
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-semibold text-slate-900">AI Agent Builder</h1>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="gap-2">
              Workspace: Nimbus
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem>Workspace: Nimbus</DropdownMenuItem>
            <DropdownMenuItem>Workspace: Orion</DropdownMenuItem>
            <DropdownMenuItem>Workspace: Atlas</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="flex flex-1 items-center justify-end gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input className="pl-9" placeholder="Search agents, runs, logs..." />
        </div>
        <Button
          onClick={() =>
            toast({
              title: "New agent",
              description: "A new agent workspace has been created.",
            })
          }
        >
          <Plus className="h-4 w-4" />
          New agent
        </Button>
      </div>
    </header>
  );
}
