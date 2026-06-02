import { GoogleAuthClient } from "./googleAuth.js";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const DRIVE_API_ROOT = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD_ROOT = "https://www.googleapis.com/upload/drive/v3/files";

export class GoogleDriveClient {
  constructor({ serviceAccountEmail, privateKey, folderId }) {
    this.folderId = folderId;
    this.auth = new GoogleAuthClient({
      serviceAccountEmail,
      privateKey,
      scopes: [DRIVE_SCOPE],
    });
  }

  async uploadFile({ name, mimeType, buffer }) {
    return this.uploadFileToFolder({ name, mimeType, buffer, folderId: this.folderId });
  }

  async uploadFileToFolder({ name, mimeType, buffer, folderId }) {
    const token = await this.auth.getAccessToken();
    const boundary = `leave-bot-${Date.now()}`;
    const metadata = {
      name,
      ...(folderId ? { parents: [folderId] } : {}),
    };

    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(
          metadata,
        )}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
      ),
      buffer,
      Buffer.from(`\r\n--${boundary}--`),
    ]);

    const response = await fetch(
      `${DRIVE_UPLOAD_ROOT}?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink,webContentLink`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": `multipart/related; boundary=${boundary}`,
        },
        body,
      },
    );

    if (!response.ok) {
      throw new Error(`Google Drive upload failed: ${response.status} ${await response.text()}`);
    }

    const uploaded = await response.json();
    if (!uploaded.webViewLink) {
      return this.getFile(uploaded.id);
    }
    return uploaded;
  }

  async uploadFileToClassFolder({ className, name, mimeType, buffer }) {
    const folderId = className ? await this.getOrCreateChildFolder(className) : this.folderId;
    return this.uploadFileToFolder({ name, mimeType, buffer, folderId });
  }

  async getOrCreateChildFolder(folderName) {
    if (!this.folderId) return "";

    const existing = await this.findChildFolder(folderName);
    if (existing) return existing.id;
    return this.createChildFolder(folderName);
  }

  async findChildFolder(folderName) {
    const token = await this.auth.getAccessToken();
    const query = [
      `name = '${String(folderName).replace(/'/g, "\\'")}'`,
      "mimeType = 'application/vnd.google-apps.folder'",
      `'${this.folderId}' in parents`,
      "trashed = false",
    ].join(" and ");
    const params = new URLSearchParams({
      q: query,
      fields: "files(id,name)",
      pageSize: "1",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    });
    const response = await fetch(`${DRIVE_API_ROOT}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      throw new Error(`Google Drive folder lookup failed: ${response.status} ${await response.text()}`);
    }

    const body = await response.json();
    return body.files?.[0] || null;
  }

  async createChildFolder(folderName) {
    const token = await this.auth.getAccessToken();
    const response = await fetch(`${DRIVE_API_ROOT}?supportsAllDrives=true&fields=id,name`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: folderName,
        mimeType: "application/vnd.google-apps.folder",
        parents: [this.folderId],
      }),
    });

    if (!response.ok) {
      throw new Error(`Google Drive folder creation failed: ${response.status} ${await response.text()}`);
    }

    const folder = await response.json();
    return folder.id;
  }

  async getFile(fileId) {
    const token = await this.auth.getAccessToken();
    const response = await fetch(
      `${DRIVE_API_ROOT}/${encodeURIComponent(fileId)}?supportsAllDrives=true&fields=id,name,webViewLink,webContentLink`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    if (!response.ok) {
      throw new Error(`Google Drive file lookup failed: ${response.status} ${await response.text()}`);
    }
    return response.json();
  }
}
