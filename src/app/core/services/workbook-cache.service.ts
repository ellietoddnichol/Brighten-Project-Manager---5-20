import { Injectable, inject } from '@angular/core';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '@app/firebase';
import { NormalizedWorkbookData, WorkbookRefreshStatus } from '@app/models/normalized-workbook';

@Injectable({ providedIn: 'root' })
export class WorkbookCacheService {
  private cacheCollection = 'dashboardCache';
  private statusCollection = 'refreshRuns';

  async loadCachedWorkbook(userId: string): Promise<NormalizedWorkbookData | null> {
    try {
      const snap = await getDoc(doc(db, this.cacheCollection, userId));
      if (!snap.exists()) return null;
      const payload = snap.data() as { data?: Record<string, unknown> };
      if (!payload?.data) return null;
      return this.deserializeWorkbook(payload.data);
    } catch {
      return null;
    }
  }

  async saveCachedWorkbook(userId: string, data: NormalizedWorkbookData): Promise<void> {
    await setDoc(doc(db, this.cacheCollection, userId), {
      data: this.serializeWorkbook(data),
      cachedAt: new Date().toISOString(),
      ownerId: userId,
      updatedAt: serverTimestamp(),
    });
  }

  async saveRefreshStatus(userId: string, status: WorkbookRefreshStatus): Promise<void> {
    await setDoc(
      doc(db, this.statusCollection, userId),
      {
        ...status,
        ownerId: userId,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  }

  async loadRefreshStatus(userId: string): Promise<WorkbookRefreshStatus | null> {
    try {
      const snap = await getDoc(doc(db, this.statusCollection, userId));
      return snap.exists() ? (snap.data() as WorkbookRefreshStatus) : null;
    } catch {
      return null;
    }
  }

  currentUserId(): string | null {
    return auth.currentUser?.uid ?? null;
  }

  private serializeWorkbook(data: NormalizedWorkbookData): Record<string, unknown> {
    return {
      ...data,
      fetchedAt: data.fetchedAt.toISOString(),
      projects: data.projects.map(p => ({
        ...p,
        updatedAt: p.updatedAt?.toISOString(),
      })),
    };
  }

  private deserializeWorkbook(raw: Record<string, unknown>): NormalizedWorkbookData {
    const data = raw as unknown as NormalizedWorkbookData & { fetchedAt: string };
    return {
      ...data,
      fetchedAt: new Date(String(data.fetchedAt)),
      projects: (data.projects ?? []).map(p => ({
        ...p,
        updatedAt: p.updatedAt ? new Date(String(p.updatedAt)) : undefined,
      })),
    };
  }
}
