/**
 * 01_Db.gs — ชั้นเข้าถึงข้อมูล (Data Access Layer)
 *
 * ทุกการอ่าน/เขียนชีตต้องผ่านไฟล์นี้เท่านั้น เพื่อให้
 *  1) อ้างอิงคอลัมน์ด้วยชื่อหัวตาราง ไม่ใช่เลขคอลัมน์ (ชีตปรับได้ไม่พัง)
 *  2) มีแคชกลาง ลดจำนวนครั้งที่เรียก SpreadsheetApp ซึ่งช้าที่สุดในระบบ
 *  3) ล็อกตอนเขียน ป้องกันครูหลายคนบันทึกพร้อมกันแล้วข้อมูลทับกัน
 */

var _ssCache = null;
var _memCache = {};

function getSpreadsheet_() {
  if (_ssCache) return _ssCache;
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  _ssCache = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  if (!_ssCache) throw new Error('ไม่พบไฟล์ Google Sheets ของระบบ กรุณารันเมนู "ติดตั้งระบบ" ก่อน');
  return _ssCache;
}

function getSheet_(name) {
  var sh = getSpreadsheet_().getSheetByName(name);
  if (!sh) throw new Error('ไม่พบชีต "' + name + '" กรุณารันเมนู "ติดตั้งระบบ"');
  return sh;
}

/** อ่านทั้งชีตเป็น array ของ object โดยใช้หัวตารางเป็นคีย์ */
function dbReadAll(sheetName, useCache) {
  if (useCache !== false && _memCache[sheetName]) return _memCache[sheetName];

  var values = getSheet_(sheetName).getDataRange().getValues();
  if (values.length < 2) { _memCache[sheetName] = []; return []; }

  var headers = values[0];
  var rows = [];
  for (var r = 1; r < values.length; r++) {
    if (values[r].join('') === '') continue;      // ข้ามแถวว่าง
    var obj = { _row: r + 1 };
    for (var c = 0; c < headers.length; c++) {
      if (headers[c] !== '') obj[headers[c]] = values[r][c];
    }
    rows.push(obj);
  }
  _memCache[sheetName] = rows;
  return rows;
}

function dbFind(sheetName, predicate) {
  var rows = dbReadAll(sheetName);
  for (var i = 0; i < rows.length; i++) if (predicate(rows[i])) return rows[i];
  return null;
}

function dbFilter(sheetName, predicate) {
  return dbReadAll(sheetName).filter(predicate);
}

/** เพิ่มแถวใหม่ คืนค่า object ที่บันทึกแล้ว (พร้อมรหัสที่ระบบออกให้) */
function dbInsert(sheetName, obj) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = getSheet_(sheetName);
    var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];

    if (headers.indexOf('รหัส') >= 0 && !obj['รหัส']) obj['รหัส'] = dbNextId_(sh, headers);

    var row = headers.map(function (h) {
      return (obj[h] === undefined || obj[h] === null) ? '' : obj[h];
    });
    sh.appendRow(row);
    delete _memCache[sheetName];
    return obj;
  } finally {
    lock.releaseLock();
  }
}

/** เพิ่มหลายแถวพร้อมกัน (เร็วกว่าเรียก dbInsert ทีละครั้งมาก) */
function dbInsertMany(sheetName, objects) {
  if (!objects || !objects.length) return 0;
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sh = getSheet_(sheetName);
    var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    var nextId = headers.indexOf('รหัส') >= 0 ? dbNextId_(sh, headers) : null;

    var rows = objects.map(function (obj) {
      if (nextId !== null && !obj['รหัส']) obj['รหัส'] = nextId++;
      return headers.map(function (h) {
        return (obj[h] === undefined || obj[h] === null) ? '' : obj[h];
      });
    });
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);
    delete _memCache[sheetName];
    return rows.length;
  } finally {
    lock.releaseLock();
  }
}

/** แก้ไขแถวตามเลขแถวจริงในชีต (ได้จาก _row ของ object ที่อ่านมา) */
function dbUpdateRow(sheetName, rowNumber, changes) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = getSheet_(sheetName);
    var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    var current = sh.getRange(rowNumber, 1, 1, headers.length).getValues()[0];

    Object.keys(changes).forEach(function (key) {
      var idx = headers.indexOf(key);
      if (idx >= 0) current[idx] = changes[key];
    });
    sh.getRange(rowNumber, 1, 1, headers.length).setValues([current]);
    delete _memCache[sheetName];
  } finally {
    lock.releaseLock();
  }
}

