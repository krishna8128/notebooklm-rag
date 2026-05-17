"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

type Source = {
  index: number;
  source: string | null;
  page: number | null;
  chunkIndex: number | null;
  preview: string;
};

type RagMeta = {
  originalQuery: string;
  rewrittenQuery: string;
  variants: string[];
  retrieved: number;
  kept: number;
  dropped: number;
};

type Message = {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  rag?: RagMeta;
};

type DocumentInfo = {
  documentId: string;
  fileName: string;
  chunkCount: number;
  pages: number | null;
};

const SUGGESTIONS = [
  "Give me a 5-bullet summary.",
  "What are the key terms used and what do they mean?",
  "What does the document NOT cover?",
];

export default function Home() {
  const [doc, setDoc] = useState<DocumentInfo | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [asking, setAsking] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, asking]);

  async function uploadFile(file: File) {
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

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  }

  async function ask(query: string) {
    if (!query.trim() || !doc || asking) return;
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
        {
          role: "assistant",
          content: data.answer,
          sources: data.sources,
          rag: data.rag,
        },
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
    <main className="min-h-screen text-ink">
      <div className="max-w-5xl mx-auto px-5 py-10">
        {/* Header */}
        <header className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet to-cyan grid place-items-center font-bold text-bg shadow-lg shadow-violet/30">
                N
              </div>
              <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-violet to-cyan blur-md opacity-40 -z-10" />
            </div>
            <div>
              <div className="text-sm font-medium tracking-tight">
                NotebookLM RAG
              </div>
              <div className="text-[11px] text-mute">
                grounded answers · powered by retrieval
              </div>
            </div>
          </div>
          <a
            href="https://github.com/krishna8128/notebooklm-rag"
            target="_blank"
            rel="noreferrer"
            className="text-xs text-mute hover:text-ink border border-line hover:border-lineHi px-3 py-1.5 rounded-lg transition-colors"
          >
            GitHub ↗
          </a>
        </header>

        {!doc ? (
          /* HERO + UPLOAD */
          <div className="space-y-10">
            <section className="text-center max-w-3xl mx-auto pt-6">
              <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-mute border border-line rounded-full px-3 py-1 mb-6 bg-surface">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan animate-pulse" />
                Retrieval-augmented generation
              </div>
              <h1 className="display text-5xl sm:text-6xl leading-[1.05] mb-5">
                Chat with any document.{" "}
                <span className="grad-text italic">Grounded.</span>
              </h1>
              <p className="text-mute text-base max-w-xl mx-auto leading-relaxed">
                Drop in a PDF or text file. We chunk it, embed it, and store the
                vectors. Every answer cites the chunk it came from — never the
                model&apos;s general knowledge.
              </p>
            </section>

            {/* Upload zone */}
            <section className="max-w-2xl mx-auto">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                className={`glass rounded-2xl p-10 text-center transition-all ${
                  dragOver ? "drag-active" : ""
                }`}
              >
                <div className="w-14 h-14 mx-auto mb-5 rounded-2xl bg-gradient-to-br from-violet/30 to-cyan/20 grid place-items-center text-2xl">
                  📄
                </div>
                <div className="display text-2xl mb-2">
                  Drop a file here, or browse
                </div>
                <p className="text-sm text-mute mb-6">
                  PDF, TXT, or Markdown — up to 8 MB
                </p>
                <label className="inline-block">
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
                    onChange={handleFileSelect}
                    className="hidden"
                    disabled={uploading}
                  />
                  <span
                    className={`inline-block bg-gradient-to-r from-violet to-cyan text-bg font-medium px-6 py-2.5 rounded-lg cursor-pointer hover:opacity-90 transition-opacity ${
                      uploading ? "opacity-60 cursor-not-allowed" : ""
                    }`}
                  >
                    {uploading ? "Indexing…" : "Choose a file"}
                  </span>
                </label>
                {uploading && (
                  <div className="mt-6 text-xs text-mute">
                    <span className="inline-block w-2 h-2 rounded-full bg-violet animate-pulse mr-2" />
                    Extracting · chunking · embedding · storing in Qdrant
                  </div>
                )}
                {uploadError && (
                  <p className="mt-4 text-sm text-red-400">{uploadError}</p>
                )}
              </div>

              <div className="grid grid-cols-3 gap-3 mt-5 text-xs text-mute">
                {[
                  ["Chunk", "Recursive · 1000 / 150"],
                  ["Embed", "text-embedding-3-small"],
                  ["Search", "Qdrant · top-4"],
                ].map(([k, v]) => (
                  <div
                    key={k}
                    className="glass rounded-xl px-4 py-3"
                  >
                    <div className="text-[10px] uppercase tracking-wider text-mute/80">
                      {k}
                    </div>
                    <div className="text-ink/90 mt-0.5">{v}</div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        ) : (
          /* CHAT VIEW */
          <div className="space-y-4">
            {/* Document strip */}
            <section className="glass rounded-2xl px-5 py-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="text-base">📄</span>
                <span className="font-medium truncate max-w-xs">
                  {doc.fileName}
                </span>
              </div>
              <span className="text-line">|</span>
              <span className="text-mute">
                <span className="text-ink/85">{doc.chunkCount}</span> chunks
              </span>
              {doc.pages != null && (
                <>
                  <span className="text-line">|</span>
                  <span className="text-mute">
                    <span className="text-ink/85">{doc.pages}</span> pages
                  </span>
                </>
              )}
              <span className="text-line">|</span>
              <span className="text-mute font-mono text-[11px] truncate">
                {doc.documentId}
              </span>
              <button
                onClick={reset}
                className="ml-auto text-xs text-mute hover:text-ink border border-line hover:border-lineHi px-3 py-1 rounded-md transition-colors"
              >
                New document
              </button>
            </section>

            {/* Chat */}
            <section className="glass rounded-2xl flex flex-col min-h-[64vh]">
              <div className="flex-1 px-6 py-6 space-y-6 overflow-y-auto scroll-fade max-h-[68vh]">
                {messages.length === 0 && (
                  <div>
                    <div className="text-sm text-mute mb-3">
                      Try one of these to get started:
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {SUGGESTIONS.map((s) => (
                        <button
                          key={s}
                          onClick={() => ask(s)}
                          className="text-xs bg-surface hover:bg-surfaceHi border border-line hover:border-lineHi rounded-full px-3.5 py-1.5 transition-colors"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {messages.map((m, i) => (
                  <div key={i} className="flex gap-3">
                    <div
                      className={`shrink-0 w-8 h-8 rounded-lg grid place-items-center text-xs font-semibold ${
                        m.role === "user"
                          ? "bg-surfaceHi text-mute border border-line"
                          : "bg-gradient-to-br from-violet to-cyan text-bg"
                      }`}
                    >
                      {m.role === "user" ? "You" : "AI"}
                    </div>
                    <div className="flex-1 min-w-0 space-y-2 pt-0.5">
                      <div
                        className={
                          m.role === "user"
                            ? "text-base text-ink/95"
                            : "text-[15px] text-ink prose-chat"
                        }
                      >
                        {m.role === "user" ? (
                          m.content
                        ) : (
                          <ReactMarkdown>{m.content}</ReactMarkdown>
                        )}
                      </div>
                      {m.role === "assistant" && m.rag && (
                        <RagBadges rag={m.rag} />
                      )}
                      {m.sources && m.sources.length > 0 && (
                        <details className="text-xs">
                          <summary className="cursor-pointer text-violet hover:text-violet/80 select-none">
                            ▸ {m.sources.length} retrieved chunk
                            {m.sources.length === 1 ? "" : "s"}
                          </summary>
                          <ul className="mt-3 space-y-2">
                            {m.sources.map((s) => (
                              <li
                                key={s.index}
                                className="bg-surface border border-line rounded-lg p-3"
                              >
                                <div className="text-mute mb-1.5 flex items-center gap-2">
                                  <span className="font-medium text-ink/80">
                                    Chunk {s.index}
                                  </span>
                                  {s.page != null && (
                                    <span className="text-[10px] bg-surfaceHi border border-line rounded px-1.5 py-0.5">
                                      page {s.page}
                                    </span>
                                  )}
                                  {s.chunkIndex != null && (
                                    <span className="text-[10px] text-mute font-mono">
                                      #{s.chunkIndex}
                                    </span>
                                  )}
                                </div>
                                <div className="text-ink/75 whitespace-pre-wrap leading-relaxed">
                                  {s.preview}
                                </div>
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </div>
                  </div>
                ))}

                {asking && (
                  <div className="flex gap-3">
                    <div className="shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-violet to-cyan grid place-items-center text-xs font-semibold text-bg">
                      AI
                    </div>
                    <div className="flex items-center gap-1.5 text-sm text-mute pt-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-violet animate-pulse" />
                      <span
                        className="w-1.5 h-1.5 rounded-full bg-violet animate-pulse"
                        style={{ animationDelay: "0.2s" }}
                      />
                      <span
                        className="w-1.5 h-1.5 rounded-full bg-violet animate-pulse"
                        style={{ animationDelay: "0.4s" }}
                      />
                      <span className="ml-1.5">searching the document</span>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  ask(input);
                }}
                className="border-t border-line p-3 flex gap-2"
              >
                <div className="ring-glow flex-1 rounded-lg">
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Ask anything about this document…"
                    className="w-full bg-surface border border-line rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-lineHi placeholder:text-mute/60"
                    disabled={asking}
                  />
                </div>
                <button
                  type="submit"
                  disabled={asking || !input.trim()}
                  className="bg-gradient-to-r from-violet to-cyan text-bg font-medium px-5 py-2.5 rounded-lg hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed text-sm transition-opacity"
                >
                  Ask →
                </button>
              </form>
            </section>
          </div>
        )}

        <footer className="text-center text-xs text-mute mt-10 pb-4">
          Built with Next.js · LangChain · OpenAI · Qdrant · CRAG
        </footer>
      </div>
    </main>
  );
}

function RagBadges({ rag }: { rag: RagMeta }) {
  const rewritten =
    rag.rewrittenQuery &&
    rag.originalQuery &&
    rag.rewrittenQuery.trim().toLowerCase() !==
      rag.originalQuery.trim().toLowerCase();

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
      {rewritten && (
        <span
          className="rounded-full bg-violet/15 border border-violet/30 text-violet px-2.5 py-0.5"
          title={`Original: ${rag.originalQuery}`}
        >
          rewritten → &ldquo;{rag.rewrittenQuery}&rdquo;
        </span>
      )}
      {rag.variants?.length > 0 && (
        <span
          className="rounded-full bg-surface border border-line text-mute px-2.5 py-0.5"
          title={rag.variants.join(" · ")}
        >
          +{rag.variants.length} query variants
        </span>
      )}
      {typeof rag.retrieved === "number" && (
        <span className="rounded-full bg-cyan/15 border border-cyan/30 text-cyan px-2.5 py-0.5">
          judge kept {rag.kept}/{rag.retrieved} chunks
        </span>
      )}
    </div>
  );
}
