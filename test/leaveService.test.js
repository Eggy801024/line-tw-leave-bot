import assert from "node:assert/strict";
import test from "node:test";
import { LeaveService } from "../src/leaveService.js";

class FakeSheets {
  constructor({ twoRowEmployeeHeader = false } = {}) {
    this.rows = [];
    this.twoRowEmployeeHeader = twoRowEmployeeHeader;
    this.updatedValues = [];
    this.formattedRanges = [];
  }

  async ensureSheet() {}

  async getValues(range) {
    if (range.includes("請假申請紀錄")) {
      return [
        [
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
        ],
        ...this.rows,
      ];
    }

    if (range.includes("'婷芬班'")) {
      return [
        ["", "工號", "姓名", "班別", "班別\n代號", "A班", "A班"],
        ["", "", "", "", "", "6/16", "6/17"],
        ["主任", "P0068", "胡婷芬", "日A班", "A1", "D1"],
        ["", "V0001", "外籍同仁", "外籍A班", "AN3", "AN3", "AD3"],
      ];
    }

    if (range.includes("'俊志班'")) {
      return [
        ["", "工號", "姓名", "班別", "班別\n代號", "A班"],
        ["", "", "", "", "", "6/16"],
        ["組長", "P0949", "陳世宏", "夜A班", "A1", "N1"],
      ];
    }

    if (range.includes("'翊展班'")) {
      return [
        ["", "工號", "姓名", "班別", "班別\n代號", "B班", "B班"],
        ["", "", "", "", "", "6/14", "6/16"],
        ["", "P0805", "測試夜班", "夜B班", "B1", "N1", "N1"],
      ];
    }

    if (this.twoRowEmployeeHeader) {
      return [
        ["", "", "", "B班", "B班", "A班"],
        ["", "工號", "姓名", "6/1", "6/2", "6/3", "6/16", "6/17"],
        ["組長", "P0949", "陳世宏", "例", "", "N1", "N1"],
        ["", "P0216", "潘鳳翎", "例", "", "N1", "休", "事假"],
        ["", "P0218", "鍾家豪", "例", "", "N1", "N1"],
      ];
    }

    return [
      ["工號", "姓名", "部門/班別"],
      ["P0216", "王小明", "A班"],
    ];
  }

  async appendValues(_range, rows) {
    this.rows.push(...rows);
  }

  async updateValues(range, values) {
    this.updatedValues.push({ range, values });
  }

  async formatCells(sheetName, ranges, userEnteredFormat) {
    this.formattedRanges.push({ sheetName, ranges, userEnteredFormat });
  }
}

class FakeDrive {
  async uploadFile() {
    return { webViewLink: "https://drive.google.com/file/d/test" };
  }
}

function makeService(extra = {}) {
  const sheets = new FakeSheets(extra.sheetsOptions);
  const service = new LeaveService({
    sheetsClient: sheets,
    adminSheetsClient: null,
    driveClient: extra.drive ?? new FakeDrive(),
    config: {
      timeZone: "Asia/Taipei",
      sheets: {
        leaveRecordSheetName: "請假申請紀錄",
        employeeSheetName: "請假",
        employeeSheetNames: extra.employeeSheetNames || [],
        adminSheetName: "主管權限",
      },
      rules: {
        workerIdPattern: /(?:[A-Z]{1,3}\d{3,4}|\d{5})/i,
        defaultFullDayHours: 10,
        breakHoursForFullShift: 2,
        eligibleShiftMarks: ["N1", "D1", "AN3", "AD3"],
        pendingSickLeaveMinutes: 30,
        adminLineUserIds: [],
        excludedLeaveTypes: ["特休", "喪假", "婚假"],
      },
    },
  });
  return { service, sheets };
}

