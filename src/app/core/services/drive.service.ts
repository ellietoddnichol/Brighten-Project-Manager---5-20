import { Injectable, inject } from '@angular/core';
import { AuthService } from '@core/services/auth.service';
import { driveFolderUrl, isDriveFolder } from '@features/documents/utils/drive-folder-matcher';

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  webViewLink: string;
  iconLink: string;
  modifiedTime: string;
}

export interface DriveFolderEntry {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  modifiedTime?: string;
}

export function parseDriveFolderId(input: string): string {
  const trimmed = input.trim();
  const folderMatch = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch) return folderMatch[1];
  const idMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idMatch) return idMatch[1];
  return trimmed;
}

async function readDriveApiError(response: Response): Promise<string> {
  try {
    const body = await response.json();
    const message = body?.error?.message as string | undefined;
    const reason = body?.error?.errors?.[0]?.reason as string | undefined;

    if (message) {
      if (response.status === 403 && reason === 'accessNotConfigured') {
        return 'Google Drive API is not enabled. In Google Cloud Console, enable the Drive API for project "brighten-project-manager".';
      }
      if (response.status === 403) {
        return `Access denied — ${message}. Ensure the folder is shared with your Google account.`;
      }
      if (response.status === 404) {
        return `Folder not found — check the Drive folder ID. (${message})`;
      }
      if (response.status === 401) {
        return 'Session expired — click Re-authorize Drive below.';
      }
      return message;
    }
  } catch {
    // Response body wasn't JSON.
  }

  if (response.status) {
    return `HTTP ${response.status}${response.statusText ? ` (${response.statusText})` : ''}`;
  }
  return 'Network error — check your connection and try again.';
}

@Injectable({ providedIn: 'root' })
export class DriveService {
  private authService = inject(AuthService);

  folderUrl(folderId: string): string {
    return driveFolderUrl(parseDriveFolderId(folderId));
  }

  private async authorizedFetch(url: string, init: RequestInit, allowRetry: boolean): Promise<Response> {
    const token = await this.authService.getAccessToken();
    if (!token) {
      throw new Error('Not authenticated with Google. Sign in or click Re-authorize Drive.');
    }

    const response = await fetch(url, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${token}` },
    });

    if (!response.ok && response.status === 401 && allowRetry) {
      this.authService.clearAccessToken();
      const refreshed = await this.authService.refreshDriveAccess();
      if (!refreshed) {
        throw new Error('Google Drive session expired. Sign out and back in, or click Re-authorize Drive.');
      }
      return this.authorizedFetch(url, init, false);
    }

    return response;
  }

  async listChildren(
    folderId: string,
    foldersOnly = false,
    allowRetry = true,
  ): Promise<DriveFolderEntry[]> {
    const normalizedId = parseDriveFolderId(folderId);
    if (!normalizedId) throw new Error('Invalid Drive folder ID.');

    const mimeFilter = foldersOnly
      ? " and mimeType = 'application/vnd.google-apps.folder'"
      : '';
    const q = `'${normalizedId}' in parents and trashed = false${mimeFilter}`;
    const params = new URLSearchParams({
      q,
      fields: 'files(id,name,mimeType,webViewLink,modifiedTime)',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
      orderBy: 'name',
      pageSize: '200',
    });

    const response = await this.authorizedFetch(
      `https://www.googleapis.com/drive/v3/files?${params}`,
      { method: 'GET' },
      allowRetry,
    );

    if (!response.ok) {
      const detail = await readDriveApiError(response);
      throw new Error(`Drive API error: ${detail}`);
    }

    const data = await response.json();
    return (data.files || []) as DriveFolderEntry[];
  }

  async listFolders(folderId: string, allowRetry = true): Promise<DriveFolderEntry[]> {
    const children = await this.listChildren(folderId, false, allowRetry);
    return children.filter(f => isDriveFolder(f.mimeType));
  }

  async listFiles(folderId: string, allowRetry = true): Promise<DriveFile[]> {
    const children = await this.listChildren(folderId, false, allowRetry);
    return children
      .filter(f => !isDriveFolder(f.mimeType))
      .map(f => ({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        webViewLink: f.webViewLink ?? driveFolderUrl(f.id),
        iconLink: '',
        modifiedTime: f.modifiedTime ?? '',
      }));
  }

