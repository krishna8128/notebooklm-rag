# NotebookLM RAG

**Live demo:** <https://notebooklm-rag-ochre.vercel.app>
**Repo:** <https://github.com/krishna8128/notebooklm-rag>

A minimal Google NotebookLM clone with **Corrective RAG (CRAG)**. Upload a PDF
or text file, chat with it, and get answers that are grounded strictly in the
document.

```
upload → extract → chunk → embed → store
                                      ↓
query → rewrite → multi-query retrieve → dedupe → judge → generate
```

Built with **Next.js 16 (App Router)**, **LangChain**, **OpenAI** (embeddings +
chat), and **Qdrant** (vector store).

---

## Architecture

| Stage      | Implementation                                                                 |
| ---------- | ------------------------------------------------------------------------------ |
| Ingestion  | `pdf-parse` for PDFs, raw UTF-8 for `.txt` / `.md`                             |
| Chunking   | `RecursiveCharacterTextSplitter` — `chunkSize=1000`, `chunkOverlap=150`        |
| Embedding  | OpenAI `text-embedding-3-small` (1536 dims)                                    |
| Storage    | Qdrant — one collection per uploaded document (`doc_<id>`) for isolation       |
| Retrieval  | Multi-query (cleaned + 2 variants) · cosine similarity · top-`k=6` each        |
| Correction | Dedupe by content prefix · LLM-as-judge drops `irrelevant` chunks              |
| Generation | OpenAI `gpt-4o-mini`, low temperature, system prompt enforces context-only use |

### Corrective RAG (CRAG)

The retrieval path doesn't just trust the user's query and the vector store:

1. **Query rewriter** — `gpt-4o-mini` cleans typos / abbreviations and
   produces two paraphrase variants that may use vocabulary closer to the
   document's wording. Implemented in [`lib/queryRewriter.ts`](lib/queryRewriter.ts).
2. **Multi-query retrieval** — we retrieve `k=6` chunks for *each* query
   (cleaned + variants) in parallel, then dedupe across them.
3. **LLM-as-judge** — `gpt-4o-mini` grades every surviving chunk as
   `relevant` / `ambiguous` / `irrelevant`. Irrelevant chunks are dropped
   before generation. Implemented in [`lib/judge.ts`](lib/judge.ts).
4. **Corrective fallback** — if every chunk was judged irrelevant, the API
   returns `"I couldn't find that in the document."` instead of asking the LLM
   to hallucinate.
5. **Capped generation** — at most 8 chunks reach the generator, keeping the
   prompt tight even when retrieval is generous.

The UI surfaces small badges under each answer: rewritten query, variant count,
and `kept / total` from the judge — making the CRAG pipeline visible.

### Chunking strategy — why `RecursiveCharacterTextSplitter`?

Splits the text along a hierarchy of natural separators
(`\n\n` → `\n` → `. ` → `? ` → `! ` → ` ` → `""`). Paragraph and sentence
boundaries are preserved when possible, so a chunk rarely cuts a thought in
half. The 150-token overlap stitches adjacent chunks together so a fact that
straddles a boundary still survives retrieval.

`chunkSize=1000` is a balance: small enough that each chunk is semantically
focused (and the embedding stays meaningful), large enough that 4 retrieved
chunks fit comfortably in context with room for the prompt and answer.

### Grounded answer prompt

The system prompt is strict:

- only the retrieved context may be used
- if the answer isn't in the context, the model must say so verbatim
- chunks must be cited inline (`[Chunk N]`, with page number when available)

Combined with `temperature=0.1`, this is what keeps answers from drifting into
the model's general knowledge.

---

## Local development

### Prerequisites

- Node.js 20+
- An OpenAI API key
- A running Qdrant instance — easiest is Docker:
  ```bash
  docker run -p 6333:6333 qdrant/qdrant
  ```

### Setup

```bash
npm install
cp .env.example .env.local
# edit .env.local — set OPENAI_API_KEY (and QDRANT_URL / QDRANT_API_KEY if not local)
npm run dev
```

Open <http://localhost:3000>, upload a document, ask questions.

---

## Deploy to Vercel

The serverless functions need to reach a Qdrant instance from the public
internet, so use [Qdrant Cloud](https://cloud.qdrant.io) (free tier is enough
for evaluation).

1. Create a Qdrant Cloud cluster, copy its URL and API key.
2. Push this repo to GitHub.
3. Import the repo in Vercel, add these environment variables:
   - `OPENAI_API_KEY`
   - `QDRANT_URL` — e.g. `https://xxxxxxxx.eu-central.aws.cloud.qdrant.io:6333`
   - `QDRANT_API_KEY`
4. Deploy.

The upload route runs on the Node.js runtime with a 300s `maxDuration` so larger
PDFs have enough headroom for embedding.

---

## Project layout

```
app/
  page.tsx               Upload + chat UI
  layout.tsx
  globals.css
  api/
    upload/route.ts      POST — extract, chunk, embed, index in Qdrant
    chat/route.ts        POST — retrieve top-k, generate grounded answer
lib/
  rag.ts                 RAG primitives: extract, chunk, index, retrieve, answer
```

---

## API

### `POST /api/upload`

Multipart form upload. `file` field accepts PDF / TXT / MD up to 8 MB.

Returns:

```json
{
  "documentId": "a1b2c3d4e5f60718",
  "fileName": "node-js.pdf",
  "chunkCount": 142,
  "pages": 38,
  "collectionName": "doc_a1b2c3d4e5f60718"
}
```

### `POST /api/chat`

```json
{
  "documentId": "a1b2c3d4e5f60718",
  "query": "How do I debug a Node.js application?"
}
```

Returns the grounded answer along with the chunks that were retrieved:

```json
{
  "answer": "…[Chunk 2 · page 14]…",
  "sources": [
    {
      "index": 1,
      "source": "node-js.pdf",
      "page": 14,
      "chunkIndex": 23,
      "preview": "Use the built-in `--inspect` flag to enable the V8 inspector…"
    }
  ]
}
```
