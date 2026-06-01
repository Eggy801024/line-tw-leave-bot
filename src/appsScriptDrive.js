export class AppsScriptDriveClient {
  constructor({ webAppUrl, secret }) {
    this.webAppUrl = webAppUrl;
    this.secret = secret;
  }

  async uploadFileToClassFolder({ className, name, mimeType, buffer }) {
    if (!this.webAppUrl) {
      throw new Error("Missing DRIVE_UPLOAD_WEB_APP_URL");
    }

    const response = await fetch(this.webAppUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        secret: this.secret,
        className,
        name,
        mimeType,
        base64: buffer.toString("base64"),
      }),
    });

    if (!response.ok) {
      throw new Error(`Apps Script upload failed: ${response.status} ${await response.text()}`);
    }

    const result = await response.json();
    if (!result.ok) {
      throw new Error(`Apps Script upload failed: ${result.error || "unknown error"}`);
    }

    return {
      id: result.id,
      name: result.name,
      webViewLink: result.url,
      webContentLink: result.url,
    };
  }
}
