import assert from "node:assert/strict";
import test from "node:test";
import { LeaveService } from "../src/leaveService.js";

class FakeSheets {
  constructor() {
    this.rows = [];
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

    return [
      ["工號", "姓名", "部門/班別"],
      ["P0216", "王小明", "A班"],
    ];
  }

  async appendValues(_range, rows) {
    this.rows.push(...rows);
  }
}

class FakeDrive {
  async uploadFile() {
    return { webViewLink: "https://drive.google.com/file/d/test" };
  }
}

function makeService(extra = {}) {
  const sheets = new FakeSheets();
  const service = new LeaveService({
    sheetsClient: sheets,
    adminSheetsClient: null,
    driveClient: extra.drive ?? new FakeDrive(),
    config: {
      timeZone: "Asia/Taipei",
      sheets: {
        leaveRecordSheetName: "請假申請紀錄",
        employeeSheetName: "請假",
        adminSheetName: "主管權限",
      },
      rules: {
        workerIdPattern: /[A-Z]{1,3}\d{3,4}/i,
        defaultFullDayHours: 12,
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
  assert.equal(sheets.rows[0][10], 12);
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
