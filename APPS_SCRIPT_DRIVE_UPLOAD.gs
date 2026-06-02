const SICK_PROOF_ROOT_FOLDER_ID = '請填入病假證明總資料夾ID';
const DRIVE_UPLOAD_SECRET = '請填入一組自訂密碼';

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents || '{}');

    if (payload.secret !== DRIVE_UPLOAD_SECRET) {
      return jsonOutput({ ok: false, error: 'Invalid secret' });
    }

    const className = String(payload.className || '未分類').trim() || '未分類';
    const fileName = String(payload.name || `診斷證明_${Date.now()}.jpg`).trim();
    const mimeType = String(payload.mimeType || 'application/octet-stream').trim();
    const bytes = Utilities.base64Decode(payload.base64 || '');
    const blob = Utilities.newBlob(bytes, mimeType, fileName);

    const root = DriveApp.getFolderById(SICK_PROOF_ROOT_FOLDER_ID);
    const folder = getOrCreateChildFolder(root, className);
    const file = folder.createFile(blob);

    return jsonOutput({
      ok: true,
      id: file.getId(),
      name: file.getName(),
      url: file.getUrl(),
      className,
    });
  } catch (error) {
    return jsonOutput({ ok: false, error: String(error && error.message ? error.message : error) });
  }
}

function getOrCreateChildFolder(parent, name) {
  const existing = parent.getFoldersByName(name);
  if (existing.hasNext()) return existing.next();
  return parent.createFolder(name);
}

function jsonOutput(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
