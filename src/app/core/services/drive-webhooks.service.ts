import { Injectable, inject } from '@angular/core';
import { collection, doc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { auth, db } from '@app/firebase';
import { apiConfig } from '@app/config/api.config';
import { QB_PROJECT_MGMT_SYNC } from '@app/config/qb-project-mgmt-sync.config';
import { ApiClientService } from '@core/services/api/api-client.service';
import { DriveService } from '@core/services/drive.service';
import { QuickBooksSyncSheetsService } from '@core/services/quickbooks-sync-sheets.service';

export const DRIVE_WEBHOOK_TOKEN_KEY = 'brighten.driveWebhookToken';
const DRIVE_WATCH_COLLECTION = 'drive-watch-channels';
const POLL_INTERVAL_MS = 30_000;
const WATCH_RENEW_BEFORE_MS = 24 * 60 * 60 * 1000;

export interface PendingWebhookEvent {
  id: number;
  source: string;
  eventType: string | null;
  payload: unknown;
  status: string;
  receivedAt: string;
  externalId: string | null;
}

interface PendingWebhookEventsResponse {
  ok: boolean;
  count: number;
  events: PendingWebhookEvent[];
}

interface DriveWatchChannelRecord {
  id: string;
  ownerId: string;
  purpose: 'qb-spreadsheet';
  fileId: string;
  channelId: string;
  resourceId: string;
  expiration: number;
  webhookUrl: string;
  updatedAt: string;
}

@Injectable({ providedIn: 'root' })
export class DriveWebhooksService {
  private api = inject(ApiClientService);
  private drive = inject(DriveService);
  private qbSync = inject(QuickBooksSyncSheetsService);

  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private started = false;
  private processing = false;
  private watchRegistrationStarted = false;

  getChannelToken(): string {
    if (typeof localStorage === 'undefined') return '';
    return localStorage.getItem(DRIVE_WEBHOOK_TOKEN_KEY)?.trim() ?? '';
  }

  setChannelToken(token: string): void {
    if (typeof localStorage === 'undefined') return;
    const trimmed = token.trim();
    if (trimmed) {
      localStorage.setItem(DRIVE_WEBHOOK_TOKEN_KEY, trimmed);
    } else {
      localStorage.removeItem(DRIVE_WEBHOOK_TOKEN_KEY);
    }
  }

  webhookBaseUrl(): string {
    return apiConfig.baseUrl.replace(/\/+$/, '');
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    void this.pollPending();
    this.pollTimer = setInterval(() => void this.pollPending(), POLL_INTERVAL_MS);
  }

  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.started = false;
    this.watchRegistrationStarted = false;
  }

  async registerQBSpreadsheetWatch(force = false): Promise<void> {
    if (!auth.currentUser) return;
    if (!this.getChannelToken()) {
      console.warn('[DriveWebhooksService] Set brighten.driveWebhookToken before registering Drive watch');
      return;
    }
    if (this.watchRegistrationStarted && !force) return;

    const existing = await this.loadQBWatchChannel();
    const now = Date.now();
    if (existing && existing.expiration - now > WATCH_RENEW_BEFORE_MS) {
      return;
    }

    this.watchRegistrationStarted = true;
    try {
      const fileId = QB_PROJECT_MGMT_SYNC.spreadsheetId;
      const channelId = existing?.channelId ?? crypto.randomUUID();
      const webhookUrl = `${this.webhookBaseUrl()}/webhooks/drive`;

      if (existing?.channelId && existing.resourceId) {
        try {
          await this.drive.stopWatch(existing.channelId, existing.resourceId);
        } catch {
          // prior channel may already be expired
        }
      }

      const watch = await this.drive.watchFile(
        fileId,
        channelId,
        webhookUrl,
        this.getChannelToken(),
      );

      const record: DriveWatchChannelRecord = {
        id: `qb-spreadsheet-${auth.currentUser.uid}`,
        ownerId: auth.currentUser.uid,
        purpose: 'qb-spreadsheet',
        fileId,
        channelId,
        resourceId: watch.resourceId,
        expiration: Number(watch.expiration),
        webhookUrl,
        updatedAt: new Date().toISOString(),
      };

      await setDoc(doc(db, DRIVE_WATCH_COLLECTION, record.id), record);
      console.info('[DriveWebhooksService] Registered QB spreadsheet Drive watch', {
        channelId,
        expiration: record.expiration,
      });
    } finally {
      this.watchRegistrationStarted = false;
    }
  }

  private async loadQBWatchChannel(): Promise<DriveWatchChannelRecord | null> {
    if (!auth.currentUser) return null;
    const snap = await getDocs(
      query(
        collection(db, DRIVE_WATCH_COLLECTION),
        where('ownerId', '==', auth.currentUser.uid),
        where('purpose', '==', 'qb-spreadsheet'),
      ),
    );
    const row = snap.docs[0]?.data() as DriveWatchChannelRecord | undefined;
    return row ?? null;
  }

  private async pollPending(): Promise<void> {
    if (this.processing || !auth.currentUser) return;
    this.processing = true;
    try {
      const resp = await this.api.get<PendingWebhookEventsResponse>('/api/webhook-events/pending');
      for (const event of resp.events ?? []) {
        await this.handleEvent(event);
        await this.api.post(`/api/webhook-events/${event.id}/processed`, {});
      }
    } catch (err) {
      console.warn('[DriveWebhooksService] Pending webhook poll failed:', err);
    } finally {
      this.processing = false;
    }
  }

  private async handleEvent(event: PendingWebhookEvent): Promise<void> {
    if (event.source === 'quickbooks' || event.source === 'drive') {
      try {
        await this.qbSync.syncFromWorkbook(false);
      } catch (err) {
        console.warn(`[DriveWebhooksService] Sync after ${event.source} webhook failed:`, err);
      }
    }
  }
}
