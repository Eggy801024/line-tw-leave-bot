import fs from "node:fs";
import path from "node:path";

function parseDotEnv(content) {
  const env = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const eq = line.indexOf("=");
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value.replace(/\\n/g, "\n");
  }

  return env;
}

export function loadEnvFile(filePath = path.resolve(".env")) {
  if (!fs.existsSync(filePath)) return;
  const parsed = parseDotEnv(fs.readFileSync(filePath, "utf8"));

  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function getRequired(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function parseServiceAccountJson(filePath) {
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (parsed.type !== "service_account" || !parsed.client_email || !parsed.private_key) {
    throw new Error(`${filePath} is not a valid service account JSON file`);
  }
  return {
    serviceAccountEmail: parsed.client_email,
    privateKey: parsed.private_key,
  };
}

function getPrivateKey() {
  if (process.env.GOOGLE_PRIVATE_KEY) return process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n");

  if (process.env.GOOGLE_PRIVATE_KEY_PATH) {
    const content = fs.readFileSync(process.env.GOOGLE_PRIVATE_KEY_PATH, "utf8");
    if (content.trim().startsWith("{")) {
      const parsed = JSON.parse(content);
      if (parsed.private_key) return parsed.private_key;
    }
    return content;
  }

  throw new Error("Missing GOOGLE_PRIVATE_KEY, GOOGLE_PRIVATE_KEY_PATH, or GOOGLE_SERVICE_ACCOUNT_JSON_PATH");
}

function parseCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function getConfig() {
  loadEnvFile();
  const serviceAccount = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH
    ? parseServiceAccountJson(process.env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH)
    : null;

  return {
    port: Number(process.env.PORT || 3000),
    timeZone: process.env.TIME_ZONE || "Asia/Taipei",
    line: {
      channelSecret: getRequired("LINE_CHANNEL_SECRET"),
      channelAccessToken: getRequired("LINE_CHANNEL_ACCESS_TOKEN"),
    },
    google: {
      spreadsheetId: getRequired("GOOGLE_SPREADSHEET_ID"),
      serviceAccountEmail:
        process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ||
        serviceAccount?.serviceAccountEmail ||
        getRequired("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
      privateKey: serviceAccount?.privateKey || getPrivateKey(),
      driveFolderId: process.env.GOOGLE_DRIVE_FOLDER_ID || "",
    },
    driveUpload: {
      webAppUrl: process.env.DRIVE_UPLOAD_WEB_APP_URL || "",
      secret: process.env.DRIVE_UPLOAD_SECRET || "",
    },
    database: {
      url: process.env.DATABASE_URL || "",
    },
    sheets: {
      leaveRecordSheetName: process.env.LEAVE_RECORD_SHEET_NAME || "請假申請紀錄",
      employeeSheetName: process.env.EMPLOYEE_SHEET_NAME || "請假",
      employeeSheetNames: parseCsv(process.env.EMPLOYEE_SHEET_NAMES || "婷芬班,俊志班,美香班,翊展班"),
      adminSpreadsheetId: process.env.ADMIN_SPREADSHEET_ID || "",
      adminSheetName: process.env.ADMIN_SHEET_NAME || "主管權限",
    },
    rules: {
      workerIdPattern: new RegExp(process.env.WORKER_ID_PATTERN || "(?:[A-Z]{1,3}\\d{3,4}|\\d{5})", "i"),
      defaultFullDayHours: Number(process.env.DEFAULT_FULL_DAY_HOURS || 10),
      breakHoursForFullShift: Number(process.env.BREAK_HOURS_FOR_FULL_SHIFT || 2),
      pendingSickLeaveMinutes: Number(process.env.PENDING_SICK_LEAVE_MINUTES || 30),
      eligibleShiftMarks: parseCsv(process.env.ELIGIBLE_SHIFT_MARKS || "N1,D1,AN3,AD3"),
      adminLineUserIds: parseCsv(process.env.ADMIN_LINE_USER_IDS),
      excludedLeaveTypes: ["特休", "喪假", "婚假"],
    },
  };
}
