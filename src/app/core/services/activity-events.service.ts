import { Injectable, NgZone, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import { auth, db } from '@app/firebase';
import { collection, doc, onSnapshot, query, setDoc, serverTimestamp, where } from 'firebase/firestore';
import { ActivityEvent, RecordActivityEventInput } from '@app/models/activity-event.types';

function eventTimestamp(event: ActivityEvent): number {
  const raw = event.createdAt;
  if (!raw) return 0;
  if (typeof raw === 'object' && raw !== null && 'seconds' in raw) {
    return Number((raw as { seconds: number }).seconds) * 1000;
  }
  const ms = new Date(String(raw)).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

@Injectable({ providedIn: 'root' })
export class ActivityEventsService {
  private ngZone = inject(NgZone);

  /** Live activity events for a project (newest first). */
  getProjectEvents(projectId: string): Observable<ActivityEvent[]> {
    return new Observable(subscriber => {
      const uid = auth.currentUser?.uid;
      if (!uid || !projectId) {
        subscriber.next([]);
        return;
      }

      const q = query(collection(db, 'activity-events'), where('ownerId', '==', uid));
      const unsub = onSnapshot(
        q,
        snapshot => {
          this.ngZone.run(() => {
            const events = snapshot.docs
              .map(d => ({ id: d.id, ...d.data() } as ActivityEvent))
              .filter(e => e.projectId === projectId)
              .sort((a, b) => eventTimestamp(b) - eventTimestamp(a));
            subscriber.next(events);
          });
        },
        err => {
          console.warn('[ActivityEvents] Failed to load project events', err);
          subscriber.next([]);
        },
      );

      return () => unsub();
    });
  }
  /**
   * Append-only audit log. Failures are logged but never block the caller workflow.
   */
  async recordEvent(input: RecordActivityEventInput): Promise<void> {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const id = uuidv4();
    const actor = auth.currentUser?.email ?? uid;
    const event: ActivityEvent = {
      id,
      ownerId: uid,
      projectId: input.projectId,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      title: input.title,
      description: input.description,
      before: input.before,
      after: input.after,
      source: input.source ?? 'app',
      createdAt: serverTimestamp(),
      createdBy: actor,
    };

    try {
      await setDoc(doc(collection(db, 'activity-events'), id), event);
    } catch (err) {
      console.warn('[ActivityEvents] Failed to record event', input.action, err);
    }
  }
}
