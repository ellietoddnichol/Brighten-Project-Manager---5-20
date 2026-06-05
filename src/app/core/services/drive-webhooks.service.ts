import {
  Injectable,
  inject,
  signal,
  OnDestroy,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  collection,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  query,
  where,
  getDocs,
  serverTimestamp,
  Firestore,
} from '@angular/fire/firestore';
import { DriveService, DriveChange, DriveWatchChannel } from '@core/services/drive.service';
import { AuthService } from '@core/services/auth.service';
import { QuickBooksSyncSheetsService } from '@core/services/quickbooks-sync-sheets.service';
import { ProjectFilesRepository } from '@core/services/project-files.repository';
import { DataService } from '@core/services/data.service';
import { apiConfig } from '@app/config/api.config';
import { QB_PROJECT_MGMT_SYNC } from '@app/config/qb-project-mgmt-sync.config';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DriveWatchChannelRecord {
  id: string;                     // channelId (UUID)
  resourceId: string;             // Drive resource ID echoed in notifications
  resourceType: 'file' | 'changes';
  watchedFileId?: string;         // Drive file ID (for files.watch channels)
  projectId?: string;             // Linked project (for folder watches)
  folderId?: string;              // Drive folder being watched
  label: string;                  // Human-readable (e.g. "QB Spreadsheet", "J208 Project Folder")
  webhookUrl: string;
  expiresAt: number;              // epoch ms
  pageToken?: string;             // Current changes page token (for changes.watch channels)
  ownerId: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface WebhookEvent {
  id: string;
  source: 'quickbooks' | 'drive';
  event_type: string | null;
  resource_id: string | null;
  channel_id: string | null;
  realm_id: string | null;
  payload: unknown;
  received_at: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHANNELS_COLLECTION = 'drive-watch-channels';
const POLL_INTERVAL_MS = 30_000;           // poll /api/webhook-events/pending every 30s
const RENEW_BEFORE_EXPIRY_MS = 24 * 60 * 60 * 1000; // renew channels 24h before expiry

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * DriveWebhooksService manages two kinds of Google Drive push notification
 * channels and processes incoming webhook events from the backend API.
 *
 * 1. FILE WATCH — on the QuickBooks export spreadsheet.
 *    When QB updates the sheet, Drive notifies the API, which stores a
 *    "quickbooks" webhook event. This service polls for that event and
 *    triggers QuickBooksSyncSheetsService.syncFromWorkbook().
 *
 * 2. CHANGES WATCH — on the Drive changes feed.
 *    When a file is added/modified in a watched project folder, Drive
 *    notifies the API. This service polls for that event, fetches the
 *    changed files, and creates/updates project-files records.
 *
 * Architecture:
 *   Drive → POST /webhooks/drive → API stores event in MySQL webhook_events
 *   Angular polls GET /api/webhook-events/pending → processes → marks done
 *
 * Channel metadata (channel ID, resource ID, expiry, page token) is stored
 * in Firestore `drive-watch-channels` so it survives page reloads and
 * can be renewed before expiry.
 */
@Injectable({ providedIn: 'root' })
export class DriveWebhooksService implements OnDestroy {
  private drive = inject(DriveService);
  private auth = inject(AuthService);
  private qbSync = inject(QuickBooksSyncSheetsService);
  private projectFilesRepo = inject(ProjectFilesRepository);
  private dataService = inject(DataService);
  private firestore = inject(Firestore);

  // Publicly readable status signals
  readonly qbWatchActive = signal(false);
  readonly processingEvent = signal(false);
  readonly lastProcessedAt = signal<Date | null>(null);
  readonly lastError = signal<string | null>(null);

  private pollTimer: ReturnType<typeof setInterval> | null = null;

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  ngOnDestroy(): void {
    this.stopPolling();
  }

  /**
   * Call once after the user is signed in (from app.ts or a feature guard).
   * Starts polling for pending webhook events and schedules channel renewal.
   */
  start(): void {
    this.stopPolling();
    this.pollTimer = setInterval(() => void this.processPendingEvents(), POLL_INTERVAL_MS);
    // Immediate first run
    void this.processPendingEvents();
    void this.renewExpiringChannels();
  }

  stopPolling(): void {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Channel registration
  // ---------------------------------------------------------------------------

  /**
   * Register a Drive push notification channel on the QuickBooks export
   * spreadsheet. Call once after setup is confirmed.
   *
   * If a channel for the QB spreadsheet already exists and is not expiring
   * soon, this is a no-op.
   */
  async registerQBSpreadsheetWatch(): Promise<DriveWatchChannelRecord> {
    const existing = await this.findChannelByLabel('QB Spreadsheet');
    if (existing && existing.expiresAt > Date.now() + RENEW_BEFORE_EXPIRY_MS) {
      return existing;
    }

    const fileId = QB_PROJECT_MGMT_SYNC.spreadsheetId;
    const channelId = this.newChannelId();
    const webhookUrl = this.webhookUrl();
    const token = this.channelToken();

    const driveChannel = await this.drive.watchFile(
      fileId,
      channelId,
      webhookUrl,
      token,
    );

    const record: DriveWatchChannelRecord = {
      id: channelId,
      resourceId: driveChannel.resourceId,
      resourceType: 'file',
      watchedFileId: fileId,
      label: 'QB Spreadsheet',
      webhookUrl,
      expiresAt: Number(driveChannel.expiration),
      ownerId: this.auth.currentUser()?.uid ?? '',
    };

    await this.saveChannel(record);
    this.qbWatchActive.set(true);
    console.log('[drive-webhooks] Registered QB spreadsheet watch, expires', new Date(record.expiresAt).toISOString());
    return record;
  }

  /**
   * Register a Drive changes watch for a project's Drive folder.
   * When new files are added, Drive notifies the API which stores an event.
   * This service processes the event and creates project-files records.
   */
  async registerProjectFolderWatch(
    projectId: string,
    folderId: string,
    projectLabel: string,
  ): Promise<DriveWatchChannelRecord> {
    const label = `Project ${projectLabel}`;
    const existing = await this.findChannelByLabel(label);
    if (existing && existing.expiresAt > Date.now() + RENEW_BEFORE_EXPIRY_MS) {
      return existing;
    }

    // Get current page token so we only see changes AFTER registration
    const pageToken = await this.drive.getChangesStartToken();
    const channelId = this.newChannelId();
    const webhookUrl = this.webhookUrl();
    const token = this.channelToken();

    const driveChannel = await this.drive.watchChanges(
      pageToken,
      channelId,
      webhookUrl,
      token,
    );

    const record: DriveWatchChannelRecord = {
      id: channelId,
      resourceId: driveChannel.resourceId,
      resourceType: 'changes',
      projectId,
      folderId,
      label,
      webhookUrl,
      expiresAt: Number(driveChannel.expiration),
      pageToken,
      ownerId: this.auth.currentUser()?.uid ?? '',
    };

    await this.saveChannel(record);
    console.log(`[drive-webhooks] Registered changes watch for ${label}, expires`, new Date(record.expiresAt).toISOString());
    return record;
  }

  /**
   * Stop a channel and remove it from Firestore.
   */
  async stopChannel(channelId: string): Promise<void> {
    const channel = await this.loadChannel(channelId);
    if (!channel) return;

    try {
      await this.drive.stopChannel(channel.id, channel.resourceId);
    } catch (err) {
      console.warn(`[drive-webhooks] stopChannel error (continuing):`, err);
    }

    await deleteDoc(doc(this.firestore, CHANNELS_COLLECTION, channelId));
    console.log(`[drive-webhooks] Stopped and removed channel ${channelId}`);
  }

  // ---------------------------------------------------------------------------
  // Event processing
  // ---------------------------------------------------------------------------

  /**
   * Poll the API for pending webhook events and process each one.
   * Called on an interval from start() and can also be triggered manually.
   */
  async processPendingEvents(): Promise<void> {
    if (this.processingEvent()) return;

    try {
      const events = await this.fetchPendingEvents();
      if (events.length === 0) return;

      this.processingEvent.set(true);
      this.lastError.set(null);

      for (const event of events) {
        await this.processEvent(event);
      }

      this.lastProcessedAt.set(new Date());
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.lastError.set(msg);
      console.error('[drive-webhooks] processPendingEvents error:', err);
    } finally {
      this.processingEvent.set(false);
    }
  }

  private async processEvent(event: WebhookEvent): Promise<void> {
    try {
      if (event.source === 'quickbooks') {
        await this.handleQBEvent(event);
      } else if (event.source === 'drive') {
        await this.handleDriveEvent(event);
      }
      await this.markEventProcessed(event.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[drive-webhooks] Failed to process event ${event.id}:`, err);
      await this.markEventProcessed(event.id, msg);
    }
  }

  /**
   * QB entity changed → trigger a fresh QB sync so Firestore AR + financials
   * reflect the latest data.
   */
  private async handleQBEvent(event: WebhookEvent): Promise<void> {
    console.log(`[drive-webhooks] QB event received (${event.event_type}) — triggering QB sync`);
    // Avoid triggering if a sync is already in progress
    if (this.qbSync.syncing()) {
      console.log('[drive-webhooks] QB sync already in progress — skipping');
      return;
    }
    await this.qbSync.syncFromWorkbook(false);
  }

  /**
   * Drive file/folder changed → fetch the diff and create/update project-files.
   */
  private async handleDriveEvent(event: WebhookEvent): Promise<void> {
    const channelId = event.channel_id;
    if (!channelId) return;

    const channel = await this.loadChannel(channelId);
    if (!channel) {
      console.warn(`[drive-webhooks] Received event for unknown channel ${channelId}`);
      return;
    }

    if (channel.resourceType === 'file') {
      // Single file watch (e.g. QB spreadsheet) — trigger QB sync
      console.log(`[drive-webhooks] Drive file changed: ${channel.label} — triggering QB sync`);
      if (!this.qbSync.syncing()) {
        await this.qbSync.syncFromWorkbook(false);
      }
      return;
    }

    // Changes watch — fetch what actually changed
    if (!channel.pageToken) return;

    const { changes, newPageToken } = await this.drive.listChanges(channel.pageToken);

    // Filter to files added/modified in the watched folder (not trashed, not removed)
    const relevantChanges = changes.filter(c =>
      !c.removed &&
      c.file &&
      !c.file.trashed &&
      c.file.parents?.includes(channel.folderId ?? ''),
    );

    if (relevantChanges.length > 0) {
      console.log(`[drive-webhooks] ${relevantChanges.length} new/modified file(s) in ${channel.label}`);
      await this.indexChangedFiles(relevantChanges, channel);
    }

    // Always update the page token even if no relevant changes
    if (newPageToken !== channel.pageToken) {
      channel.pageToken = newPageToken;
      await this.saveChannel(channel);
    }
  }

  /**
   * Create or update project-files records for files that changed in a
   * watched project folder.
   */
  private async indexChangedFiles(
    changes: DriveChange[],
    channel: DriveWatchChannelRecord,
  ): Promise<void> {
    if (!channel.projectId) return;

    const projects = this.dataService.projectsSnapshot();
    const project = projects.find(p => p.id === channel.projectId);
    if (!project) return;

    const existingFiles = this.projectFilesRepo.forProject(channel.projectId);

    for (const change of changes) {
      const file = change.file;
      if (!file?.id) continue;

      const existing = existingFiles.find(f => f.fileId === file.id);
      if (existing) {
        // File already indexed — update name/link if changed
        await firstValueFrom(
          this.projectFilesRepo.update(
            existing.id,
            {
              fileName: file.name,
              fileUrl: file.webViewLink ?? existing.fileUrl,
              mimeType: file.mimeType,
            },
            project,
          ),
        );
      } else {
        // New file — create a project-files record
        await firstValueFrom(
          this.projectFilesRepo.create(
            {
              projectId: channel.projectId,
              fileId: file.id,
              fileName: file.name,
              fileUrl: file.webViewLink ?? '',
              mimeType: file.mimeType,
              driveFolderId: channel.folderId,
              documentType: 'Upload',
              documentStatus: 'Final',
              sourceType: 'DriveWebhook',
            },
            project,
          ),
        );
        console.log(`[drive-webhooks] Indexed new file: ${file.name} (${file.id})`);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Channel renewal
  // ---------------------------------------------------------------------------

  /**
   * Find channels expiring within 24 hours and re-register them.
   * Call this on startup and daily.
   */
  async renewExpiringChannels(): Promise<void> {
    const uid = this.auth.currentUser()?.uid;
    if (!uid) return;

    const channels = await this.loadAllChannels();
    const expiringSoon = channels.filter(
      c => c.expiresAt < Date.now() + RENEW_BEFORE_EXPIRY_MS,
    );

    for (const channel of expiringSoon) {
      console.log(`[drive-webhooks] Renewing expiring channel: ${channel.label}`);
      try {
        await this.stopChannel(channel.id);
        if (channel.label === 'QB Spreadsheet') {
          await this.registerQBSpreadsheetWatch();
        } else if (channel.projectId && channel.folderId) {
          await this.registerProjectFolderWatch(
            channel.projectId,
            channel.folderId,
            channel.label.replace('Project ', ''),
          );
        }
      } catch (err) {
        console.error(`[drive-webhooks] Failed to renew channel ${channel.id}:`, err);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Firestore channel storage
  // ---------------------------------------------------------------------------

  private async saveChannel(record: DriveWatchChannelRecord): Promise<void> {
    const ref = doc(this.firestore, CHANNELS_COLLECTION, record.id);
    await setDoc(ref, { ...record, updatedAt: serverTimestamp() }, { merge: true });
  }

  private async loadChannel(channelId: string): Promise<DriveWatchChannelRecord | null> {
    const ref = doc(this.firestore, CHANNELS_COLLECTION, channelId);
    const snap = await getDoc(ref);
    return snap.exists() ? (snap.data() as DriveWatchChannelRecord) : null;
  }

  private async loadAllChannels(): Promise<DriveWatchChannelRecord[]> {
    const uid = this.auth.currentUser()?.uid;
    if (!uid) return [];
    const q = query(
      collection(this.firestore, CHANNELS_COLLECTION),
      where('ownerId', '==', uid),
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as DriveWatchChannelRecord);
  }

  private async findChannelByLabel(label: string): Promise<DriveWatchChannelRecord | null> {
    const uid = this.auth.currentUser()?.uid;
    if (!uid) return null;
    const q = query(
      collection(this.firestore, CHANNELS_COLLECTION),
      where('ownerId', '==', uid),
      where('label', '==', label),
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    return snap.docs[0].data() as DriveWatchChannelRecord;
  }

  // ---------------------------------------------------------------------------
  // API communication
  // ---------------------------------------------------------------------------

  private async fetchPendingEvents(): Promise<WebhookEvent[]> {
    const url = `${apiConfig.baseUrl}/api/webhook-events/pending?limit=20`;
    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(`Failed to fetch webhook events: HTTP ${resp.status}`);
    }
    const data = await resp.json() as { events: WebhookEvent[] };
    return data.events ?? [];
  }

  private async markEventProcessed(id: string, error?: string): Promise<void> {
    const url = `${apiConfig.baseUrl}/api/webhook-events/${id}/processed`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(error ? { error } : {}),
    });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private newChannelId(): string {
    return crypto.randomUUID();
  }

  private webhookUrl(): string {
    // Points to our API's /webhooks/drive endpoint
    return `${apiConfig.baseUrl}/webhooks/drive`;
  }

  private channelToken(): string {
    // The Angular app reads the shared channel token from environment/localStorage.
    // Must match DRIVE_WEBHOOK_CHANNEL_TOKEN set in the API's .env.local.
    return (
      localStorage.getItem('brighten.driveWebhookToken') ??
      (typeof process !== 'undefined' && process.env['DRIVE_WEBHOOK_CHANNEL_TOKEN']) ??
      'change-me-in-settings'
    );
  }
}
