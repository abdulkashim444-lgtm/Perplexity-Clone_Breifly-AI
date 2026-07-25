import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Sidebar } from "@/components/sidebar";
import { SearchBar } from "@/components/search-bar";
import { supabase } from "@/integrations/supabase/client";
import type { ChatAttachment, ImageChatAttachment } from "@/lib/sse-client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Breifly AI — AI answer engine" },
      { name: "description", content: "Ask anything. Breifly AI reads the live web and streams cited answers — no sign-in required." },
      { property: "og:title", content: "Breifly AI — AI answer engine" },
      { property: "og:description", content: "Cited AI answers, streamed live. Try it free — no sign-in required." },
    ],
  }),
  component: Landing,
});

const EXAMPLES = [
  "What's the latest on AI reasoning benchmarks?",
  "Compare Rust and Go for backend services",
  "Best practices for React Server Components in 2026",
  "How does Perplexity's search actually work?",
];

function Landing() {
  const navigate = useNavigate();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setSignedIn(!!session);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const guestSubmit = (
    query: string,
    pdfs: ChatAttachment[],
    imgs: ImageChatAttachment[],
  ) => {
    const id = crypto.randomUUID();
    if (pdfs.length) sessionStorage.setItem(`pending-attachments:${id}`, JSON.stringify(pdfs));
    if (imgs.length) sessionStorage.setItem(`pending-images:${id}`, JSON.stringify(imgs));
    navigate({ to: "/g/$sessionId", params: { sessionId: id }, search: { q: query } });
  };

  return (
    <div className="flex min-h-screen">
      {signedIn && <Sidebar />}
      <main className="flex-1 flex flex-col">
        {!signedIn && (
          <header className="flex items-center justify-between px-6 py-4 border-b">
            <Link to="/" className="flex items-center gap-2">
              <img src="/favicon.png" alt="Breifly AI" width={28} height={28} className="w-7 h-7 rounded-lg" />
              <span className="font-serif text-lg">Breifly AI</span>
            </Link>
            <Link
              to="/auth"
              className="text-sm px-3 py-1.5 rounded-md border border-border hover:border-primary/50 hover:bg-accent/40 transition-colors"
            >
              Sign in
            </Link>
          </header>
        )}
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="w-full max-w-2xl -mt-8">
            <div className="text-center mb-8">
              <h1 className="font-serif text-5xl leading-tight tracking-tight">
                Ask the web anything.
              </h1>
              <p className="mt-3 text-muted-foreground">
                Cited answers, streamed live.{" "}
                {!signedIn && (
                  <span className="text-foreground">Try it free — no sign-in required.</span>
                )}
              </p>
            </div>
            {signedIn === null ? (
              <div className="h-32" />
            ) : signedIn ? (
              <SearchBar autoFocus placeholder="Ask anything…" />
            ) : (
              <SearchBar autoFocus placeholder="Ask anything…" onSubmit={guestSubmit} />
            )}
            <div className="mt-6 flex flex-wrap gap-2 justify-center">
              {EXAMPLES.map((ex) => (
                <ExampleChip key={ex} text={ex} />
              ))}
            </div>
            {!signedIn && signedIn !== null && (
              <p className="mt-8 text-center text-xs text-muted-foreground">
                <Link to="/auth" className="underline hover:text-foreground">Sign in</Link> to save your search history.
              </p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function ExampleChip({ text }: { text: string }) {
  return (
    <a
      href={`/?q=${encodeURIComponent(text)}`}
      onClick={(e) => {
        e.preventDefault();
        const input = document.querySelector<HTMLTextAreaElement>("textarea");
        if (input) {
          input.value = text;
          input.focus();
          input.dispatchEvent(new Event("input", { bubbles: true }));
        }
      }}
      className="text-xs px-3 py-1.5 rounded-full border border-border bg-card hover:border-primary/50 hover:bg-accent/40 text-muted-foreground hover:text-foreground transition-colors"
    >
      {text}
    </a>
  );
}
