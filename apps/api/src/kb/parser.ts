import { readFileSync } from 'fs';

/**
 * Parse uploaded file and extract text content
 */
export async function parseFile(
  filePath: string,
  mimeType: string
): Promise<string> {
  const fs = await import('fs/promises');
  const content = await fs.readFile(filePath, 'utf-8');
  return content;
}

/**
 * Parse buffer content directly
 */
export async function parseBuffer(
  buffer: Buffer,
  filename: string,
  mimeType: string
): Promise<string> {
  // PDF files - basic text extraction
  if (mimeType === 'application/pdf' || filename.endsWith('.pdf')) {
    return extractPdfText(buffer);
  }

  const text = buffer.toString('utf-8');

  if (mimeType === 'text/markdown' || filename.endsWith('.md')) {
    return text;
  }

  if (mimeType === 'text/plain' || filename.endsWith('.txt')) {
    return text;
  }

  if (mimeType === 'text/html' || filename.endsWith('.html')) {
    return text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  if (mimeType === 'application/json' || filename.endsWith('.json')) {
    try {
      const parsed = JSON.parse(text);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return text;
    }
  }

  return text;
}

/**
 * Basic PDF text extraction - extracts text between BT/ET markers
 * For production, swap with pdf-parse or pdfjs-dist
 */
function extractPdfText(buffer: Buffer): string {
  const str = buffer.toString('latin1');
  const textParts: string[] = [];

  // Extract text from PDF text objects
  const textRegex = /\(([^)]+)\)/g;
  let match;
  while ((match = textRegex.exec(str)) !== null) {
    const part = match[1];
    // Filter out binary garbage - only keep printable ASCII + common unicode
    if (/^[\x20-\x7E\u00A0-\u024F\u2000-\u206F]+$/.test(part)) {
      textParts.push(part);
    }
  }

  if (textParts.length > 0) {
    return textParts.join(' ');
  }

  // Fallback: return raw text (may be partially readable)
  return str.replace(/[^\x20-\x7E\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Chunk text with overlap for embeddings
 */
export function chunkDocument(
  text: string,
  chunkSize: number = 1000,
  overlap: number = 200
): string[] {
  const chunks: string[] = [];
  const paragraphs = text.split(/\n\s*\n/);

  let currentChunk = '';

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();
    if (!trimmed) continue;

    if (currentChunk.length + trimmed.length > chunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());

      const overlapText = currentChunk.slice(-overlap);
      currentChunk = overlapText + '\n\n' + trimmed;
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + trimmed;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}
