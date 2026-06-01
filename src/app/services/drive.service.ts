import { Injectable, inject } from '@angular/core';
import { AuthService } from './auth.service';
import { driveFolderUrl, isDriveFolder } from '../utils/drive-folder-matcher';

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
}
