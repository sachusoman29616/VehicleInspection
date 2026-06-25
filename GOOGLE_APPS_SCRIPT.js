// ═══════════════════════════════════════════════════════════════
//  UniInspect — Google Apps Script Backend
//  
//  SETUP INSTRUCTIONS:
//  1. Go to script.google.com
//  2. Click "New Project"
//  3. Delete existing code
//  4. Paste this entire file
//  5. Click Save (Ctrl+S) — name it "UniInspect Backend"
//  6. Click Deploy → New Deployment
//     → Type: Web App
//     → Execute as: Me
//     → Who has access: Anyone
//  7. Click Deploy → Copy the Web App URL
//  8. Paste that URL in app.js where it says APPS_SCRIPT_URL
// ═══════════════════════════════════════════════════════════════

const SHEET_NAME = "InspectionReports";

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const ss   = SpreadsheetApp.getActiveSpreadsheet();
    let sheet  = ss.getSheetByName(SHEET_NAME);

    // Create sheet with headers if it doesn't exist
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      sheet.appendRow([
        "Report ID", "Timestamp", "Inspector Gmail", "Inspector Name",
        "Registration", "Make/Model", "Owner", "Expired Policy",
        "GPS Lat", "GPS Lng", "GPS Accuracy (m)", "GPS Address",
        "Photos Captured", "Photo Hash", "Recipient Email", "Status"
      ]);
      // Format header row
      sheet.getRange(1, 1, 1, 16).setFontWeight("bold").setBackground("#0f172a").setFontColor("#ffffff");
      sheet.setFrozenRows(1);
    }

    // Append the report data
    sheet.appendRow([
      data.reportId,
      data.timestamp,
      data.inspectorEmail,
      data.inspectorName,
      data.registration,
      data.makeModel,
      data.owner,
      data.expiredPolicy,
      data.gpsLat,
      data.gpsLng,
      data.gpsAccuracy,
      data.gpsAddress,
      data.photosCaptured,
      data.photoHash,
      data.recipientEmail,
      "GENUINE"
    ]);

    return ContentService
      .createTextOutput(JSON.stringify({ success: true, reportId: data.reportId }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch(err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  // Verification endpoint — called when someone wants to verify a report
  try {
    const reportId = e.parameter.id;
    if (!reportId) return htmlResponse("Missing report ID");

    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) return htmlResponse("No reports found");

    const data    = sheet.getDataRange().getValues();
    const headers = data[0];
    let found     = null;

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === reportId) {
        found = {};
        headers.forEach((h, j) => found[h] = data[i][j]);
        break;
      }
    }

    if (!found) return htmlResponse("Report not found", reportId, false);
    return htmlResponse("Report verified", reportId, true, found);

  } catch(err) {
    return htmlResponse("Verification error: " + err.message);
  }
}

function htmlResponse(msg, reportId, genuine, data) {
  const color  = genuine ? "#16a34a" : "#dc2626";
  const icon   = genuine ? "✅" : "❌";
  const status = genuine ? "GENUINE REPORT" : "REPORT NOT FOUND";

  const rows = data ? `
    <div class="row"><span class="key">Report ID</span><span class="val">${data["Report ID"]}</span></div>
    <div class="row"><span class="key">Submitted</span><span class="val">${data["Timestamp"]}</span></div>
    <div class="row"><span class="key">Inspector</span><span class="val">${data["Inspector Name"]} (${data["Inspector Gmail"]})</span></div>
    <div class="row"><span class="key">Registration</span><span class="val">${data["Registration"]}</span></div>
    <div class="row"><span class="key">Make / Model</span><span class="val">${data["Make/Model"]||"—"}</span></div>
    <div class="row"><span class="key">Owner</span><span class="val">${data["Owner"]||"—"}</span></div>
    <div class="row"><span class="key">GPS Location</span><span class="val">${data["GPS Lat"]}, ${data["GPS Lng"]} (±${data["GPS Accuracy (m)"]}m)</span></div>
    <div class="row"><span class="key">Photos</span><span class="val">${data["Photos Captured"]}</span></div>
    <div class="row"><span class="key">Photo Hash</span><span class="val mono">${data["Photo Hash"]}</span></div>
    <div class="row"><span class="key">Status</span><span class="val" style="color:${color};font-weight:800">${data["Status"]}</span></div>
  ` : `<div class="row"><span class="val">No record found for ID: ${reportId}</span></div>`;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>UniInspect Verification</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box;}
    body{font-family:'Segoe UI',sans-serif;background:#f1f5f9;min-height:100vh;padding:20px;}
    .card{background:#fff;border-radius:16px;padding:24px;max-width:480px;margin:0 auto;box-shadow:0 4px 20px rgba(0,0,0,0.08);}
    .header{background:#0f172a;border-radius:12px;padding:20px;text-align:center;margin-bottom:20px;}
    .brand{font-size:20px;font-weight:800;color:#f1f5f9;}
    .brand-sub{font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;margin-top:4px;}
    .status-badge{background:${color};color:#fff;border-radius:10px;padding:14px;text-align:center;margin-bottom:20px;}
    .status-icon{font-size:36px;margin-bottom:6px;}
    .status-text{font-size:18px;font-weight:800;letter-spacing:-0.3px;}
    .row{display:flex;justify-content:space-between;align-items:flex-start;padding:10px 0;border-bottom:1px solid #f1f5f9;gap:10px;}
    .key{font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;flex-shrink:0;width:100px;}
    .val{font-size:13px;color:#0f172a;font-weight:600;text-align:right;}
    .mono{font-family:monospace;font-size:10px;word-break:break-all;}
    .footer{text-align:center;font-size:11px;color:#94a3b8;margin-top:16px;}
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div class="brand">🛡️ UniInspect</div>
      <div class="brand-sub">Report Verification</div>
    </div>
    <div class="status-badge">
      <div class="status-icon">${icon}</div>
      <div class="status-text">${status}</div>
    </div>
    ${rows}
    <div class="footer">UniInspect — Vehicle Inspection System</div>
  </div>
</body>
</html>`;

  return HtmlService.createHtmlOutput(html).setTitle("UniInspect Verification");
}