test("records non-sick leave immediately", async () => {
  const { service, sheets } = makeService();
  const reply = await service.handleTextMessage({
    text: "P0216 事假 6/3 08:00-20:00 家中有事",
    source: { userId: "U1" },
  });

  assert.match(reply, /請假申請已紀錄/);
  assert.equal(sheets.rows.length, 1);
  assert.equal(sheets.rows[0][2], "P0216");
  assert.equal(sheets.rows[0][5], "事假");
  assert.equal(sheets.rows[0][10], 10);
});

test("waits for image proof before recording sick leave", async () => {
  const { service, sheets } = makeService();
  const reply = await service.handleTextMessage({
    text: "P0216 病假 6/3 全天 發燒",
    source: { userId: "U1" },
  });

  assert.match(reply, /請在 30 分鐘內直接上傳診斷證明圖片/);
  assert.equal(sheets.rows.length, 0);

  const imageReply = await service.handleImageMessage({
    source: { userId: "U1" },
    content: { mimeType: "image/jpeg", buffer: Buffer.from("fake") },
  });

  assert.match(imageReply, /病假申請與診斷證明已紀錄/);
  assert.equal(sheets.rows.length, 1);
  assert.equal(sheets.rows[0][5], "病假");
  assert.equal(sheets.rows[0][12], "https://drive.google.com/file/d/test");
});

test("rejects leave types handled by other workflows", () => {
  const { service } = makeService();
  const request = service.parseRequest("P0216 特休 6/3 全天");
  assert.equal(request.type, "invalid");
  assert.match(request.reason, /不在此請假系統申請/);
});

test("parses short continuous date range", () => {
  const { service } = makeService();
  const request = service.parseRequest("P0216 事假 6/3.4 全天 家中有事", new Date(2026, 4, 31));
  assert.equal(request.type, "leave");
  assert.equal(request.startDate, "2026-06-03");
  assert.equal(request.endDate, "2026-06-04");
});

test("returns LINE user id", async () => {
  const { service } = makeService();
  const reply = await service.handleTextMessage({
    text: "我的ID",
    source: { userId: "Umanager" },
  });

  assert.match(reply, /Umanager/);
});

test("returns welcome text", () => {
  const { service } = makeService();
  const reply = service.getWelcomeText();

  assert.match(reply, /歡迎使用元晶太陽能請假系統/);
  assert.match(reply, /P1234 6\/15 事假 私事代辦/);
  assert.match(reply, /若請病假請於30分鐘內附上診斷證明/);
});

test("reports manager permission command", async () => {
  const { service } = makeService();
  service.config.rules.adminLineUserIds = ["Umanager"];

  const reply = await service.handleTextMessage({
    text: "主管權限",
    source: { userId: "Umanager" },
  });

  assert.match(reply, /你已有主管查詢權限/);
  assert.match(reply, /統計 本月/);
});

test("rejects manager permission command without admin id", async () => {
  const { service } = makeService();
  const reply = await service.handleTextMessage({
    text: "主管權限",
    source: { userId: "Uworker" },
  });

  assert.match(reply, /沒有管理查詢權限/);
});

test("finds employees when 工號 header is on the second row", async () => {
  const { service, sheets } = makeService({ sheetsOptions: { twoRowEmployeeHeader: true } });
  const reply = await service.handleTextMessage({
    text: "P0949 6/16 事假",
    source: { userId: "U1" },
  });

  assert.match(reply, /請假申請已紀錄/);
  assert.equal(sheets.rows.length, 1);
  assert.equal(sheets.rows[0][2], "P0949");
  assert.equal(sheets.rows[0][3], "陳世宏");
  assert.equal(sheets.rows[0][4], "請假");
});

test("debug command reports employee lookup details", async () => {
  const { service } = makeService({ sheetsOptions: { twoRowEmployeeHeader: true } });
  const reply = await service.handleTextMessage({
    text: "檢查工號 P0949",
    source: { userId: "U1" },
  });

  assert.match(reply, /人員分頁：請假/);
  assert.match(reply, /請假：列數 5，工號標題列 2/);
  assert.match(reply, /結果：P0949 陳世宏 請假/);
});

