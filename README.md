# 元晶請假 LINE Bot

OP 直接在 LINE 輸入工號、日期、假別與事由，系統會同步寫入 Google Sheets，並同步新增到 PostgreSQL，供主管 Web App 查詢。

## 員工端 LINE 輸入格式

```text
P1234 6/15 事假 私事代辦
P1234 6/15 病假 發燒
P1234 6/15 0.5小時 睡過頭
P1234 6/15 07:30-19:30 事假 私事代辦
P1234/P5678 6/15 事假 家庭因素
```

規則：

- 病假需要在 30 分鐘內補上診斷證明圖片。
- 特休、喪假、婚假不由這支請假 Bot 處理。
- 早班預設 07:30-19:30，夜班預設 19:30-07:30。
- 一整班扣除 2 小時休息，請假時數預設為 10 小時。
- 若同一個 LINE 帳號幫多人請假，例如 `P0216/P0218 6/16 事假`，會用同一位傳訊者的 LINE ID 紀錄。

## 主管 Web App

部署後開啟：

```text
https://你的-render網址.onrender.com/app
```

功能：

- 用 `WEB_ADMIN_PASSWORD` 登入。
- 可依班級、假別、工號、日期區間查詢。
- 顯示請假筆數、請假時數、今日請假、班級統計、假別統計。
- 病假證明有連結時可直接點開。
- 可匯出 CSV。

目前登入方式是簡易後台密碼，後續可再升級成主管帳號與角色權限。

## PostgreSQL

資料庫 migration 順序：

```text
db/migrations/001_init.sql
db/migrations/002_updated_at_triggers.sql
db/migrations/003_leave_request_view.sql
```

已建立的主要資料表：

```text
teams
employees
employee_line_users
leave_types
leave_requests
leave_attachments
admins
audit_logs
```

`leave_request_view` 是 Web App 查詢用的 View。

## Render Environment Variables

Render 後台需要設定：

```text
LINE_CHANNEL_SECRET=
LINE_CHANNEL_ACCESS_TOKEN=
GOOGLE_SPREADSHEET_ID=1vuSGTwot3uKigxwYaWHb_EX93Jz5eJgYSeYSBMj3Ax0
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_PRIVATE_KEY=
DRIVE_UPLOAD_WEB_APP_URL=
DRIVE_UPLOAD_SECRET=
DATABASE_URL=
WEB_ADMIN_PASSWORD=
ADMIN_SPREADSHEET_ID=
ADMIN_SHEET_NAME=主管權限
ADMIN_LINE_USER_IDS=
TIME_ZONE=Asia/Taipei
LEAVE_RECORD_SHEET_NAME=請假申請紀錄
EMPLOYEE_SHEET_NAME=請假
EMPLOYEE_SHEET_NAMES=婷芬班,俊志班,美香班,翊展班
WORKER_ID_PATTERN=(?:[A-Z]{1,3}\d{3,4}|\d{5})
DEFAULT_FULL_DAY_HOURS=10
BREAK_HOURS_FOR_FULL_SHIFT=2
ELIGIBLE_SHIFT_MARKS=N1,D1,AN3,AD3
PENDING_SICK_LEAVE_MINUTES=30
```

`DATABASE_URL` 在 Render Web Service 裡建議使用 PostgreSQL 的 Internal Database URL。

## GitHub 上傳檔案

請把 `請假` 資料夾裡的專案內容上傳到 GitHub repository 根目錄，不要把 `.env`、`.tmp`、`.codex_pydeps` 上傳。

這次 Web App 需要包含：

```text
public/app.html
public/app.css
public/app.js
src/server.js
src/database.js
src/config.js
src/leaveService.js
package.json
render.yaml
.env.example
db/migrations/001_init.sql
db/migrations/002_updated_at_triggers.sql
db/migrations/003_leave_request_view.sql
db/README.md
test/leaveService.test.js
tools/apply_migrations.py
tools/export_employees_from_sheets.mjs
tools/import_employees_to_db.py
README.md
DEPLOY_RENDER.md
```

## Render 部署

- Build Command: `npm install`
- Start Command: `node src/server.js`
- Webhook URL: `https://你的-render網址.onrender.com/webhook`
- 主管後台 URL: `https://你的-render網址.onrender.com/app`

上傳 GitHub 後，如果 Render 沒有自動部署，就到 Render 點：

```text
Manual Deploy -> Deploy latest commit
```
