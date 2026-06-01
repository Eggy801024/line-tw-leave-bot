import http from "node:http";
import { getConfig } from "./config.js";
import { GoogleDriveClient } from "./googleDrive.js";
import { GoogleSheetsClient } from "./googleSheets.js";
import { LeaveService } from "./leaveService.js";
import { LineClient, verifyLineSignature } from "./line.js";

function readRawBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

function send(response, statusCode, body) {
  response.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(body);
}

async function main() {
  const config = getConfig();
  const line = new LineClient(config.line.channelAccessToken);
  const sheets = new GoogleSheetsClient(config.google);
  const adminSheets = config.sheets.adminSpreadsheetId
    ? new GoogleSheetsClient({
        ...config.google,
        spreadsheetId: config.sheets.adminSpreadsheetId,
      })
    : null;
  const drive = config.google.driveFolderId
    ? new GoogleDriveClient({
        serviceAccountEmail: config.google.serviceAccountEmail,
        privateKey: config.google.privateKey,
        folderId: config.google.driveFolderId,
      })
    : null;
  const leaveService = new LeaveService({ sheetsClient: sheets, adminSheetsClient: adminSheets, driveClient: drive, config });

  const server = http.createServer(async (request, response) => {
    try {
      if (request.method === "GET" && request.url === "/") {
        send(response, 200, "LINE leave request bot is running.");
        return;
      }

      if (request.method !== "POST" || request.url !== "/webhook") {
        send(response, 404, "Not found");
        return;
      }

      const rawBody = await readRawBody(request);
      const signature = request.headers["x-line-signature"];
      if (!verifyLineSignature(config.line.channelSecret, rawBody, signature)) {
        send(response, 401, "Invalid signature");
        return;
      }

      const payload = JSON.parse(rawBody.toString("utf8"));
      send(response, 200, "OK");

      for (const event of payload.events || []) {
        try {
          let reply = null;
          if (event.type === "follow") {
            reply = leaveService.getWelcomeText();
          }

          if (event.type !== "message" && !reply) continue;

          if (event.message?.type === "text") {
            reply = await leaveService.handleTextMessage({
              text: event.message.text,
              source: event.source,
            });
          }

          if (event.message?.type === "image") {
            const content = await line.getMessageContent(event.message.id);
            reply = await leaveService.handleImageMessage({
              source: event.source,
              content,
            });
          }

          if (reply) await line.replyText(event.replyToken, reply);
        } catch (error) {
          console.error("Event handling failed:", error);
          await line.replyText(event.replyToken, `系統處理失敗，請稍後再試。\n${error.message}`);
        }
      }
    } catch (error) {
      console.error("Webhook failed:", error);
      if (!response.headersSent) send(response, 500, "Internal server error");
    }
  });

  server.listen(config.port, () => {
    console.log(`LINE leave request bot listening on port ${config.port}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
