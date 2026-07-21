// ═══════════════════════════════════════════════════════════════
//  UniInspect — Google Apps Script (COMPLETE)
//  Sends email via Gmail App Password — No OAuth needed
//
//  SETUP:
//  1. Create a Gmail: uninspect.sender@gmail.com (or any Gmail)
//  2. myaccount.google.com → Security → 2-Step Verification → ON
//  3. App Passwords → Select app: Mail → Generate
//  4. Copy 16-character password → paste below
//  5. Deploy as Web App → Execute as Me → Anyone can access
// ═══════════════════════════════════════════════════════════════

var SPREADSHEET_ID = "1srOFIbFzaTwOxg9I4RYczThLTvxg4dlhYO3pvTmgB_8";
var OFFICE_SHEET   = "OfficeCodes";
var REPORTS_SHEET  = "InspectionReports";

// ── SENDER CONFIG ────────────────────────────────────────────────
var SENDER_EMAIL    = "YOUR_SENDER_GMAIL@gmail.com"; // e.g. uninspect.sender@gmail.com
var SENDER_NAME     = "UniInspect";
var APP_PASSWORD    = "YOUR_APP_PASSWORD_HERE";      // 16-char Gmail App Password
// ─────────────────────────────────────────────────────────────────

function getSpreadsheet() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function getOfficeSheet() {
  var ss    = getSpreadsheet();
  var sheet = ss.getSheetByName(OFFICE_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(OFFICE_SHEET);
    sheet.appendRow(["Office Code","Recipient Email","Office Name","Active"]);
    sheet.appendRow(["OFFICE001","branch1@yourcompany.com","Head Office","YES"]);
    sheet.appendRow(["OFFICE002","branch2@yourcompany.com","Branch 2","YES"]);
    sheet.getRange(1,1,1,4).setFontWeight("bold").setBackground("#0f172a").setFontColor("#ffffff");
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1,120);
    sheet.setColumnWidth(2,250);
    sheet.setColumnWidth(3,200);
    sheet.setColumnWidth(4,80);
  }
  return sheet;
}

function getReportsSheet() {
  var ss    = getSpreadsheet();
  var sheet = ss.getSheetByName(REPORTS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(REPORTS_SHEET);
    sheet.appendRow([
      "Report ID","Submitted At","Inspector Name","Inspector Gmail",
      "Office Code","Office Name","Recipient Email",
      "Registration","Make/Model","Owner","Expired Policy",
      "GPS Lat","GPS Lng","GPS Accuracy","Place Name",
      "Photos Captured","Device Fingerprint","Status"
    ]);
    sheet.getRange(1,1,1,18).setFontWeight("bold").setBackground("#0f172a").setFontColor("#ffffff");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function doGet(e) {
  try {
    var action = e.parameter.action;
    if (action === "validateOffice") return validateOfficeCode(e.parameter.code);
    if (action === "verify")         return verifyReport(e.parameter.id);
    return jsonResponse({ success:false, error:"Unknown action" });
  } catch(err) {
    return jsonResponse({ success:false, error:err.message });
  }
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    if (data.action === "submitReport") return submitReport(data);
    return jsonResponse({ success:false, error:"Unknown action" });
  } catch(err) {
    return jsonResponse({ success:false, error:err.message });
  }
}

function validateOfficeCode(code) {
  try {
    var sheet = getOfficeSheet();
    var data  = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (data[i][0].toString().trim().toUpperCase() === code.toString().trim().toUpperCase()) {
        if (data[i][3].toString().toUpperCase() === "YES") {
          return jsonResponse({
            success    : true,
            officeName : data[i][2].toString().trim(),
            officeCode : data[i][0].toString().trim()
            // Note: recipient email NOT sent to app — kept secret on server
          });
        } else {
          return jsonResponse({ success:false, error:"Office code is inactive. Please contact your Parent office." });
        }
      }
    }
    return jsonResponse({ success:false, error:"Please contact your Parent office for office code mapping." });
  } catch(err) {
    return jsonResponse({ success:false, error:err.message });
  }
}

