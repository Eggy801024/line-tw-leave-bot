import crypto from "node:crypto";

const TOKEN_URL = "https://oauth2.googleapis.com/token";

function base64Url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

export class GoogleAuthClient {
  constructor({ serviceAccountEmail, privateKey, scopes }) {
    this.serviceAccountEmail = serviceAccountEmail;
    this.privateKey = privateKey;
    this.scopes = scopes;
    this.cachedToken = null;
  }

  async getAccessToken() {
    const now = Math.floor(Date.now() / 1000);
    if (this.cachedToken && this.cachedToken.expiresAt - 60 > now) {
      return this.cachedToken.token;
    }

    const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const claim = base64Url(
      JSON.stringify({
        iss: this.serviceAccountEmail,
        scope: this.scopes.join(" "),
        aud: TOKEN_URL,
        exp: now + 3600,
        iat: now,
      }),
    );
    const unsigned = `${header}.${claim}`;
    const signature = crypto
      .createSign("RSA-SHA256")
      .update(unsigned)
      .sign(this.privateKey, "base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");

    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: `${unsigned}.${signature}`,
      }),
    });

    if (!response.ok) {
      throw new Error(`Google token request failed: ${response.status} ${await response.text()}`);
    }

    const body = await response.json();
    this.cachedToken = {
      token: body.access_token,
      expiresAt: now + Number(body.expires_in || 3600),
    };
    return this.cachedToken.token;
  }
}
