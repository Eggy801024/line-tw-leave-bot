# LINE 請假機器人

OP 可直接在 LINE 向機器人請假，系統會同步寫入 Google Sheets。病假需在申請後上傳診斷證明圖片，圖片會存到 Google Drive，連結會寫入請假紀錄。

## Google Sheets

主要表格 ID：

```text
1vuSGTwot3uKigxwYaWHb_EX93Jz5eJgYSeYSBMj3Ax0
```

需要分頁：

```text
婷芬班
俊志班
美香班
翊展班
請假申請紀錄
```

`請假申請紀錄` 欄位：

```text
申請時間
LINE使用者ID
工號
姓名
部門/班別
假別
開始日期
結束日期
開始時間
結束時間
請假時數
原因
診斷證明連結
狀態
備註
```

四個班級人員分頁建議欄位：

```text
工號
姓名
班別
班別代號
```

## OP 使用方式

```text
P0216 事假 6/3 08:00-20:00 家中有事
P0216 病假 6/3 全天 發燒
P0216 公假 6/3-6/4 全天 支援訓練
P0216 事假 6/3 4小時 家中有事
P0216 事假 6/3 0.5小時 睡過頭
P0216 事假 6/3 07:30-19:30 家中有事
P0216 事假 6/3 19:30-07:30 家中有事
P1491 生理假 6/14
P0216/P0218 事假 6/16 家中有事
```

沒有填時間或小時會依同仁班別自動帶入時間。日班/早班會記錄當日 `07:30-19:30`，夜班會記錄當日 `19:30` 到隔日 `07:30`。預設請假時數為 `DEFAULT_FULL_DAY_HOURS=10`，因為 12 小時班會扣 2 小時休息。也支援 `0.5小時` 這類小時數。若同一個 LINE 帳號替多位同仁請假，請用 `/` 分隔工號，系統會各自寫入一筆紀錄，`LINE使用者ID` 會記錄實際發訊息的人。

病假流程：

1. 先送文字申請。
2. 機器人回覆請上傳診斷證明。
3. 直接傳圖片。
4. 系統將圖片存到 Google Drive，並把連結寫入請假紀錄。

此系統不處理：

```text
特休
喪假
婚假
```

## 主管查詢

主管 LINE userId 可放在 `ADMIN_LINE_USER_IDS`，多位用逗號分隔。若要用另一份 Google Sheets 管理權限，填入：

```text
ADMIN_SPREADSHEET_ID=
ADMIN_SHEET_NAME=主管權限
```

主管權限分頁建議欄位：

```text
LINE使用者ID
姓名
職稱
權限
啟用
備註
```

主管指令：

```text
我的ID
統計 本月
統計 P0216
查詢 6/3
```

先用 `我的ID` 取得主管 LINE userId，再填入 Render 的 `ADMIN_LINE_USER_IDS`。

## Render 環境變數

```text
LINE_CHANNEL_SECRET=
LINE_CHANNEL_ACCESS_TOKEN=
GOOGLE_SPREADSHEET_ID=1vuSGTwot3uKigxwYaWHb_EX93Jz5eJgYSeYSBMj3Ax0
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_PRIVATE_KEY=
GOOGLE_DRIVE_FOLDER_ID=
ADMIN_SPREADSHEET_ID=
ADMIN_SHEET_NAME=主管權限
ADMIN_LINE_USER_IDS=
TIME_ZONE=Asia/Taipei
LEAVE_RECORD_SHEET_NAME=請假申請紀錄
EMPLOYEE_SHEET_NAMES=婷芬班,俊志班,美香班,翊展班
WORKER_ID_PATTERN=(?:[A-Z]{1,3}\d{3,4}|\d{5})
DEFAULT_FULL_DAY_HOURS=10
BREAK_HOURS_FOR_FULL_SHIFT=2
ELIGIBLE_SHIFT_MARKS=N1,D1,AN3,AD3
PENDING_SICK_LEAVE_MINUTES=30
```

Webhook URL：

```text
https://你的-render網址.onrender.com/webhook
```
