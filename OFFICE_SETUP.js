// ═══════════════════════════════════════════════════════════════
//  UniInspect — Google Apps Script (COMPLETE)
//  Handles:
//  1. Office Code validation
//  2. Report submission to Sheets
//  3. Verification endpoint
//
//  SETUP:
//  1. Go to script.google.com
//  2. New Project → name "UniInspect"
//  3. Paste this entire file
//  4. Save
//  5. Deploy → New Deployment
//     → Type: Web App
//     → Execute as: Me
//     → Who has access: Anyone
//  6. Copy Web App URL → paste in app.js as APPS_SCRIPT_URL
// ═══════════════════════════════════════════════════════════════

var OFFICE_SHEET  = "OfficeCodes";
var REPORTS_SHEET = "InspectionReports";

function doGet(e) {
  var action = e.parameter.action;

  // Validate office code
  if (action === "validateOffice") {
    return validateOfficeCode(e.parameter.code);
  }

  // Verify report
  if (action === "verify") {
    return verifyReport(e.parameter.id);
  }

  return jsonResponse({ success: false, error: "Unknown action" });
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    if (data.action === "submitReport") {
      return submitReport(data);
    }
    return jsonResponse({ success: false, error: "Unknown action" });
  } catch(err) {
    return jsonResponse({ success: false, error: err.message });
  }
}

// ── VALIDATE OFFICE CODE ────────────────────────────────────────
function validateOfficeCode(code) {
  try {
    var ss    = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(OFFICE_SHEET);

    // Create sheet with sample data if not exists
    if (!sheet) {
      sheet = ss.insertSheet(OFFICE_SHEET);
      sheet.appendRow(["Office Code", "Recipient Email", "Office Name", "Active"]);
      sheet.appendRow(["OFFICE001", "branch1@insuranceco.com", "Kochi Branch", "YES"]);
      sheet.appendRow(["OFFICE002", "branch2@insuranceco.com", "Trivandrum Branch", "YES"]);
      sheet.appendRow(["OFFICE003", "branch3@insuranceco.com", "Kozhikode Branch", "YES"]);
      sheet.getRange(1,1,1,4).setFontWeight("bold").setBackground("#0f172a").setFontColor("#ffffff");
      sheet.setFrozenRows(1);
    }

    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (data[i][0].toString().trim().toUpperCase() === code.toString().trim().toUpperCase()) {
        if (data[i][3].toString().toUpperCase() === "YES") {
          return jsonResponse({
            success     : true,
            email       : data[i][1].toString().trim(),
            officeName  : data[i][2].toString().trim(),
            officeCode  : data[i][0].toString().trim()
          });
        } else {
          return jsonResponse({ success: false, error: "Office code is inactive. Please contact your Parent office." });
        }
      }
    }
    return jsonResponse({ success: false, error: "Please contact your Parent office for office code mapping." });
  } catch(err) {
    return jsonResponse({ success: false, error: err.message });
  }
}

// ── SUBMIT REPORT ───────────────────────────────────────────────
function submitReport(data) {
  try {
    var ss    = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(REPORTS_SHEET);

    if (!sheet) {
      sheet = ss.insertSheet(REPORTS_SHEET);
      sheet.appendRow([
        "Report ID", "Submitted At", "Inspector Gmail", "Inspector Name",
        "Office Code", "Office Name", "Recipient Email",
        "Registration", "Make/Model", "Owner", "Expired Policy",
        "GPS Lat", "GPS Lng", "GPS Accuracy", "Place Name",
        "Photos Captured", "Device Fingerprint", "Status"
      ]);
      sheet.getRange(1,1,1,18).setFontWeight("bold").setBackground("#0f172a").setFontColor("#ffffff");
      sheet.setFrozenRows(1);
    }

    sheet.appendRow([
      data.reportId,
      data.submittedAt,
      data.inspectorEmail,
      data.inspectorName,
      data.officeCode,
      data.officeName,
      data.recipientEmail,
      data.registration,
      data.makeModel     || "—",
      data.owner         || "—",
      data.expiredPolicy || "—",
      data.gpsLat        || "—",
      data.gpsLng        || "—",
      data.gpsAccuracy   || "—",
      data.placeName     || "—",
      data.photosCaptured,
      data.deviceFingerprint || "—",
      "GENUINE"
    ]);

    return jsonResponse({ success: true, reportId: data.reportId });
  } catch(err) {
    return jsonResponse({ success: false, error: err.message });
  }
}

// ── VERIFY REPORT ───────────────────────────────────────────────
function verifyReport(reportId) {
  try {
    var ss    = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(REPORTS_SHEET);
    if (!sheet) return jsonResponse({ success: false, error: "No reports found" });

    var data    = sheet.getDataRange().getValues();
    var headers = data[0];
    for (var i = 1; i < data.length; i++) {
      if (data[i][0].toString() === reportId.toString()) {
        var record = {};
        headers.forEach(function(h, j) { record[h] = data[i][j]; });
        return jsonResponse({ success: true, report: record });
      }
    }
    return jsonResponse({ success: false, error: "Report not found" });
  } catch(err) {
    return jsonResponse({ success: false, error: err.message });
  }
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
