import { NextRequest, NextResponse } from "next/server";
import { answerWithContext, retrieve } from "@/lib/rag";

export const runtime = "nodejs";
export const maxDuration = 60;

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

    const chunks = await retrieve(documentId, query);

    if (chunks.length === 0) {
      return NextResponse.json({
        answer:
          "I couldn't find anything in the indexed document for that question.",
        sources: [],
      });
    }

    const answer = await answerWithContext(query, chunks);

    const sources = chunks.map((c, i) => {
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

    return NextResponse.json({ answer, sources });
  } catch (err) {
    console.error("[chat]", err);
    const message = err instanceof Error ? err.message : "Chat failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
