import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NotebookLM RAG — chat with your documents",
  description:
    "A retrieval-augmented document assistant. Upload a PDF or text file, ask grounded questions, and get cited answers — never hallucinated.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap"
        />
      </head>
      <body className="app-bg">{children}</body>
    </html>
  );
}
