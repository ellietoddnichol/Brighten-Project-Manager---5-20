import { Injectable } from '@angular/core';
import { v4 as uuidv4 } from 'uuid';
import { auth, db } from '../firebase';
import {
  collection,
  doc,
  getDocs,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import { ImportRunSummary } from '../models/import.types';

const RUNS_KEY = 'brighten.importRuns';

/**
 * Sync/import run history — Firestore target with localStorage fallback.
 * TODO: remove localStorage once all clients read from Firestore.
 */
@Injectable({ providedIn: 'root' })
export class SyncRunsRepository {
  load(): ImportRunSummary[] {
    return this.loadLocal();
  }

  async hydrateFromFirestore(): Promise<ImportRunSummary[]> {
    const uid = auth.currentUser?.uid;
    if (!uid) return this.loadLocal();

    try {
      const snap = await getDocs(
        query(collection(db, 'sync-runs'), where('ownerId', '==', uid)),
      );
      if (snap.empty) return this.loadLocal();

      const remote = snap.docs.map(d => ({ id: d.id, ...d.data() } as ImportRunSummary));
      const merged = this.mergeRuns(this.loadLocal(), remote);
      this.saveLocal(merged);
      return merged;
    } catch (err) {
      console.warn('[SyncRuns] Firestore hydrate failed, using localStorage', err);
      return this.loadLocal();
    }
  }

  persist(list: ImportRunSummary[]): void {
    const trimmed = list.slice(0, 50);
    this.saveLocal(trimmed);
    void this.persistFirestore(trimmed);
  }

  private async persistFirestore(list: ImportRunSummary[]): Promise<void> {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    try {
      const col = collection(db, 'sync-runs');
      for (const run of list) {
        const id = run.id || uuidv4();
        await setDoc(doc(col, id), { ...run, id, ownerId: uid }, { merge: true });
      }
    } catch (err) {
      console.warn('[SyncRuns] Firestore persist failed, localStorage retained', err);
    }
  }

  private loadLocal(): ImportRunSummary[] {
    try {
      const raw = localStorage.getItem(RUNS_KEY);
      return raw ? JSON.parse(raw) as ImportRunSummary[] : [];
    } catch {
      return [];
    }
  }

  private saveLocal(list: ImportRunSummary[]): void {
    localStorage.setItem(RUNS_KEY, JSON.stringify(list));
  }

  private mergeRuns(local: ImportRunSummary[], remote: ImportRunSummary[]): ImportRunSummary[] {
    const map = new Map<string, ImportRunSummary>();
    for (const r of [...remote, ...local]) map.set(r.id, r);
    return [...map.values()]
      .sort((a, b) => (b.importedAt ?? '').localeCompare(a.importedAt ?? ''))
      .slice(0, 50);
  }
}
