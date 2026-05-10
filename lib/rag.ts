import { OpenAIEmbeddings } from "@langchain/openai";
import { QdrantVectorStore } from "@langchain/qdrant";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { Document } from "@langchain/core/documents";
import { QdrantClient } from "@qdrant/js-client-rest";
import OpenAI from "openai";
import pdfParse from "pdf-parse";

/*
 * RAG configuration.
 *
 * Chunking strategy: RecursiveCharacterTextSplitter with chunkSize=1000 and
 * chunkOverlap=150. Splits along paragraph → line → sentence → word boundaries
 * so semantically-related text stays together. Overlap preserves continuity
 * across chunk boundaries so retrieved spans don't lose surrounding context.
 *
 * Embeddings: OpenAI text-embedding-3-small (1536 dims, fast + cheap).
 *
 * Vector store: Qdrant. Each uploaded document gets its own collection keyed
 * by documentId so different uploads stay isolated.
 */

const EMBEDDING_MODEL = "text-embedding-3-small";
const CHAT_MODEL = "gpt-4o-mini";
const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 150;
const TOP_K = 4;

export const QDRANT_URL = process.env.QDRANT_URL ?? "http://localhost:6333";
export const QDRANT_API_KEY = process.env.QDRANT_API_KEY;

export function collectionFor(documentId: string) {
  return `doc_${documentId}`;
}

export function getEmbeddings() {
  return new OpenAIEmbeddings({ model: EMBEDDING_MODEL });
}

function qdrantClientArgs() {
  return QDRANT_API_KEY
    ? { url: QDRANT_URL, apiKey: QDRANT_API_KEY }
    : { url: QDRANT_URL };
}

export function getQdrantClient() {
  return new QdrantClient(qdrantClientArgs());
}

export async function extractText(
  file: File
): Promise<{ text: string; pages?: number }> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const name = file.name.toLowerCase();

  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    const parsed = await pdfParse(buffer);
    return { text: parsed.text, pages: parsed.numpages };
  }

  if (name.endsWith(".txt") || name.endsWith(".md") || file.type.startsWith("text/")) {
    return { text: buffer.toString("utf8") };
  }

  throw new Error(
    `Unsupported file type: ${file.type || file.name}. Upload a PDF or text file.`
  );
}

export async function chunkText(
  text: string,
  metadata: Record<string, unknown>
): Promise<Document[]> {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: CHUNK_SIZE,
    chunkOverlap: CHUNK_OVERLAP,
    separators: ["\n\n", "\n", ". ", "? ", "! ", " ", ""],
  });
  const docs = await splitter.createDocuments([text], [metadata]);
  return docs.map(
    (d, i) =>
      new Document({
        pageContent: d.pageContent,
        metadata: { ...d.metadata, chunkIndex: i },
      })
  );
}

export async function indexDocument(
  documentId: string,
  docs: Document[]
): Promise<{ collectionName: string; chunkCount: number }> {
  const collectionName = collectionFor(documentId);
  const embeddings = getEmbeddings();

  await QdrantVectorStore.fromDocuments(docs, embeddings, {
    ...qdrantClientArgs(),
    collectionName,
  });

  return { collectionName, chunkCount: docs.length };
}

export async function retrieve(documentId: string, query: string) {
  const embeddings = getEmbeddings();
  const store = await QdrantVectorStore.fromExistingCollection(embeddings, {
    ...qdrantClientArgs(),
    collectionName: collectionFor(documentId),
  });
  return store.similaritySearch(query, TOP_K);
}

export async function answerWithContext(
  query: string,
  contextDocs: Document[]
): Promise<string> {
  const client = new OpenAI();

  const contextText = contextDocs
    .map((d, i) => {
      const page =
        (d.metadata as { loc?: { pageNumber?: number }; page?: number })?.loc
          ?.pageNumber ??
        (d.metadata as { page?: number })?.page ??
        null;
      const header = page ? `[Chunk ${i + 1} · page ${page}]` : `[Chunk ${i + 1}]`;
      return `${header}\n${d.pageContent}`;
    })
    .join("\n\n---\n\n");

  const systemPrompt = `You are a careful assistant answering questions about a single user-uploaded document.

Strict rules:
- Use ONLY the context below. Do not use outside knowledge.
- If the answer is not in the context, reply exactly: "I couldn't find that in the document."
- Cite the chunks you used inline as [Chunk N] (and page if shown).
- Keep answers concise and grounded; quote short phrases when helpful.

Context:
${contextText}`;

  const response = await client.chat.completions.create({
    model: CHAT_MODEL,
    temperature: 0.1,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: query },
    ],
  });

  return response.choices[0]?.message?.content ?? "";
}