function dbDeleteRow(sheetName, rowNumber) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    getSheet_(sheetName).deleteRow(rowNumber);
    delete _memCache[sheetName];
  } finally {
    lock.releaseLock();
  }
}

function dbNextId_(sheet, headers) {
  var idCol = headers.indexOf('รหัส') + 1;
  var last = sheet.getLastRow();
  if (last < 2) return 1;
  var ids = sheet.getRange(2, idCol, last - 1, 1).getValues();
  var max = 0;
  for (var i = 0; i < ids.length; i++) {
    var v = Number(ids[i][0]);
    if (!isNaN(v) && v > max) max = v;
  }
  return max + 1;
}

function dbClearCache(sheetName) {
  if (sheetName) delete _memCache[sheetName];
  else _memCache = {};
}

/* ------------------------------------------------------------------ */
/* ค่าตั้งค่าระบบ                                                        */
/* ------------------------------------------------------------------ */

function getSetting(key, fallback) {
  var row = dbFind(SHEETS.SETTINGS, function (r) { return r['คีย์'] === key; });
  if (!row || row['ค่า'] === '') return fallback;
  return row['ค่า'];
}

function getSettingNumber(key, fallback) {
  var v = Number(getSetting(key, fallback));
  return isNaN(v) ? fallback : v;
}

function setSetting(key, value) {
  var row = dbFind(SHEETS.SETTINGS, function (r) { return r['คีย์'] === key; });
  if (row) dbUpdateRow(SHEETS.SETTINGS, row._row, { 'ค่า': value });
  else dbInsert(SHEETS.SETTINGS, { 'คีย์': key, 'ค่า': value, 'คำอธิบาย': '' });
}

function currentYear()  { return getSettingNumber('ปีการศึกษาปัจจุบัน', 2569); }
function currentTerm()  { return getSettingNumber('ภาคเรียนปัจจุบัน', 1); }

/* ------------------------------------------------------------------ */
/* ตัวช่วยทั่วไป                                                         */
/* ------------------------------------------------------------------ */

function nowStr() {
  return Utilities.formatDate(new Date(), APP.TZ, 'yyyy-MM-dd HH:mm:ss');
}

function toDate_(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  var d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

/** วันที่แบบไทย เช่น 10 กันยายน 2569 */
var TH_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

function thaiDate(v, withTime) {
  var d = toDate_(v);
  if (!d) return '';
  var s = d.getDate() + ' ' + TH_MONTHS[d.getMonth()] + ' ' + (d.getFullYear() + 543);
  if (withTime) s += ' ' + Utilities.formatDate(d, APP.TZ, 'HH:mm') + ' น.';
  return s;
}

function levelBand(gradeLevel) {
  return Number(gradeLevel) <= 3 ? BAND.LOWER : BAND.UPPER;
}

function classLabel(gradeLevel, roomNo) {
  return 'ม.' + gradeLevel + '/' + roomNo;
}

function studentFullName(s) {
  return String(s['คำนำหน้า'] || '') + s['ชื่อ'] + ' ' + s['นามสกุล'];
}

/** ชื่อสำหรับแสดงต่อสาธารณะ ปกปิดนามสกุลถ้าผู้ปกครองไม่ยินยอม (PDPA) */
function publicName(s) {
  var consent = String(s['ยินยอมเผยแพร่']).trim();
  var mask = String(getSetting('ปกปิดนามสกุลเมื่อไม่ยินยอม', 'ใช่')) === 'ใช่';
  if (consent === 'ใช่' || consent === 'TRUE' || consent === 'true' || !mask) {
    return studentFullName(s);
  }
  return String(s['คำนำหน้า'] || '') + s['ชื่อ'] + ' ' + String(s['นามสกุล']).charAt(0) + '.';
}

function logAudit(user, action, target, detail) {
  try {
    dbInsert(SHEETS.AUDIT, {
      'เมื่อ': nowStr(),
      'ผู้ใช้': user ? user.username : '(ระบบ)',
      'บทบาท': user ? user.role : '',
      'การกระทำ': action,
      'เป้าหมาย': target || '',
      'รายละเอียด': detail || ''
    });
  } catch (e) {
    console.error('บันทึก audit ไม่สำเร็จ: ' + e.message);
  }
}
