/**
 * Shared Firestore record lifecycle fields.
 * Use on business records stored in Firestore (not UI-only localStorage prefs).
 */

/** Firestore Timestamp, ISO string, or epoch — app accepts all during reads. */
export type FirestoreTimestamp = unknown;

export interface FirestoreAuditFields {
  createdAt?: FirestoreTimestamp;
  updatedAt?: FirestoreTimestamp;
  createdBy?: string;
  updatedBy?: string;
  ownerId?: string;
}

export interface FirestoreArchiveFields {
  archived?: boolean;
  archivedAt?: FirestoreTimestamp;
  archivedBy?: string;
  archiveReason?: string;
}

/** Optional hard-delete marker for admin-only cleanup — not used in normal UI. */
export interface FirestoreSoftDeleteFields {
  deletedAt?: FirestoreTimestamp;
}

export type FirestoreLifecycleRecord = FirestoreAuditFields & FirestoreArchiveFields & FirestoreSoftDeleteFields;
