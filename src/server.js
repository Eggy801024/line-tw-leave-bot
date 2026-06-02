import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { AppsScriptDriveClient } from "./appsScriptDrive.js";
import { getConfig } from "./config.js";
import { LeaveDatabaseClient } from "./database.js";
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

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function parseUrl(request) {
  return new URL(request.url, "http://localhost");
}

function isAuthorized(request, config, url) {
  if (!config.web.adminPassword) return true;
  const header = request.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : url.searchParams.get("token");
  return token === config.web.adminPassword;
}

function csvEscape(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function leaveRowsToCsv(rows) {
  const header = ["排班日期", "工號", "姓名", "班級", "班別", "假別", "開始日期", "結束日期", "開始時間", "結束時間", "請假時數", "原因", "診斷證明"];
  const data = rows.map((row) => [
    row.schedule_date,
    row.worker_id,
    row.employee_name,
    row.team_name,
    row.shift_label,
    row.leave_type_name,
    row.start_date,
    row.end_date,
    row.start_time,
    row.end_time,
    row.hours,
    row.reason,
    row.medical_proof_url,
  ]);
  return [header, ...data].map((row) => row.map(csvEscape).join(",")).join("\n");
}

async function serveStatic(response, filePath, contentType) {
  try {
    const body = await fs.readFile(filePath);
    response.writeHead(200, { "Content-Type": contentType });
    response.end(body);
  } catch {
    send(response, 404, "Not found");
  }
}

function queryFilters(url) {
  return {
    team: url.searchParams.get("team") || "",
    leaveType: url.searchParams.get("leaveType") || "",
    workerId: url.searchParams.get("workerId") || "",
    from: url.searchParams.get("from") || "",
    to: url.searchParams.get("to") || "",
  };
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
  const drive = config.driveUpload.webAppUrl
    ? new AppsScriptDriveClient(config.driveUpload)
    : config.google.driveFolderId
    ? new GoogleDriveClient({
        serviceAccountEmail: config.google.serviceAccountEmail,
        privateKey: config.google.privateKey,
        folderId: config.google.driveFolderId,
      })
    : null;
  const database = config.database.url
    ? new LeaveDatabaseClient({ databaseUrl: config.database.url })
    : null;
  const leaveService = new LeaveService({
    sheetsClient: sheets,
    adminSheetsClient: adminSheets,
    driveClient: drive,
    databaseClient: database,
    config,
  });
  const publicDir = path.resolve("public");

  const server = http.createServer(async (request, response) => {
    try {
      const url = parseUrl(request);
      if (request.method === "GET" && url.pathname === "/") {
        send(response, 200, "LINE leave request bot is running.");
        return;
      }

      if (request.method === "GET" && url.pathname === "/app") {
        await serveStatic(response, path.join(publicDir, "app.html"), "text/html; charset=utf-8");
        return;
      }

      if (request.method === "GET" && url.pathname === "/app.css") {
        await serveStatic(response, path.join(publicDir, "app.css"), "text/css; charset=utf-8");
        return;
      }

      if (request.method === "GET" && url.pathname === "/app.js") {
        await serveStatic(response, path.join(publicDir, "app.js"), "application/javascript; charset=utf-8");
        return;
      }

      if (request.method === "GET" && url.pathname.startsWith("/api/")) {
        if (!database) {
          sendJson(response, 503, { error: "Database is not configured" });
          return;
        }
        if (!isAuthorized(request, config, url)) {
          sendJson(response, 401, { error: "Unauthorized" });
          return;
        }

        if (url.pathname === "/api/summary") {
          sendJson(response, 200, await database.getLeaveSummary(queryFilters(url)));
          return;
        }

        if (url.pathname === "/api/leaves") {
          sendJson(response, 200, { rows: await database.listLeaveRequests(queryFilters(url)) });
          return;
        }

        if (url.pathname === "/api/leaves.csv") {
          const rows = await database.listLeaveRequests({ ...queryFilters(url), limit: 500 });
          response.writeHead(200, {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": "attachment; filename=leave_requests.csv",
          });
          response.end(`\uFEFF${leaveRowsToCsv(rows)}`);
          return;
        }
      }

      if (request.method !== "POST" || url.pathname !== "/webhook") {
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
