import fs from "node:fs/promises";
import path from "node:path";
import { GoogleSheetsClient } from "../src/googleSheets.js";
import { quoteSheetName } from "../src/a1.js";

const SPREADSHEET_ID = "1vuSGTwot3uKigxwYaWHb_EX93Jz5eJgYSeYSBMj3Ax0";
const SERVICE_ACCOUNT_JSON = path.resolve("../外籍/eggy-495601-c5d063f48805.json");
const TEAM_SHEETS = ["婷芬班", "俊志班", "美香班", "翊展班"];
const OUTPUT_FILE = path.resolve(".tmp/employees.json");

function normalizeWorkerId(value) {
  return String(value || "").trim().toUpperCase();
}

function compactHeader(value) {
  return String(value || "").replace(/\s+/g, "");
}

function findHeaderRow(rows) {
  return rows.findIndex((row) => row.some((cell) => compactHeader(cell) === "工號"));
}

function headerIndex(headers) {
  const output = {};
  headers.forEach((header, index) => {
    output[compactHeader(header)] = index;
  });
  return output;
}

function isForeignWorker(workerId, shiftCode, shiftLabel) {
  return (
    /^V/i.test(workerId) ||
    ["AN3", "AD3"].includes(String(shiftCode || "").trim().toUpperCase()) ||
    String(shiftLabel || "").includes("外籍")
  );
}

async function main() {
  const serviceAccount = JSON.parse(await fs.readFile(SERVICE_ACCOUNT_JSON, "utf8"));
  const sheets = new GoogleSheetsClient({
    spreadsheetId: SPREADSHEET_ID,
    serviceAccountEmail: serviceAccount.client_email,
    privateKey: serviceAccount.private_key,
  });

  const employees = [];

  for (const sheetName of TEAM_SHEETS) {
    const rows = await sheets.getValues(`${quoteSheetName(sheetName)}!A1:AZ500`);
    const headerRowIndex = findHeaderRow(rows);
    if (headerRowIndex === -1) {
      console.warn(`SKIP ${sheetName}: header row not found`);
      continue;
    }

    const headers = headerIndex(rows[headerRowIndex]);
    const titleCol = 0;
    const workerCol = headers["工號"];
    const nameCol = headers["姓名"];
    const shiftCol = headers["班別"];
    const shiftCodeCol = headers["班別代號"];

    for (const row of rows.slice(headerRowIndex + 1)) {
      const workerId = normalizeWorkerId(row[workerCol]);
      const name = String(row[nameCol] || "").trim();
      if (!workerId || !name) continue;

      const shiftLabel = String(row[shiftCol] || "").trim();
      const shiftCode = String(row[shiftCodeCol] || "").trim().toUpperCase();

      employees.push({
        worker_id: workerId,
        name,
        title: String(row[titleCol] || "").trim(),
        team_name: sheetName,
        shift_label: shiftLabel,
        shift_code: shiftCode,
        is_foreign: isForeignWorker(workerId, shiftCode, shiftLabel),
      });
    }
  }

  await fs.mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
  await fs.writeFile(OUTPUT_FILE, JSON.stringify(employees, null, 2), "utf8");
  console.log(`EXPORTED ${employees.length} employees to ${OUTPUT_FILE}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
