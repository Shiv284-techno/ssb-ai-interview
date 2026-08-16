/**
 * A friendly check performed in the browser before an upload is attempted.
 *
 * This is a courtesy, not a control. It exists so a candidate who picks the
 * wrong file gets an answer immediately instead of after a round trip. The
 * authoritative checks — content type, size, the `%PDF-` signature, and whether
 * the document can actually be read — all live in `/api/profile/piq` and are
 * repeated there regardless of what this function decided. Nothing here may be
 * relied on for safety: it runs on the candidate's machine, where it can be
 * skipped entirely.
 *
 * Kept free of React and of `server-only` so it is testable on its own.
 */

/** Mirrors the server's limit so the message matches what the server enforces. */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export type UploadCheckResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string };

interface FileLike {
  readonly name: string;
  readonly size: number;
  readonly type: string;
}

export function checkSelectedFile(file: FileLike | null): UploadCheckResult {
  if (!file) {
    return { ok: false, message: "Choose your PIQ as a PDF file." };
  }

  const looksLikePdf =
    file.type === "application/pdf" || /\.pdf$/i.test(file.name.trim());

  if (!looksLikePdf) {
    return {
      ok: false,
      message: "That file is not a PDF. Choose your PIQ as a PDF.",
    };
  }

  if (file.size === 0) {
    return { ok: false, message: "That file is empty. Choose another copy." };
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      message: "That file is larger than 8 MB. Choose a smaller copy.",
    };
  }

  return { ok: true };
}

/** "1.4 MB" — for showing the candidate what they picked. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
