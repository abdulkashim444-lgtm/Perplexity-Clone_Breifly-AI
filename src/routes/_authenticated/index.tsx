import { createFileRoute } from "@tanstack/react-router";
import { Sidebar } from "@/components/sidebar";
import { SearchBar } from "@/components/search-bar";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Searchly — AI answer engine" },
      { name: "description", content: "Ask anything. Searchly reads the live web and streams cited answers." },
      { property: "og:title", content: "Searchly — AI answer engine" },
      { property: "og:description", content: "Ask anything. Searchly reads the live web and streams cited answers." },
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
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-2xl -mt-12">
          <div className="text-center mb-8">
            <h1 className="font-serif text-5xl leading-tight tracking-tight">
              Ask the web anything.
            </h1>
            <p className="mt-3 text-muted-foreground">
              Six agents plan, search, read, rank, write, and follow up — with citations.
            </p>
          </div>
          <SearchBar autoFocus placeholder="Ask anything…" />
          <div className="mt-6 flex flex-wrap gap-2 justify-center">
            {EXAMPLES.map((ex) => (
              <ExampleChip key={ex} text={ex} />
            ))}
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
