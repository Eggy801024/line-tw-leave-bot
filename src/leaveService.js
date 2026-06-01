import { quoteSheetName, columnToLetter } from "./a1.js";
import { LEAVE_RECORD_HEADERS } from "./googleSheets.js";

const DATE_RE = /(?:(\d{4})[/-])?(\d{1,2})[/-](\d{1,2})(?:\s*[-~到至]\s*(?:(\d{4})[/-])?(\d{1,2})[/-](\d{1,2}))?/;
const SHORT_RANGE_RE = /(?:(\d{4})[/-])?(\d{1,2})[/-](\d{1,2})\.(\d{1,2})/;
const TIME_RE = /(\d{1,2})(?::(\d{2}))?\s*[-~到至]\s*(\d{1,2})(?::(\d{2}))?/;
const HOURS_RE = /(\d+(?:\.\d+)?)\s*(?:小時|H|h)/;
const ALL_DAY_RE = /全天|整天/;

function pad2(value) {
  return String(value).padStart(2, "0");
}

function formatDate(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function formatSheetDate(dateText) {
  const date = new Date(`${dateText}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function datesBetween(startDate, endDate) {
  const output = [];
  const current = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);

  while (!Number.isNaN(current.getTime()) && current <= end) {
    output.push(formatDate(current));
    current.setDate(current.getDate() + 1);
  }
  return output;
}

function nowText(timeZone) {
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .format(new Date())
    .replace(/\//g, "-");
}

function monthStartEnd(now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return [formatDate(start), formatDate(end)];
}

function parseDateRange(text, now = new Date()) {
  const shortMatch = text.match(SHORT_RANGE_RE);
  if (shortMatch) {
    const year = Number(shortMatch[1] || now.getFullYear());
    const month = Number(shortMatch[2]);
    const startDay = Number(shortMatch[3]);
    const endDay = Number(shortMatch[4]);
    const start = new Date(year, month - 1, startDay);
    const end = new Date(year, month - 1, endDay);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return null;

    return {
      startDate: formatDate(start),
      endDate: formatDate(end),
      raw: shortMatch[0],
    };
  }

  const match = text.match(DATE_RE);
  if (!match) return null;

  const startYear = Number(match[1] || now.getFullYear());
  const startMonth = Number(match[2]);
  const startDay = Number(match[3]);
  const endYear = Number(match[4] || startYear);
  const endMonth = Number(match[5] || startMonth);
  const endDay = Number(match[6] || startDay);

  const start = new Date(startYear, startMonth - 1, startDay);
  const end = new Date(endYear, endMonth - 1, endDay);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return null;

  return {
    startDate: formatDate(start),
    endDate: formatDate(end),
    raw: match[0],
  };
}

function parseTimeRange(text, { defaultFullDayHours, breakHoursForFullShift }) {
  if (ALL_DAY_RE.test(text)) {
    return {
      startTime: "全天",
      endTime: "全天",
      hours: defaultFullDayHours,
      raw: text.match(ALL_DAY_RE)[0],
    };
  }

  const match = text.match(TIME_RE);
  if (!match) {
    const hoursMatch = text.match(HOURS_RE);
    if (hoursMatch) {
      return {
        startTime: "未指定",
        endTime: "未指定",
        hours: Number(hoursMatch[1]),
        raw: hoursMatch[0],
      };
    }

    return {
      startTime: "全天",
      endTime: "全天",
      hours: defaultFullDayHours,
      raw: "",
    };
  }

  const startHour = Number(match[1]);
  const startMinute = Number(match[2] || 0);
  const endHour = Number(match[3]);
  const endMinute = Number(match[4] || 0);
  const startTotal = startHour * 60 + startMinute;
  let endTotal = endHour * 60 + endMinute;
  if (endTotal <= startTotal) endTotal += 24 * 60;
  const rawHours = (endTotal - startTotal) / 60;
  const breakHours =
    rawHours >= defaultFullDayHours + breakHoursForFullShift
      ? breakHoursForFullShift
      : 0;

  return {
    startTime: `${pad2(startHour)}:${pad2(startMinute)}`,
    endTime: `${pad2(endHour)}:${pad2(endMinute)}`,
    hours: Math.max(0, Math.round((rawHours - breakHours) * 10) / 10),
    raw: match[0],
  };
}

function normalizeWorkerId(workerId) {
  return String(workerId || "").trim().toUpperCase();
}

function uniqueWorkerIds(workerIds) {
  return [...new Set(workerIds.map(normalizeWorkerId).filter(Boolean))];
}

function cleanReason(text, parts) {
  let reason = text;
  for (const part of parts.filter(Boolean)) {
    reason = reason.replace(part, " ");
  }
  return reason.replace(/\s+/g, " ").trim() || "未填寫";
}

function indexHeaders(headers) {
  const output = {};
  headers.forEach((header, index) => {
    output[String(header).trim()] = index;
  });
  return output;
}

function findHeaderRow(rows, requiredHeader) {
  return rows.findIndex((row) => row.some((cell) => String(cell || "").trim() === requiredHeader));
}

export class LeaveService {
  constructor({ sheetsClient, adminSheetsClient, driveClient, config }) {
    this.sheets = sheetsClient;
    this.adminSheets = adminSheetsClient;
    this.drive = driveClient;
    this.config = config;
    this.pendingSickLeaves = new Map();
  }

  async ensureSheets() {
    await this.sheets.ensureSheet(this.config.sheets.leaveRecordSheetName, LEAVE_RECORD_HEADERS);
  }

  parseRequest(text, now = new Date()) {
    const workerMatches = [...text.matchAll(new RegExp(this.config.rules.workerIdPattern.source, "gi"))];
    if (workerMatches.length === 0) {
      return { type: "invalid", reason: "請輸入工號，例如：P0216 病假 6/3 08:00-20:00 發燒" };
    }

    const workerIds = uniqueWorkerIds(workerMatches.map((match) => match[0]));
    const workerId = workerIds[0];
    const dateRange = parseDateRange(text, now);
    if (!dateRange) return { type: "invalid", reason: "請輸入請假日期，例如：6/3 或 6/3-6/4" };

    const leaveType = [
      "特休",
      "喪假",
      "婚假",
      "病假",
      "事假",
      "公假",
      "生理假",
      "家庭照顧假",
      "產檢假",
      "陪產假",
    ].find((item) => text.includes(item));
    if (!leaveType) return { type: "invalid", reason: "請輸入假別，例如：病假、事假、公假、生理假" };

    if (this.config.rules.excludedLeaveTypes.includes(leaveType)) {
      return { type: "invalid", reason: `${leaveType} 不在此請假系統申請，請使用原本流程。` };
    }

    const timeRange = parseTimeRange(text, {
      defaultFullDayHours: this.config.rules.defaultFullDayHours,
      breakHoursForFullShift: this.config.rules.breakHoursForFullShift || 0,
    });
    const reason = cleanReason(text, [...workerIds, leaveType, dateRange.raw, timeRange.raw]);

    return {
      type: "leave",
      workerId,
      workerIds,
      leaveType,
      ...dateRange,
      ...timeRange,
      reason,
    };
  }

  async findEmployee(workerId) {
    const rows = await this.sheets.getValues(`${quoteSheetName(this.config.sheets.employeeSheetName)}!A1:Z500`);
    if (rows.length === 0) return null;

    const headerRowIndex = findHeaderRow(rows, "工號");
    if (headerRowIndex === -1) return null;

    const headerIndex = indexHeaders(rows[headerRowIndex]);
    const idCol = headerIndex["工號"] ?? headerIndex["員工編號"] ?? 0;
    const nameCol = headerIndex["姓名"] ?? 1;
    const teamCol = headerIndex["部門/班別"] ?? headerIndex["班別"] ?? headerIndex["部門"];
    const roleCol = 0;

    for (const row of rows.slice(headerRowIndex + 1)) {
      if (normalizeWorkerId(row[idCol]) === workerId) {
        return {
          workerId,
          name: row[nameCol] || "",
          team: teamCol === undefined ? row[roleCol] || "" : row[teamCol] || "",
        };
      }
    }
    return null;
  }

  async debugFindEmployee(workerId) {
    const rows = await this.sheets.getValues(`${quoteSheetName(this.config.sheets.employeeSheetName)}!A1:Z20`);
    const headerRowIndex = findHeaderRow(rows, "工號");
    const employee = await this.findEmployee(workerId);

    return [
      `人員分頁：${this.config.sheets.employeeSheetName}`,
      `讀取列數：${rows.length}`,
      `工號標題列：${headerRowIndex === -1 ? "找不到" : headerRowIndex + 1}`,
      `查詢工號：${workerId}`,
      employee ? `結果：${employee.workerId} ${employee.name || ""} ${employee.team || ""}` : "結果：找不到",
    ].join("\n");
  }

  async markLeaveOnEmployeeSheet(request) {
    const rows = await this.sheets.getValues(`${quoteSheetName(this.config.sheets.employeeSheetName)}!A1:AZ500`);
    if (rows.length === 0) {
      return { updated: [], skipped: datesBetween(request.startDate, request.endDate) };
    }

    const headerRowIndex = findHeaderRow(rows, "工號");
    if (headerRowIndex === -1) {
      return { updated: [], skipped: datesBetween(request.startDate, request.endDate) };
    }

    const headerIndex = indexHeaders(rows[headerRowIndex]);
    const idCol = headerIndex["工號"] ?? headerIndex["員工編號"] ?? 0;
    const employeeRowIndex = rows.findIndex(
      (row, index) => index > headerRowIndex && normalizeWorkerId(row[idCol]) === request.workerId,
    );
    if (employeeRowIndex === -1) {
      return { updated: [], skipped: datesBetween(request.startDate, request.endDate) };
    }

    const dateColumns = new Map();
    rows[headerRowIndex].forEach((cell, index) => {
      const label = String(cell || "").trim();
      if (label) dateColumns.set(label, index);
    });

    const updated = [];
    const skipped = [];
    const formatRanges = [];

    for (const dateText of datesBetween(request.startDate, request.endDate)) {
      const sheetDate = formatSheetDate(dateText);
      const colIndex = dateColumns.get(sheetDate);
      if (colIndex === undefined) {
        skipped.push(dateText);
        continue;
      }

      const currentValue = String(rows[employeeRowIndex]?.[colIndex] || "").trim();
      if (currentValue.toUpperCase() !== "N1" && currentValue !== request.leaveType) {
        skipped.push(dateText);
        continue;
      }

      const colLetter = columnToLetter(colIndex);
      if (currentValue !== request.leaveType) {
        await this.sheets.updateValues(
          `${quoteSheetName(this.config.sheets.employeeSheetName)}!${colLetter}${employeeRowIndex + 1}`,
          [[request.leaveType]],
        );
      }
      updated.push(dateText);
      formatRanges.push({
        startRowIndex: employeeRowIndex,
        endRowIndex: employeeRowIndex + 1,
        startColumnIndex: colIndex,
        endColumnIndex: colIndex + 1,
      });
    }

    if (formatRanges.length > 0 && typeof this.sheets.formatCells === "function") {
      await this.sheets.formatCells(this.config.sheets.employeeSheetName, formatRanges, {
        backgroundColor: { red: 1, green: 0.92, blue: 0.2 },
        textFormat: {
          foregroundColor: { red: 0.85, green: 0, blue: 0 },
          bold: true,
        },
      });
    }

    return { updated, skipped };
  }

  buildRecord({ request, source, employee, proofLink = "", status = "已送出", note = "" }) {
    return [
      nowText(this.config.timeZone),
      source.userId || "",
      employee?.workerId || request.workerId,
      employee?.name || "",
      employee?.team || "",
      request.leaveType,
      request.startDate,
      request.endDate,
      request.startTime,
      request.endTime,
      request.hours,
      request.reason,
      proofLink,
      status,
      note,
    ];
  }

  async appendLeaveRecord(record) {
    await this.ensureSheets();
    await this.sheets.appendValues(`${quoteSheetName(this.config.sheets.leaveRecordSheetName)}!A:O`, [record]);
  }

  setPending(sourceUserId, payload) {
    const expiresAt = Date.now() + this.config.rules.pendingSickLeaveMinutes * 60 * 1000;
    this.pendingSickLeaves.set(sourceUserId, { ...payload, expiresAt });
  }

  getPending(sourceUserId) {
    const pending = this.pendingSickLeaves.get(sourceUserId);
    if (!pending) return null;
    if (pending.expiresAt < Date.now()) {
      this.pendingSickLeaves.delete(sourceUserId);
      return null;
    }
    return pending;
  }

  async handleTextMessage({ text, source }) {
    const trimmed = String(text || "").trim();
    if (!trimmed) return null;

    if (trimmed === "我的ID") {
      return source.userId
        ? `你的 LINE userId：\n${source.userId}`
        : "這則訊息沒有帶到 LINE userId。";
    }

    if (trimmed === "說明" || trimmed === "help") return this.helpText();
    if (trimmed.startsWith("檢查工號")) {
      const workerMatch = trimmed.match(this.config.rules.workerIdPattern);
      if (!workerMatch) return "請輸入：檢查工號 P0949";
      return this.debugFindEmployee(normalizeWorkerId(workerMatch[0]));
    }
    if (trimmed.startsWith("統計") || trimmed.startsWith("查詢")) {
      return this.handleAdminCommand({ text: trimmed, source });
    }

    const request = this.parseRequest(trimmed);
    if (request.type === "invalid") return request.reason;

    const employeeResults = await Promise.all(
      request.workerIds.map(async (workerId) => ({
        workerId,
        employee: await this.findEmployee(workerId),
      })),
    );
    const missingWorkerIds = employeeResults
      .filter((item) => !item.employee)
      .map((item) => item.workerId);
    if (missingWorkerIds.length > 0) {
      return `找不到工號 ${missingWorkerIds.join("、")}，請確認人員名單是否有這位同仁。`;
    }
    const employees = employeeResults.map((item) => item.employee);

    if (request.leaveType === "病假") {
      this.setPending(source.userId, { request, employees });
      return [
        `已收到 ${employees.map((employee) => employee.name || employee.workerId).join("、")} 的病假申請。`,
        "請在 30 分鐘內直接上傳診斷證明圖片，我收到圖片後才會寫入請假紀錄。",
      ].join("\n");
    }

    const markResults = [];
    for (const employee of employees) {
      const employeeRequest = { ...request, workerId: employee.workerId };
      const record = this.buildRecord({ request: employeeRequest, source, employee });
      await this.appendLeaveRecord(record);
      markResults.push({
        workerId: employee.workerId,
        name: employee.name,
        result: await this.markLeaveOnEmployeeSheet(employeeRequest),
      });
    }

    return [
      "請假申請已紀錄。",
      ...employees.map((employee) => `${employee.workerId} ${employee.name || ""}`),
      `${request.leaveType} ${request.startDate}${request.endDate !== request.startDate ? ` 至 ${request.endDate}` : ""}`,
      `${request.startTime}-${request.endTime}，${request.hours} 小時`,
      this.formatMarkResults(markResults),
    ].join("\n");
  }

  async handleImageMessage({ source, content }) {
    const pending = this.getPending(source.userId);
    if (!pending) return "目前沒有等待診斷證明的病假申請。請先輸入請假內容，再上傳圖片。";
    if (!this.drive) return "系統尚未設定 Google Drive 資料夾，暫時無法上傳診斷證明。";

    const ext = content.mimeType.includes("png") ? "png" : "jpg";
    const fileName = `診斷證明_${pending.request.workerIds.join("_")}_${pending.request.startDate}.${ext}`;
    const uploaded = await this.drive.uploadFile({
      name: fileName,
      mimeType: content.mimeType,
      buffer: content.buffer,
    });
    const proofLink = uploaded.webViewLink || uploaded.webContentLink || "";

    const markResults = [];
    for (const employee of pending.employees) {
      const employeeRequest = { ...pending.request, workerId: employee.workerId };
      const record = this.buildRecord({
        request: employeeRequest,
        source,
        employee,
        proofLink,
      });
      await this.appendLeaveRecord(record);
      markResults.push({
        workerId: employee.workerId,
        name: employee.name,
        result: await this.markLeaveOnEmployeeSheet(employeeRequest),
      });
    }
    this.pendingSickLeaves.delete(source.userId);

    return [
      "病假申請與診斷證明已紀錄。",
      ...pending.employees.map((employee) => `${employee.workerId} ${employee.name || ""}`),
      `${pending.request.startDate}${pending.request.endDate !== pending.request.startDate ? ` 至 ${pending.request.endDate}` : ""}`,
      this.formatMarkResults(markResults),
    ].join("\n");
  }

  formatMarkResults(markResults) {
    return markResults
      .map(({ workerId, name, result }) => {
        const text = this.formatMarkResult(result);
        return text ? `${workerId} ${name || ""}\n${text}` : "";
      })
      .filter(Boolean)
      .join("\n");
  }

  formatMarkResult(markResult) {
    if (!markResult) return "";
    const lines = [];
    if (markResult.updated.length > 0) {
      lines.push(`已同步排班表：${markResult.updated.join("、")}`);
    }
    if (markResult.skipped.length > 0) {
      lines.push(`未更新日期：${markResult.skipped.join("、")}（找不到日期或原格不是 N1）`);
    }
    return lines.join("\n");
  }

  async isAdmin(userId) {
    if (this.config.rules.adminLineUserIds.includes(userId)) return true;
    if (!this.adminSheets) return false;

    const rows = await this.adminSheets.getValues(`${quoteSheetName(this.config.sheets.adminSheetName)}!A1:Z500`);
    if (rows.length === 0) return false;
    const headerIndex = indexHeaders(rows[0]);
    const userCol = headerIndex["LINE使用者ID"] ?? 0;
    const enabledCol = headerIndex["啟用"];

    return rows.slice(1).some((row) => {
      const enabled = enabledCol === undefined ? true : String(row[enabledCol] || "").trim() !== "否";
      return String(row[userCol] || "").trim() === userId && enabled;
    });
  }

  async handleAdminCommand({ text, source }) {
    if (!(await this.isAdmin(source.userId))) return "你目前沒有管理查詢權限。";

    const rows = await this.sheets.getValues(`${quoteSheetName(this.config.sheets.leaveRecordSheetName)}!A1:O2000`);
    const records = rows.slice(1);
    const headerIndex = indexHeaders(rows[0] || LEAVE_RECORD_HEADERS);

    if (text === "統計 本月") {
      const [start, end] = monthStartEnd();
      const filtered = records.filter((row) => row[headerIndex["開始日期"]] >= start && row[headerIndex["開始日期"]] <= end);
      return this.summarizeRecords(filtered, `本月請假統計`);
    }

    const workerMatch = text.match(this.config.rules.workerIdPattern);
    if (text.startsWith("統計") && workerMatch) {
      const workerId = normalizeWorkerId(workerMatch[0]);
      const filtered = records.filter((row) => normalizeWorkerId(row[headerIndex["工號"]]) === workerId);
      return this.summarizeRecords(filtered, `${workerId} 請假統計`);
    }

    if (text.startsWith("查詢")) {
      const dateRange = parseDateRange(text);
      if (!dateRange) return "請輸入查詢日期，例如：查詢 6/3";
      const filtered = records.filter(
        (row) => row[headerIndex["開始日期"]] <= dateRange.startDate && row[headerIndex["結束日期"]] >= dateRange.startDate,
      );
      if (filtered.length === 0) return `${dateRange.startDate} 沒有請假紀錄。`;
      return [
        `${dateRange.startDate} 請假紀錄：`,
        ...filtered.slice(0, 20).map((row) =>
          `${row[headerIndex["工號"]]} ${row[headerIndex["姓名"]]} ${row[headerIndex["假別"]]} ${row[headerIndex["開始時間"]]}-${row[headerIndex["結束時間"]]}`,
        ),
      ].join("\n");
    }

    return "管理指令：統計 本月、統計 P0216、查詢 6/3";
  }

  summarizeRecords(records, title) {
    if (records.length === 0) return `${title}：目前沒有紀錄。`;
    const byType = new Map();
    let hours = 0;
    for (const row of records) {
      const type = row[5] || "未分類";
      byType.set(type, (byType.get(type) || 0) + 1);
      hours += Number(row[10] || 0);
    }
    return [
      `${title}`,
      `筆數：${records.length}`,
      `時數：${Math.round(hours * 10) / 10}`,
      ...[...byType.entries()].map(([type, count]) => `${type}：${count} 筆`),
    ].join("\n");
  }

  helpText() {
    return [
      "請假格式：",
      "P0216 事假 6/3 08:00-20:00 家中有事",
      "P0216 病假 6/3 全天 發燒",
      "病假需在文字申請後上傳診斷證明圖片。",
    ].join("\n");
  }
}
