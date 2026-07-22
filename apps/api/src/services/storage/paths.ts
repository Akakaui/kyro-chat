// ---------------------------------------------------------------------------
// Path Helpers for File Storage
//
// Defines how files are organized within the storage backend:
//   uploads/{userId}/{uuid}.{ext}           – User uploads
//   avatars/{userId}.{ext}                   – Profile avatars
//   attachments/{conversationId}/{uuid}.{ext} – Chat attachments
//   exports/{uuid}.{ext}                     – Export files
//   temp/{uuid}.{ext}                        – Temp files (auto-cleanup)
// ---------------------------------------------------------------------------

import * as crypto from 'node:crypto';
import * as path from 'node:path';

function generateUUID(): string {
  return crypto.randomUUID();
}

function getExtension(filename: string): string {
  const ext = path.extname(filename);
  if (!ext) return '';
  return ext.toLowerCase();
}

export const Paths = {
  /** Path for a user-uploaded file. */
  upload(userId: string, filename: string): string {
    const uuid = generateUUID();
    const ext = getExtension(filename);
    return `uploads/${userId}/${uuid}${ext}`;
  },

  /** Path for a user avatar (overwrites on re-upload). */
  avatar(userId: string, filename: string): string {
    const ext = getExtension(filename) || '.jpg';
    return `avatars/${userId}${ext}`;
  },

  /** Path for a conversation attachment. */
  attachment(conversationId: string, filename: string): string {
    const uuid = generateUUID();
    const ext = getExtension(filename);
    return `attachments/${conversationId}/${uuid}${ext}`;
  },

  /** Path for an exported file. */
  exportFile(filename: string): string {
    const uuid = generateUUID();
    const ext = getExtension(filename) || '.json';
    return `exports/${uuid}${ext}`;
  },

  /** Path for a temporary file. */
  temp(filename: string): string {
    const uuid = generateUUID();
    const ext = getExtension(filename);
    return `temp/${uuid}${ext}`;
  },

  /** Prefix for all files belonging to a user. */
  userPrefix(userId: string): string {
    return `uploads/${userId}/`;
  },

  /** Prefix for all files in a conversation. */
  conversationPrefix(conversationId: string): string {
    return `attachments/${conversationId}/`;
  },
};
