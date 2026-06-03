import { Injectable } from '@angular/core';
import { v4 as uuidv4 } from 'uuid';
import { auth, db } from '@app/firebase';
import { collection, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { ActivityEvent, RecordActivityEventInput } from '@app/models/activity-event.types';

@Injectable({ providedIn: 'root' })
export class ActivityEventsService {
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
