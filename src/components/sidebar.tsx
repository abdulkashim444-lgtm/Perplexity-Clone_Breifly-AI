import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createThread, deleteThread, listThreads } from "@/lib/threads.functions";
import { Button } from "@/components/ui/button";
import { Plus, MessageSquare, Trash2, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const listFn = useServerFn(listThreads);
  const createFn = useServerFn(createThread);
  const deleteFn = useServerFn(deleteThread);

  const { data: threads = [] } = useQuery({
    queryKey: ["threads"],
    queryFn: () => listFn(),
  });

  const newThread = async () => {
    const { id } = await createFn();
    await qc.invalidateQueries({ queryKey: ["threads"] });
    navigate({ to: "/t/$threadId", params: { threadId: id } });
  };

  const remove = async (id: string) => {
    await deleteFn({ data: { id } });
    await qc.invalidateQueries({ queryKey: ["threads"] });
    if (location.pathname.includes(id)) navigate({ to: "/" });
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/auth";
  };

  return (
    <aside className="w-64 shrink-0 h-screen sticky top-0 flex flex-col bg-sidebar border-r border-sidebar-border">
      <div className="p-4">
        <Link to="/" className="flex items-center gap-2">
          <img src="/favicon.png" alt="Searchly" width={28} height={28} className="w-7 h-7 rounded-lg" />
          <span className="font-serif text-lg">Searchly</span>
        </Link>
      </div>
      <div className="px-3 pb-3">
        <Button onClick={newThread} className="w-full justify-start gap-2" size="sm">
          <Plus size={16} /> New search
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1">
        {threads.map((t) => {
          const active = location.pathname.endsWith(t.id);
          return (
            <div
              key={t.id}
              className={`group flex items-center rounded-md text-sm ${active ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/60"}`}
            >
              <Link
                to="/t/$threadId"
                params={{ threadId: t.id }}
                className="flex-1 min-w-0 flex items-center gap-2 px-3 py-2"
              >
                <MessageSquare size={14} className="shrink-0 opacity-60" />
                <span className="truncate">{t.title || "New search"}</span>
              </Link>
              <button
                type="button"
                onClick={() => remove(t.id)}
                className="opacity-0 group-hover:opacity-100 px-2 py-2 text-muted-foreground hover:text-destructive"
                aria-label="Delete thread"
              >
                <Trash2 size={14} />
              </button>
            </div>
          );
        })}
        {threads.length === 0 && (
          <p className="px-3 py-2 text-xs text-muted-foreground">No searches yet.</p>
        )}
      </div>
      <div className="p-3 border-t border-sidebar-border">
        <Button onClick={signOut} variant="ghost" size="sm" className="w-full justify-start gap-2">
          <LogOut size={14} /> Sign out
        </Button>
      </div>
    </aside>
  );
}
