import { Injectable, inject } from '@angular/core';
import { AuthService } from './auth.service';

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  webViewLink: string;
  iconLink: string;
  modifiedTime: string;
}

@Injectable({ providedIn: 'root' })
export class DriveService {
  authService = inject(AuthService);

  async listFiles(folderId: string): Promise<DriveFile[]> {
    const token = await this.authService.getAccessToken();
    if (!token) {
      throw new Error('Not authenticated with Google Workspace');
    }

    const q = `'${folderId}' in parents and trashed = false`;
    const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,webViewLink,iconLink,modifiedTime)`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error(`Drive API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.files || [];
  }
}