  async createFolder(
    parentFolderId: string,
    name: string,
    allowRetry = true,
  ): Promise<DriveFolderEntry> {
    const normalizedParent = parseDriveFolderId(parentFolderId);
    const metadata = {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [normalizedParent],
    };

    const response = await this.authorizedFetch(
      'https://www.googleapis.com/drive/v3/files?fields=id,name,mimeType,webViewLink,modifiedTime&supportsAllDrives=true',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(metadata),
      },
      allowRetry,
    );

    if (!response.ok) {
      const detail = await readDriveApiError(response);
      throw new Error(`Drive create folder error: ${detail}`);
    }

    return response.json();
  }

  async uploadHtmlFile(
    folderId: string,
    fileName: string,
    htmlContent: string,
    allowRetry = true,
  ): Promise<DriveFile> {
    return this.uploadFile(folderId, fileName, htmlContent, 'text/html', allowRetry);
  }

  async uploadFile(
    folderId: string,
    fileName: string,
    content: string | Blob,
    mimeType: string,
    allowRetry = true,
  ): Promise<DriveFile> {
    const normalizedId = parseDriveFolderId(folderId);

    const metadata = {
      name: fileName,
      mimeType,
      parents: [normalizedId],
    };

    const boundary = '-------314159265358979323846';
    const fileBody = content instanceof Blob ? content : content;
    const bodyParts = [
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
      `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
    ];

    let body: Blob | string;
    if (fileBody instanceof Blob) {
      body = new Blob([
        bodyParts[0],
        fileBody,
        `\r\n--${boundary}--`,
      ]);
    } else {
      body =
        bodyParts[0]
        + `${fileBody}\r\n`
        + `--${boundary}--`;
    }

    const response = await this.authorizedFetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink,iconLink,modifiedTime&supportsAllDrives=true',
      {
        method: 'POST',
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body,
      },
      allowRetry,
    );

    if (!response.ok) {
      const detail = await readDriveApiError(response);
      throw new Error(`Drive upload error: ${detail}`);
    }

    return response.json();
  }

<<<<<<< HEAD
  /** Register a push notification channel for a Drive file (spreadsheet/folder). */
=======
  // ---------------------------------------------------------------------------
  // Push notification (webhook) methods
  // ---------------------------------------------------------------------------

  /**
   * Register a push notification channel on a single Drive file or folder.
   * Use for watching a specific file (e.g. the QB export spreadsheet).
   *
   * Drive will POST to webhookUrl whenever the file's content or metadata changes.
   * The channel expires after `expirationMs` (max ~7 days from now).
   * You MUST renew before expiration or notifications stop.
   */
>>>>>>> origin/claude/bold-hawking-ZZo7f
  async watchFile(
    fileId: string,
    channelId: string,
    webhookUrl: string,
<<<<<<< HEAD
    token: string,
    expirationMs = 6 * 24 * 60 * 60 * 1000,
    allowRetry = true,
  ): Promise<{ resourceId: string; expiration: string }> {
    const expiration = Date.now() + expirationMs;
=======
    channelToken: string,
    expirationMs?: number,
    allowRetry = true,
  ): Promise<DriveWatchChannel> {
    const expiration = expirationMs ?? Date.now() + 6 * 24 * 60 * 60 * 1000; // 6 days
>>>>>>> origin/claude/bold-hawking-ZZo7f
    const body = {
      id: channelId,
      type: 'web_hook',
      address: webhookUrl,
<<<<<<< HEAD
      token,
=======
      token: channelToken,
>>>>>>> origin/claude/bold-hawking-ZZo7f
      expiration: String(expiration),
    };

    const response = await this.authorizedFetch(
<<<<<<< HEAD
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/watch?supportsAllDrives=true`,
=======
      `https://www.googleapis.com/drive/v3/files/${fileId}/watch?supportsAllDrives=true`,
>>>>>>> origin/claude/bold-hawking-ZZo7f
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      allowRetry,
    );

    if (!response.ok) {
      const detail = await readDriveApiError(response);
      throw new Error(`Drive watch error: ${detail}`);
    }

<<<<<<< HEAD
    const data = await response.json() as { resourceId?: string; expiration?: string };
    return {
      resourceId: data.resourceId ?? '',
      expiration: data.expiration ?? String(expiration),
    };
  }

  async stopWatch(channelId: string, resourceId: string, allowRetry = true): Promise<void> {
=======
    return response.json() as Promise<DriveWatchChannel>;
  }

  /**
   * Get the current page token for tracking Drive changes.
   * Required before calling watchChanges() — store this token and update it
   * after each listChanges() call.
   */
  async getChangesStartToken(allowRetry = true): Promise<string> {
    const response = await this.authorizedFetch(
      'https://www.googleapis.com/drive/v3/changes/startPageToken?supportsAllDrives=true',
      { method: 'GET' },
      allowRetry,
    );
    if (!response.ok) {
      const detail = await readDriveApiError(response);
      throw new Error(`Drive changes token error: ${detail}`);
    }
    const data = await response.json() as { startPageToken: string };
    return data.startPageToken;
  }

  /**
   * Register a push notification channel on Drive changes feed.
   * Notifies when ANY file the user can access changes — filter by folderId client-side.
   *
   * Use this for watching project folders (children of a folder).
   * pageToken comes from getChangesStartToken() or the previous listChanges() response.
   */
  async watchChanges(
    pageToken: string,
    channelId: string,
    webhookUrl: string,
    channelToken: string,
    expirationMs?: number,
    allowRetry = true,
  ): Promise<DriveWatchChannel> {
    const expiration = expirationMs ?? Date.now() + 6 * 24 * 60 * 60 * 1000;
    const body = {
      id: channelId,
      type: 'web_hook',
      address: webhookUrl,
      token: channelToken,
      expiration: String(expiration),
    };

    const params = new URLSearchParams({
      pageToken,
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
    });

    const response = await this.authorizedFetch(
      `https://www.googleapis.com/drive/v3/changes/watch?${params}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      allowRetry,
    );

    if (!response.ok) {
      const detail = await readDriveApiError(response);
      throw new Error(`Drive changes watch error: ${detail}`);
    }

    return response.json() as Promise<DriveWatchChannel>;
  }

  /**
   * Fetch the list of changes since the given pageToken.
   * Call this after receiving a Drive push notification to find out what changed.
   * Returns the changes and a new pageToken to use for the next call.
   */
  async listChanges(
    pageToken: string,
    allowRetry = true,
  ): Promise<{ changes: DriveChange[]; newPageToken: string }> {
    const params = new URLSearchParams({
      pageToken,
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
      fields: 'nextPageToken,newStartPageToken,changes(type,changeType,removed,fileId,file(id,name,mimeType,parents,webViewLink,modifiedTime,trashed))',
      pageSize: '100',
    });

    const response = await this.authorizedFetch(
      `https://www.googleapis.com/drive/v3/changes?${params}`,
      { method: 'GET' },
      allowRetry,
    );

    if (!response.ok) {
      const detail = await readDriveApiError(response);
      throw new Error(`Drive listChanges error: ${detail}`);
    }

    const data = await response.json() as {
      nextPageToken?: string;
      newStartPageToken?: string;
      changes: DriveChange[];
    };

    return {
      changes: data.changes ?? [],
      newPageToken: data.nextPageToken ?? data.newStartPageToken ?? pageToken,
    };
  }

  /**
   * Stop a push notification channel before it expires.
   * Call when a project is closed or a folder is unlinked.
   */
  async stopChannel(
    channelId: string,
    resourceId: string,
    allowRetry = true,
  ): Promise<void> {
>>>>>>> origin/claude/bold-hawking-ZZo7f
    const response = await this.authorizedFetch(
      'https://www.googleapis.com/drive/v3/channels/stop',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: channelId, resourceId }),
      },
      allowRetry,
    );
<<<<<<< HEAD
    if (!response.ok && response.status !== 404) {
      const detail = await readDriveApiError(response);
      throw new Error(`Drive stop watch error: ${detail}`);
    }
  }
=======

    // 204 = success, 404 = channel already expired — both are fine
    if (!response.ok && response.status !== 404) {
      const detail = await readDriveApiError(response);
      throw new Error(`Drive stopChannel error: ${detail}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Drive push notification types
// ---------------------------------------------------------------------------

export interface DriveWatchChannel {
  kind: string;          // 'api#channel'
  id: string;            // channelId you provided
  resourceId: string;    // stable opaque ID of the watched resource
  resourceUri: string;   // canonical URI of the resource
  expiration: string;    // epoch milliseconds as a string
}

export interface DriveChange {
  type: 'file' | 'drive';
  changeType: string;
  removed: boolean;
  fileId?: string;
  file?: {
    id: string;
    name: string;
    mimeType: string;
    parents?: string[];
    webViewLink?: string;
    modifiedTime?: string;
    trashed?: boolean;
  };
>>>>>>> origin/claude/bold-hawking-ZZo7f
}
