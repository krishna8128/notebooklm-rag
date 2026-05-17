import { NextRequest, NextResponse } from "next/server";
import { answerWithContext, dedupeChunks, retrieve } from "@/lib/rag";
import { rewriteQuery } from "@/lib/queryRewriter";
import { gradeChunks, type Grade } from "@/lib/judge";

export const runtime = "nodejs";
export const maxDuration = 60;

const PER_QUERY_K = 6;
const MAX_CONTEXT_CHUNKS = 8;

export type RagMeta = {
  originalQuery: string;
  rewrittenQuery: string;
  variants: string[];
  retrieved: number;
  kept: number;
  dropped: number;
  grades: { index: number; grade: Grade }[];
};

export async function POST(req: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY is not configured on the server." },
        { status: 500 }
      );
    }

    const body = (await req.json()) as {
      documentId?: string;
      query?: string;
    };

    const documentId = body.documentId?.trim();
    const query = body.query?.trim();

    if (!documentId) {
      return NextResponse.json(
        { error: "Missing documentId. Upload a file first." },
        { status: 400 }
      );
    }
    if (!query) {
      return NextResponse.json({ error: "Missing query." }, { status: 400 });
    }

    // Step 1: Query rewriting — fix typos / produce paraphrase variants
    const { cleaned, variants } = await rewriteQuery(query);
    const queries = [cleaned, ...variants];

    // Step 2: Multi-query retrieval in parallel
    const chunkArrays = await Promise.all(
      queries.map((q) => retrieve(documentId, q, PER_QUERY_K))
    );

    // Step 3: Dedupe across variants
    const allChunks = dedupeChunks(chunkArrays);

    // Step 4: LLM-as-judge — grade chunks, drop irrelevant
    const { kept, dropped, grades } = await gradeChunks(cleaned, allChunks);

    const rag: RagMeta = {
      originalQuery: query,
      rewrittenQuery: cleaned,
      variants,
      retrieved: allChunks.length,
      kept: kept.length,
      dropped: dropped.length,
      grades,
    };

    // Step 5: Corrective fallback — if nothing survives, refuse early
    if (kept.length === 0) {
      return NextResponse.json({
        answer:
          "I couldn't find that in the document. Try rephrasing or asking about a topic the document actually covers.",
        sources: [],
        rag,
      });
    }

    // Step 6: Cap context and generate the grounded answer
    const contextChunks = kept.slice(0, MAX_CONTEXT_CHUNKS);
    const answer = await answerWithContext(cleaned, contextChunks);

    const sources = contextChunks.map((c, i) => {
      const meta = c.metadata as {
        source?: string;
        loc?: { pageNumber?: number };
        page?: number;
        chunkIndex?: number;
      };
      return {
        index: i + 1,
        source: meta.source ?? null,
        page: meta.loc?.pageNumber ?? meta.page ?? null,
        chunkIndex: meta.chunkIndex ?? null,
        preview:
          c.pageContent.slice(0, 280) +
          (c.pageContent.length > 280 ? "…" : ""),
      };
    });

    return NextResponse.json({ answer, sources, rag });
  } catch (err) {
    console.error("[chat]", err);
    const message = err instanceof Error ? err.message : "Chat failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