test("finds employees across class sheets and records class name", async () => {
  const { service, sheets } = makeService({ employeeSheetNames: ["婷芬班", "俊志班"] });
  const reply = await service.handleTextMessage({
    text: "P0949 6/16 事假",
    source: { userId: "U1" },
  });

  assert.match(reply, /P0949 陳世宏/);
  assert.equal(sheets.rows.length, 1);
  assert.equal(sheets.rows[0][4], "俊志班");
  assert.equal(sheets.updatedValues[0].range, "'俊志班'!F3");
});

test("marks day shift D1 cells as leave type", async () => {
  const { service, sheets } = makeService({ employeeSheetNames: ["婷芬班", "俊志班"] });
  const reply = await service.handleTextMessage({
    text: "P0068 6/16 事假",
    source: { userId: "U1" },
  });

  assert.match(reply, /已同步排班表：2026-06-16/);
  assert.equal(sheets.rows[0][4], "婷芬班");
  assert.equal(sheets.updatedValues[0].range, "'婷芬班'!F3");
  assert.deepEqual(sheets.updatedValues[0].values, [["事假"]]);
});

test("uses day shift schedule when no time is provided", async () => {
  const { service, sheets } = makeService({ employeeSheetNames: ["婷芬班", "俊志班"] });
  await service.handleTextMessage({
    text: "P0068 6/16 生理假",
    source: { userId: "U1" },
  });

  assert.equal(sheets.rows[0][6], "'2026-06-16");
  assert.equal(sheets.rows[0][7], "'2026-06-16");
  assert.equal(sheets.rows[0][8], "'07:30");
  assert.equal(sheets.rows[0][9], "'19:30");
  assert.equal(sheets.rows[0][10], 10);
  assert.equal(sheets.updatedValues[0].range, "'婷芬班'!F3");
});

test("uses night shift schedule when no time is provided", async () => {
  const { service, sheets } = makeService({ employeeSheetNames: ["婷芬班", "俊志班"] });
  await service.handleTextMessage({
    text: "P0949 6/16 生理假",
    source: { userId: "U1" },
  });

  assert.equal(sheets.rows[0][6], "'2026-06-16");
  assert.equal(sheets.rows[0][7], "'2026-06-17");
  assert.equal(sheets.rows[0][8], "'19:30");
  assert.equal(sheets.rows[0][9], "'07:30");
  assert.equal(sheets.rows[0][10], 10);
  assert.equal(sheets.updatedValues[0].range, "'俊志班'!F3");
});

test("does not parse hyphen date as time range", async () => {
  const { service, sheets } = makeService({ employeeSheetNames: ["翊展班"] });
  await service.handleTextMessage({
    text: "P0805 6-14 事假 家裡有事",
    source: { userId: "U1" },
  });

  assert.equal(sheets.rows[0][6], "'2026-06-14");
  assert.equal(sheets.rows[0][7], "'2026-06-15");
  assert.equal(sheets.rows[0][8], "'19:30");
  assert.equal(sheets.rows[0][9], "'07:30");
  assert.equal(sheets.rows[0][10], 10);
  assert.equal(sheets.updatedValues[0].range, "'翊展班'!F3");
});

test("marks foreign shift AN3 and AD3 cells as leave type", async () => {
  const { service, sheets } = makeService({ employeeSheetNames: ["婷芬班", "俊志班"] });
  const reply = await service.handleTextMessage({
    text: "V0001 6/16.17 事假",
    source: { userId: "U1" },
  });

  assert.match(reply, /已同步排班表：2026-06-16、2026-06-17/);
  assert.equal(sheets.rows[0][4], "婷芬班");
  assert.equal(sheets.updatedValues.length, 2);
  assert.equal(sheets.updatedValues[0].range, "'婷芬班'!F4");
  assert.equal(sheets.updatedValues[1].range, "'婷芬班'!G4");
});

test("parses five digit employee ids", () => {
  const { service } = makeService();
  const request = service.parseRequest("02693 6/16 事假", new Date(2026, 4, 31));

  assert.equal(request.type, "leave");
  assert.equal(request.workerId, "02693");
});

