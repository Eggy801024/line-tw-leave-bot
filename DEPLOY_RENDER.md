# Render 部署步驟

## 1. GitHub

把 `請假` 資料夾內的內容上傳到 GitHub repository 根目錄。

不要上傳：

```text
.env
.tmp
.codex_pydeps
```

## 2. Render Web Service

設定：

```text
Runtime: Node
Build Command: npm install
Start Command: node src/server.js
Health Check Path: /
```

## 3. Environment Variables

必填：

```text
LINE_CHANNEL_SECRET
LINE_CHANNEL_ACCESS_TOKEN
GOOGLE_SPREADSHEET_ID
GOOGLE_SERVICE_ACCOUNT_EMAIL
GOOGLE_PRIVATE_KEY
DATABASE_URL
WEB_ADMIN_PASSWORD
```

病假證明使用 Apps Script 上傳時再填：

```text
DRIVE_UPLOAD_WEB_APP_URL
DRIVE_UPLOAD_SECRET
```

`DATABASE_URL` 建議填 Render PostgreSQL 的 Internal Database URL。

`WEB_ADMIN_PASSWORD` 是主管 Web App 登入密碼，自己設定一組即可。

## 4. 部署後網址

LINE webhook：

```text
https://你的-render網址.onrender.com/webhook
```

主管後台：

```text
https://你的-render網址.onrender.com/app
```

## 5. 測試

LINE 測試：

```text
P0949 6/16 事假
```

Web App 測試：

1. 打開 `/app`。
2. 輸入 `WEB_ADMIN_PASSWORD`。
3. 用工號 `P0949` 查詢。
4. 確認可以看到剛剛那筆請假紀錄。
