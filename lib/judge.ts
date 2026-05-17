import OpenAI from "openai";
import { Document } from "@langchain/core/documents";

const SYSTEM = `You are a relevance judge for a document Q&A system.

Given the user's question and a list of numbered chunks retrieved from a document, decide for each chunk whether it could help answer the question.

Grade each chunk as exactly one of:
- "relevant"   — directly answers or strongly supports answering the question
- "ambiguous"  — tangentially related; could provide useful context
- "irrelevant" — off-topic; does not help answer the question

Be strict: prefer "irrelevant" over "ambiguous" when a chunk clearly does not address the question.

Respond ONLY with valid JSON in this exact shape:
{"grades": [{"id": 1, "grade": "relevant"}, {"id": 2, "grade": "irrelevant"}]}

Include an entry for every chunk id. No other commentary.`;

export type Grade = "relevant" | "ambiguous" | "irrelevant";

export type JudgeResult = {
  kept: Document[];
  dropped: Document[];
  grades: { index: number; grade: Grade }[];
};

function buildUserPrompt(question: string, chunks: Document[]): string {
  const list = chunks
    .map((c, i) => {
      const meta = c.metadata as {
        loc?: { pageNumber?: number };
        page?: number;
      };
      const page = meta?.loc?.pageNumber ?? meta?.page ?? "?";
      const text = (c.pageContent || "").slice(0, 500).replace(/\s+/g, " ").trim();
      return `[Chunk ${i + 1} | page ${page}]\n${text}`;
    })
    .join("\n\n");
  return `Question:\n${question}\n\nChunks:\n${list}`;
}

export async function gradeChunks(
  question: string,
  chunks: Document[]
): Promise<JudgeResult> {
  if (chunks.length === 0) {
    return { kept: [], dropped: [], grades: [] };
  }

  try {
    const client = new OpenAI();
    const res = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: buildUserPrompt(question, chunks) },
      ],
      temperature: 0,
      response_format: { type: "json_object" },
    });

    const raw = res.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(raw) as { grades?: unknown };
    const gradesArr = Array.isArray(parsed.grades) ? (parsed.grades as unknown[]) : [];

    const gradeById = new Map<number, Grade>();
    for (const g of gradesArr) {
      if (!g || typeof g !== "object") continue;
      const obj = g as { id?: unknown; grade?: unknown };
      const idNum =
        typeof obj.id === "number"
          ? obj.id
          : typeof obj.id === "string"
            ? parseInt(obj.id, 10)
            : NaN;
      const gradeStr =
        typeof obj.grade === "string"
          ? (obj.grade.toLowerCase() as Grade)
          : "ambiguous";
      if (Number.isFinite(idNum)) {
        const valid: Grade =
          gradeStr === "relevant" || gradeStr === "ambiguous" || gradeStr === "irrelevant"
            ? gradeStr
            : "ambiguous";
        gradeById.set(idNum, valid);
      }
    }

    const kept: Document[] = [];
    const dropped: Document[] = [];
    const grades: { index: number; grade: Grade }[] = [];

    chunks.forEach((c, i) => {
      const grade = gradeById.get(i + 1) ?? "ambiguous";
      grades.push({ index: i, grade });
      if (grade === "irrelevant") {
        dropped.push(c);
      } else {
        kept.push(c);
      }
    });

    return { kept, dropped, grades };
  } catch (err) {
    console.warn(
      "[judge] failed, keeping all chunks:",
      err instanceof Error ? err.message : err
    );
    return {
      kept: chunks,
      dropped: [],
      grades: chunks.map((_, i) => ({ index: i, grade: "ambiguous" as Grade })),
    };
  }
}
