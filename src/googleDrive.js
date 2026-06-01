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
    const token = await this.auth.getAccessToken();
    const boundary = `leave-bot-${Date.now()}`;
    const metadata = {
      name,
      ...(this.folderId ? { parents: [this.folderId] } : {}),
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
      `${DRIVE_UPLOAD_ROOT}?uploadType=multipart&fields=id,name,webViewLink,webContentLink`,
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

  async getFile(fileId) {
    const token = await this.auth.getAccessToken();
    const response = await fetch(
      `${DRIVE_API_ROOT}/${encodeURIComponent(fileId)}?fields=id,name,webViewLink,webContentLink`,
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
