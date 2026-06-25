// UniInspect — Google Apps Script
// Spreadsheet ID hardcoded — no search needed

var SPREADSHEET_ID = "1srOFIbFzaTwOxg9I4RYczThLTvxg4dlhYO3pvTmgB_8";
var OFFICE_SHEET   = "OfficeCodes";
var REPORTS_SHEET  = "InspectionReports";

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
      "Report ID","Submitted At","Inspector Gmail","Inspector Name",
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
            email      : data[i][1].toString().trim(),
            officeName : data[i][2].toString().trim(),
            officeCode : data[i][0].toString().trim()
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
    var sheet = getReportsSheet();
    sheet.appendRow([
      data.reportId,
      data.submittedAt,
      data.inspectorEmail,
      data.inspectorName,
      data.officeCode,
      data.officeName,
      data.recipientEmail,
      data.registration,
      data.makeModel      || "—",
      data.owner          || "—",
      data.expiredPolicy  || "—",
      data.gpsLat         || "—",
      data.gpsLng         || "—",
      data.gpsAccuracy    || "—",
      data.placeName      || "—",
      data.photosCaptured,
      data.deviceFingerprint || "—",
      "GENUINE"
    ]);
    return jsonResponse({ success:true, reportId:data.reportId });
  } catch(err) {
    return jsonResponse({ success:false, error:err.message });
  }
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