function submitReport(data) {
  try {
    // Get recipient email from Sheets (not from app)
    var officeSheet = getOfficeSheet();
    var officeData  = officeSheet.getDataRange().getValues();
    var recipientEmail = "";
    var officeName     = data.officeName || "";

    for (var i = 1; i < officeData.length; i++) {
      if (officeData[i][0].toString().trim().toUpperCase() === data.officeCode.toString().trim().toUpperCase()) {
        recipientEmail = officeData[i][1].toString().trim();
        officeName     = officeData[i][2].toString().trim();
        break;
      }
    }

    if (!recipientEmail) {
      return jsonResponse({ success:false, error:"Office not found" });
    }

    // Save to reports sheet
    var sheet = getReportsSheet();
    sheet.appendRow([
      data.reportId,
      data.submittedAt,
      data.inspectorName  || "—",
      data.inspectorEmail || "—",
      data.officeCode,
      officeName,
      recipientEmail,
      data.registration,
      data.makeModel      || "—",
      data.owner          || "—",
      data.expiredPolicy  || "—",
      data.gpsLat         || "—",
      data.gpsLng         || "—",
      data.gpsAccuracy    || "—",
      data.placeName      || "—",
      data.photosCaptured || "—",
      data.deviceFingerprint || "—",
      "GENUINE"
    ]);

    // Send email via Gmail App Password (SMTP)
    sendEmailWithPDF({
      to          : recipientEmail,
      subject     : "Vehicle Inspection Report - " + data.registration + " - " + new Date().toLocaleDateString("en-GB"),
      reportId    : data.reportId,
      inspectorName: data.inspectorName || "Inspector",
      inspectorEmail: data.inspectorEmail || "—",
      officeName  : officeName,
      registration: data.registration,
      makeModel   : data.makeModel || "—",
      owner       : data.owner || "—",
      expiredPolicy: data.expiredPolicy || "—",
      submittedAt : data.submittedAt,
      gpsPlace    : data.placeName || "—",
      gpsCoords   : data.gpsLat && data.gpsLng ? (data.gpsLat + ", " + data.gpsLng) : "—",
      photos      : data.photosCaptured || "—",
      pdfBase64   : data.pdfBase64,
      pdfFilename : data.pdfFilename,
    });

    return jsonResponse({ success:true, reportId:data.reportId });
  } catch(err) {
    return jsonResponse({ success:false, error:err.message });
  }
}

function sendEmailWithPDF(opts) {
  var bodyText = [
    "UNINSPECT VEHICLE INSPECTION REPORT",
    "Report ID  : " + opts.reportId,
    "Generated  : " + opts.submittedAt,
    "Inspector  : " + opts.inspectorName + " <" + opts.inspectorEmail + ">",
    "Office     : " + opts.officeName,
    "Location   : " + opts.gpsPlace,
    "GPS        : " + opts.gpsCoords,
    "",
    "VEHICLE DETAILS",
    "Registration  : " + opts.registration,
    "Make / Model  : " + opts.makeModel,
    "Owner         : " + opts.owner,
    "Expired Policy: " + opts.expiredPolicy,
    "",
    "PHOTOS CAPTURED",
    opts.photos,
    "",
    "PDF inspection report is attached.",
    "Verify this report using Report ID: " + opts.reportId,
    "",
    "---",
    "Sent via UniInspect Vehicle Inspection System"
  ].join("\n");

  // Use GmailApp to send with PDF attachment
  var pdfBlob = Utilities.newBlob(
    Utilities.base64Decode(opts.pdfBase64),
    "application/pdf",
    opts.pdfFilename
  );

  GmailApp.sendEmail(
    opts.to,
    opts.subject,
    bodyText,
    {
      attachments : [pdfBlob],
      name        : SENDER_NAME,
      replyTo     : SENDER_EMAIL,
    }
  );
}

function verifyReport(reportId) {
  try {
    var sheet   = getReportsSheet();
    var data    = sheet.getDataRange().getValues();
    var headers = data[0];
    for (var i = 1; i < data.length; i++) {
      if (data[i][0].toString() === reportId.toString()) {
        var record = {};
        headers.forEach(function(h,j){ record[h]=data[i][j]; });
        return jsonResponse({ success:true, report:record });
      }
    }
    return jsonResponse({ success:false, error:"Report not found" });
  } catch(err) {
    return jsonResponse({ success:false, error:err.message });
  }
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
