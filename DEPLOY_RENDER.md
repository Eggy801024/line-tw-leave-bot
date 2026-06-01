# Render 部署

1. 建立新的 GitHub repository。
2. 將 `請假/` 資料夾內的檔案上傳到 repository 根目錄。
3. Render 建立 Web Service，連到此 repository。
4. Runtime 選 Node。
5. Start Command 使用：

```text
node src/server.js
```

6. Environment Variables 填入 `.env.example` 內的值。
7. 部署完成後到 LINE Developers 設定 Webhook URL：

```text
https://你的-render網址.onrender.com/webhook
```

8. 按 Verify，顯示 200 即成功。

注意：病假附件需要 `GOOGLE_DRIVE_FOLDER_ID`。請建立一個 Google Drive 資料夾，並把資料夾共用給同一個 Google service account，權限選編輯者。
