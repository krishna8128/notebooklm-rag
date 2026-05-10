"use client";

import { useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

type Source = {
  index: number;
  source: string | null;
  page: number | null;
  chunkIndex: number | null;
  preview: string;
};

type Message = {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
};

type DocumentInfo = {
  documentId: string;
  fileName: string;
  chunkCount: number;
  pages: number | null;
};

export default function Home() {
  const [doc, setDoc] = useState<DocumentInfo | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [asking, setAsking] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadError(null);
    setMessages([]);
    setDoc(null);

    const fd = new FormData();
    fd.append("file", file);

    try {
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      setDoc(data);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleAsk(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const query = input.trim();
    if (!query || !doc || asking) return;

    const userMsg: Message = { role: "user", content: query };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setAsking(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: doc.documentId, query }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Chat failed");
      setMessages((m) => [
        ...m,
        { role: "assistant", content: data.answer, sources: data.sources },
      ]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content:
            "Error: " + (err instanceof Error ? err.message : "request failed"),
        },
      ]);
    } finally {
      setAsking(false);
    }
  }

  function reset() {
    setDoc(null);
    setMessages([]);
    setUploadError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <main className="min-h-screen flex flex-col">
      <header className="border-b border-line bg-panel">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">NotebookLM RAG</h1>
            <p className="text-xs text-zinc-400">
              Upload a document, ask grounded questions about it.
            </p>
          </div>
          {doc && (
            <button
              onClick={reset}
              className="text-xs text-zinc-400 hover:text-zinc-200 border border-line px-3 py-1.5 rounded-md"
            >
              New document
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 max-w-5xl w-full mx-auto px-6 py-6 grid gap-6">
        {!doc && (
          <section className="border border-line rounded-xl bg-panel p-8">
            <h2 className="text-base font-medium mb-1">Upload a document</h2>
            <p className="text-sm text-zinc-400 mb-5">
              PDF or plain text (.txt, .md). Up to 8 MB.
            </p>
            <form
              onSubmit={handleUpload}
              className="flex flex-col sm:flex-row gap-3"
            >
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
                required
                className="block w-full text-sm text-zinc-300 file:mr-3 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-accent/20 file:text-accent file:font-medium hover:file:bg-accent/30"
              />
              <button
                type="submit"
                disabled={uploading}
                className="bg-accent text-ink font-medium px-5 py-2 rounded-md hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploading ? "Indexing…" : "Upload & index"}
              </button>
            </form>
            {uploadError && (
              <p className="mt-3 text-sm text-red-400">{uploadError}</p>
            )}
            <div className="mt-6 text-xs text-zinc-500 space-y-1">
              <p>
                <span className="text-zinc-400">Pipeline:</span> extract → chunk
                (recursive splitter, 1000 / 150) → embed
                (text-embedding-3-small) → store in Qdrant.
              </p>
              <p>
                <span className="text-zinc-400">Chat:</span> top-4 similarity
                retrieval, answers generated by gpt-4o-mini constrained to the
                retrieved context.
              </p>
            </div>
          </section>
        )}

        {doc && (
          <>
            <section className="border border-line rounded-xl bg-panel px-5 py-3 text-sm flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="text-zinc-300 font-medium truncate max-w-[60%]">
                {doc.fileName}
              </span>
              <span className="text-zinc-500">·</span>
              <span className="text-zinc-400">{doc.chunkCount} chunks</span>
              {doc.pages != null && (
                <>
                  <span className="text-zinc-500">·</span>
                  <span className="text-zinc-400">{doc.pages} pages</span>
                </>
              )}
              <span className="text-zinc-500">·</span>
              <span className="text-zinc-500 text-xs font-mono">
                {doc.documentId}
              </span>
            </section>

            <section className="border border-line rounded-xl bg-panel flex flex-col min-h-[60vh]">
              <div className="flex-1 p-5 space-y-5 overflow-y-auto">
                {messages.length === 0 && (
                  <div className="text-sm text-zinc-500">
                    Ask a question about this document.
                  </div>
                )}
                {messages.map((m, i) => (
                  <div key={i} className="space-y-2">
                    <div
                      className={
                        m.role === "user"
                          ? "text-sm text-zinc-300"
                          : "text-sm text-zinc-100"
                      }
                    >
                      <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                        {m.role === "user" ? "You" : "Assistant"}
                      </div>
                      <div className="prose-chat">
                        <ReactMarkdown>{m.content}</ReactMarkdown>
                      </div>
                    </div>
                    {m.sources && m.sources.length > 0 && (
                      <details className="text-xs">
                        <summary className="cursor-pointer text-zinc-500 hover:text-zinc-300">
                          {m.sources.length} retrieved chunk
                          {m.sources.length === 1 ? "" : "s"}
                        </summary>
                        <ul className="mt-2 space-y-2">
                          {m.sources.map((s) => (
                            <li
                              key={s.index}
                              className="border border-line rounded-md p-2 bg-ink"
                            >
                              <div className="text-zinc-500 mb-1">
                                Chunk {s.index}
                                {s.page != null && ` · page ${s.page}`}
                              </div>
                              <div className="text-zinc-300 whitespace-pre-wrap">
                                {s.preview}
                              </div>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>
                ))}
                {asking && (
                  <div className="text-sm text-zinc-500">Thinking…</div>
                )}
              </div>

              <form
                onSubmit={handleAsk}
                className="border-t border-line p-3 flex gap-2"
              >
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask a question about the document…"
                  className="flex-1 bg-ink border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent"
                  disabled={asking}
                />
                <button
                  type="submit"
                  disabled={asking || !input.trim()}
                  className="bg-accent text-ink font-medium px-4 py-2 rounded-md hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  Ask
                </button>
              </form>
            </section>
          </>
        )}
      </div>

      <footer className="text-center text-xs text-zinc-600 py-6">
        Built with Next.js, LangChain, OpenAI, and Qdrant.
      </footer>
    </main>
  );
}
