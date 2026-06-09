import { Injectable } from '@angular/core';
import { v4 as uuidv4 } from 'uuid';
import { auth, db } from '@app/firebase';
import {
  collection,
  doc,
  getDocs,
  query,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { ImportException } from '@app/models/import.types';

const STORAGE_KEY = 'brighten.importExceptions';

/**
 * Import review exceptions — Firestore primary store, localStorage fallback for offline/unauthenticated reads.
 * Dual-write keeps the two in sync; Firestore wins on conflict during hydration.
 */
@Injectable({ providedIn: 'root' })
export class SourceReviewRepository {
  load(): ImportException[] {
    const local = this.loadLocal();
    return local;
  }

  async hydrateFromFirestore(): Promise<ImportException[]> {
    const uid = auth.currentUser?.uid;
    if (!uid) return this.loadLocal();

    try {
      const snap = await getDocs(
        query(collection(db, 'import-exceptions'), where('ownerId', '==', uid)),
      );
      if (snap.empty) return this.loadLocal();

      const remote = snap.docs.map(d => ({ id: d.id, ...d.data() } as ImportException));
      const merged = this.mergeByKey(this.loadLocal(), remote);
      this.saveLocal(merged);
      return merged;
    } catch (err) {
      console.warn('[SourceReview] Firestore hydrate failed, using localStorage', err);
      return this.loadLocal();
    }
  }

  persist(list: ImportException[]): void {
    this.saveLocal(list);
    void this.persistFirestore(list);
  }

  private async persistFirestore(list: ImportException[]): Promise<void> {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    try {
      const batch = writeBatch(db);
      const col = collection(db, 'import-exceptions');
      for (const row of list.slice(0, 200)) {
        const id = row.id || uuidv4();
        batch.set(doc(col, id), { ...row, id, ownerId: uid }, { merge: true });
      }
      await batch.commit();
    } catch (err) {
      console.warn('[SourceReview] Firestore persist failed, localStorage retained', err);
    }
  }

  private loadLocal(): ImportException[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) as ImportException[] : [];
    } catch {
      return [];
    }
  }

  private saveLocal(list: ImportException[]): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  }

  private mergeByKey(local: ImportException[], remote: ImportException[]): ImportException[] {
    const map = new Map<string, ImportException>();
    const key = (e: ImportException) => `${e.type}|${e.jobNumber}|${e.vendorName}|${e.message}`;
    for (const e of remote) map.set(key(e), e);
    for (const e of local) map.set(key(e), e);
    return [...map.values()];
  }
}
