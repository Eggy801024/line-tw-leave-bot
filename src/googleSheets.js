import { quoteSheetName } from "./a1.js";
import { GoogleAuthClient } from "./googleAuth.js";

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const API_ROOT = "https://sheets.googleapis.com/v4/spreadsheets";

export class GoogleSheetsClient {
  constructor({ spreadsheetId, serviceAccountEmail, privateKey }) {
    this.spreadsheetId = spreadsheetId;
    this.auth = new GoogleAuthClient({
      serviceAccountEmail,
      privateKey,
      scopes: [SHEETS_SCOPE],
    });
  }

  async request(path, options = {}) {
    const token = await this.auth.getAccessToken();
    const response = await fetch(`${API_ROOT}/${this.spreadsheetId}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });

    if (!response.ok) {
      throw new Error(`Google Sheets request failed: ${response.status} ${await response.text()}`);
    }
    if (response.status === 204) return null;
    return response.json();
  }

  async getSpreadsheet() {
    return this.request("?fields=sheets.properties");
  }

  async getSheetProperties(sheetName) {
    const spreadsheet = await this.getSpreadsheet();
    return spreadsheet.sheets
      .map((sheet) => sheet.properties)
      .find((properties) => properties.title === sheetName);
  }

  async ensureSheet(sheetName, headerRow = []) {
    let properties = await this.getSheetProperties(sheetName);
    if (!properties) {
      await this.batchUpdate({
        requests: [{ addSheet: { properties: { title: sheetName } } }],
      });
      properties = await this.getSheetProperties(sheetName);
    }

    if (headerRow.length > 0) {
      await this.updateValues(`${quoteSheetName(sheetName)}!A1`, [headerRow]);
      await this.batchUpdate({
        requests: [
          {
            updateSheetProperties: {
              properties: { sheetId: properties.sheetId, gridProperties: { frozenRowCount: 1 } },
              fields: "gridProperties.frozenRowCount",
            },
          },
        ],
      });
    }
  }

  async getValues(a1Range) {
    const params = new URLSearchParams({
      valueRenderOption: "UNFORMATTED_VALUE",
      dateTimeRenderOption: "FORMATTED_STRING",
    });
    const body = await this.request(`/values/${encodeURIComponent(a1Range)}?${params.toString()}`);
    return body.values || [];
  }

  async updateValues(a1Range, values) {
    const params = new URLSearchParams({ valueInputOption: "USER_ENTERED" });
    return this.request(`/values/${encodeURIComponent(a1Range)}?${params.toString()}`, {
      method: "PUT",
      body: JSON.stringify({ range: a1Range, majorDimension: "ROWS", values }),
    });
  }

  async appendValues(a1Range, values) {
    const params = new URLSearchParams({
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
    });
    return this.request(`/values/${encodeURIComponent(a1Range)}:append?${params.toString()}`, {
      method: "POST",
      body: JSON.stringify({ range: a1Range, majorDimension: "ROWS", values }),
    });
  }

  async batchUpdate(body) {
    return this.request(":batchUpdate", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async formatCells(sheetName, ranges, userEnteredFormat) {
    if (ranges.length === 0) return null;

    const properties = await this.getSheetProperties(sheetName);
    if (!properties) throw new Error(`Sheet not found: ${sheetName}`);

    return this.batchUpdate({
      requests: ranges.map((range) => ({
        repeatCell: {
          range: {
            sheetId: properties.sheetId,
            startRowIndex: range.startRowIndex,
            endRowIndex: range.endRowIndex,
            startColumnIndex: range.startColumnIndex,
            endColumnIndex: range.endColumnIndex,
          },
          cell: { userEnteredFormat },
          fields: "userEnteredFormat(backgroundColor,textFormat)",
        },
      })),
    });
  }
}

export const LEAVE_RECORD_HEADERS = [
  "申請時間",
  "LINE使用者ID",
  "工號",
  "姓名",
  "部門/班別",
  "假別",
  "開始日期",
  "結束日期",
  "開始時間",
  "結束時間",
  "請假時數",
  "原因",
  "診斷證明連結",
  "狀態",
  "備註",
];