test("marks leave type on N1 date cell with formatting", async () => {
  const { service, sheets } = makeService({ sheetsOptions: { twoRowEmployeeHeader: true } });
  const reply = await service.handleTextMessage({
    text: "P0949 6/16 事假",
    source: { userId: "U1" },
  });

  assert.match(reply, /已同步排班表：2026-06-16/);
  assert.equal(sheets.updatedValues.length, 1);
  assert.equal(sheets.updatedValues[0].range, "'請假'!G3");
  assert.deepEqual(sheets.updatedValues[0].values, [["事假"]]);
  assert.equal(sheets.formattedRanges.length, 1);
  assert.equal(sheets.formattedRanges[0].ranges[0].startRowIndex, 2);
  assert.equal(sheets.formattedRanges[0].ranges[0].startColumnIndex, 6);
});

test("does not overwrite date cell when original value is not N1", async () => {
  const { service, sheets } = makeService({ sheetsOptions: { twoRowEmployeeHeader: true } });
  const reply = await service.handleTextMessage({
    text: "P0216 6/16 事假",
    source: { userId: "U1" },
  });

  assert.match(reply, /未更新日期：2026-06-16/);
  assert.equal(sheets.updatedValues.length, 0);
  assert.equal(sheets.formattedRanges.length, 0);
});

test("formats existing matching leave type cell", async () => {
  const { service, sheets } = makeService({ sheetsOptions: { twoRowEmployeeHeader: true } });
  const reply = await service.handleTextMessage({
    text: "P0216 6/17 事假",
    source: { userId: "U1" },
  });

  assert.match(reply, /已同步排班表：2026-06-17/);
  assert.equal(sheets.updatedValues.length, 0);
  assert.equal(sheets.formattedRanges.length, 1);
  assert.equal(sheets.formattedRanges[0].ranges[0].startRowIndex, 3);
  assert.equal(sheets.formattedRanges[0].ranges[0].startColumnIndex, 7);
});

test("records multiple employees from one LINE sender", async () => {
  const { service, sheets } = makeService({ sheetsOptions: { twoRowEmployeeHeader: true } });
  const reply = await service.handleTextMessage({
    text: "P0216/P0218 6/16 事假",
    source: { userId: "Ucouple" },
  });

  assert.match(reply, /請假申請已紀錄/);
  assert.equal(sheets.rows.length, 2);
  assert.equal(sheets.rows[0][1], "Ucouple");
  assert.equal(sheets.rows[1][1], "Ucouple");
  assert.equal(sheets.rows[0][2], "P0216");
  assert.equal(sheets.rows[1][2], "P0218");
  assert.equal(sheets.updatedValues.length, 1);
  assert.equal(sheets.updatedValues[0].range, "'請假'!G5");
});

test("parses explicit leave hours without time range", () => {
  const { service } = makeService();
  const request = service.parseRequest("P0216 6/16 事假 4小時 家中有事", new Date(2026, 4, 31));

  assert.equal(request.type, "leave");
  assert.equal(request.hours, 4);
  assert.equal(request.startTime, "未指定");
  assert.equal(request.endTime, "未指定");
});

test("parses half-hour leave", () => {
  const { service } = makeService();
  const request = service.parseRequest("P0216 6/16 事假 0.5小時 睡過頭", new Date(2026, 4, 31));

  assert.equal(request.type, "leave");
  assert.equal(request.hours, 0.5);
});

test("deducts 2 break hours from full day shift ranges", () => {
  const { service } = makeService();
  const dayShift = service.parseRequest("P0216 6/16 事假 07:30-19:30", new Date(2026, 4, 31));
  const nightShift = service.parseRequest("P0216 6/16 事假 19:30-07:30", new Date(2026, 4, 31));

  assert.equal(dayShift.hours, 10);
  assert.equal(nightShift.hours, 10);
});
