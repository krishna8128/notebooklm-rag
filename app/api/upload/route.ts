import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import {
  chunkText,
  extractText,
  getQdrantClient,
  indexDocument,
  collectionFor,
} from "@/lib/rag";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

export async function POST(req: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY is not configured on the server." },
        { status: 500 }
      );
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "No file uploaded. Send a PDF or text file in the 'file' field." },
        { status: 400 }
      );
    }
    if (file.size === 0) {
      return NextResponse.json({ error: "File is empty." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `File too large. Limit is ${MAX_BYTES / 1024 / 1024} MB.` },
        { status: 413 }
      );
    }

    const { text, pages } = await extractText(file);
    if (!text.trim()) {
      return NextResponse.json(
        { error: "Couldn't extract any text from this file." },
        { status: 422 }
      );
    }

    const documentId = crypto.randomBytes(8).toString("hex");

    const docs = await chunkText(text, {
      source: file.name,
      documentId,
      uploadedAt: new Date().toISOString(),
      pages: pages ?? null,
    });

    if (docs.length === 0) {
      return NextResponse.json(
        { error: "Document produced no chunks." },
        { status: 422 }
      );
    }

    // Wipe any prior collection with the same id (defensive — randomBytes makes collisions unlikely).
    try {
      const client = getQdrantClient();
      await client.deleteCollection(collectionFor(documentId));
    } catch {
      // ignore — collection didn't exist
    }

    const { collectionName, chunkCount } = await indexDocument(documentId, docs);

    return NextResponse.json({
      documentId,
      fileName: file.name,
      chunkCount,
      pages: pages ?? null,
      collectionName,
    });
  } catch (err) {
    console.error("[upload]", err);
    const message = err instanceof Error ? err.message : "Upload failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
