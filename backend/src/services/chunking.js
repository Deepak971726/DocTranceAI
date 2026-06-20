import { log, logProcessFinished, logProcessStarted } from "../logger.js";

function chooseBoundary(text, start, preferredEnd) {
  if (preferredEnd >= text.length) {
    return text.length;
  }
  const minimum = start + Math.floor((preferredEnd - start) * 0.55);
  for (const separator of ["\n\n", "\n", ". ", " "]) {
    const candidate = text.lastIndexOf(separator, preferredEnd);
    if (candidate >= minimum) {
      return candidate + separator.length;
    }
  }
  return preferredEnd;
}

export class DocumentChunker {
  constructor(chunkSize = 800, chunkOverlap = 150) {
    if (chunkOverlap >= chunkSize) {
      throw new Error("chunkOverlap must be smaller than chunkSize");
    }
    this.chunkSize = chunkSize;
    this.chunkOverlap = chunkOverlap;
  }

  split(sections) {
    logProcessStarted("Split document into chunks", {
      sections: sections.length,
      chunk_size: this.chunkSize,
      chunk_overlap: this.chunkOverlap,
    });
    const chunks = [];
    for (const section of sections) {
      const text = section.text.trim();
      let start = 0;
      while (start < text.length) {
        const end = chooseBoundary(text, start, Math.min(text.length, start + this.chunkSize));
        const chunkText = text.slice(start, end).trim();
        if (chunkText) {
          const chunk = {
            chunkIndex: chunks.length,
            pageNumber: section.pageNumber ?? null,
            chunkText,
            tokenCount: Math.max(1, Math.floor(chunkText.length / 4)),
            chunkMetadata: section.metadata ?? {},
          };
          chunks.push(chunk);
          log("info", "document_chunk_created", {
            message: "Document chunk created.",
            chunk_index: chunk.chunkIndex,
            page_number: chunk.pageNumber,
            chars: chunk.chunkText.length,
            estimated_tokens: chunk.tokenCount,
            metadata: chunk.chunkMetadata,
            preview: chunk.chunkText,
          });
        }
        if (end >= text.length) {
          break;
        }
        const nextStart = Math.max(start + 1, end - this.chunkOverlap);
        start = nextStart;
      }
    }
    logProcessFinished("Split document into chunks", { chunks: chunks.length });
    return chunks;
  }
}
