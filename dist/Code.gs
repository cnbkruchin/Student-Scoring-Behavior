/* ==========================================================================
 * ระบบคะแนนความประพฤตินักเรียน — โค้ดฝั่งเซิร์ฟเวอร์ทั้งหมด
 * โรงเรียนจุนวิทยาคม
 *
 * ไฟล์นี้สร้างอัตโนมัติจาก  node build/bundle.js  — อย่าแก้ไขไฟล์นี้โดยตรง
 * ถ้าต้องการแก้ไขระบบ ให้แก้ที่ apps-script/ แล้วสร้างใหม่ เพื่อให้ยังรันชุดทดสอบได้
 *
 * รวมจาก: 00_Config.gs, 01_Db.gs, 02_Auth.gs, 03_Scoring.gs, 04_Api.gs, 05_Reports.gs, 06_Setup.gs, 07_WebApp.gs, 08_RuleData.gs, 09_Import.gs
 * ========================================================================== */


/* ----------------------------------------------------------------------
 * 00_Config.gs
 * ---------------------------------------------------------------------- */

/**
 * ระบบคะแนนความประพฤตินักเรียน โรงเรียนจุนวิทยาคม
 * 00_Config.gs — ค่าคงที่และโครงสร้างชีตทั้งหมด
 *
 * ชีตทุกแผ่นมีแถวแรกเป็นหัวตาราง โค้ดอ้างอิงคอลัมน์ด้วย "ชื่อหัวตาราง" เสมอ
 * ผู้ใช้จึงสลับตำแหน่งคอลัมน์ในชีตได้โดยระบบยังทำงานถูกต้อง
 */

var APP = {
  NAME: 'ระบบคะแนนความประพฤตินักเรียน',
  SCHOOL: 'โรงเรียนจุนวิทยาคม',
  VERSION: '1.0.0',
  TZ: 'Asia/Bangkok',
  SESSION_HOURS: 8,
  PBKDF_ROUNDS: 1000
};

/** ชื่อชีต (เปลี่ยนได้ แต่ต้องเปลี่ยนพร้อมกับชื่อแท็บในไฟล์ Google Sheets) */
var SHEETS = {
  SETTINGS:   'ตั้งค่า',
  USERS:      'ผู้ใช้',
  STUDENTS:   'นักเรียน',
  RULES:      'หลักเกณฑ์',
  RECORDS:    'บันทึกพฤติกรรม',
  LEDGER:     'บัญชีคะแนน',
  BALANCES:   'คะแนนคงเหลือ',
  THRESHOLDS: 'เกณฑ์ความเสี่ยง',
  LEADERBOARD:'กระดานเกียรติยศ',
  CLASSHIST:  'ประวัติชั้นเรียน',
  AUDIT:      'บันทึกการใช้งาน'
};

/** โครงสร้างคอลัมน์ของแต่ละชีต */
var SCHEMA = {};
SCHEMA[SHEETS.SETTINGS] = ['คีย์', 'ค่า', 'คำอธิบาย'];

SCHEMA[SHEETS.USERS] = ['รหัส', 'ชื่อผู้ใช้', 'รหัสผ่าน(เข้ารหัส)', 'เกลือ', 'ชื่อ-สกุล',
  'บทบาท', 'ขอบเขต', 'อีเมล', 'โทรศัพท์', 'ใช้งาน', 'ต้องเปลี่ยนรหัสผ่าน',
  'เข้าใช้ล่าสุด', 'สร้างเมื่อ'];

SCHEMA[SHEETS.STUDENTS] = ['รหัส', 'รหัสนักเรียน', 'คำนำหน้า', 'ชื่อ', 'นามสกุล', 'เพศ',
  'ระดับชั้น', 'ห้อง', 'เลขที่', 'ชั้นแรกเข้า', 'ปีแรกเข้า', 'สถานะ',
  'ยินยอมเผยแพร่', 'ชื่อผู้ปกครอง', 'โทรผู้ปกครอง', 'LINE ผู้ปกครอง', 'สร้างเมื่อ'];

SCHEMA[SHEETS.RULES] = ['รหัส', 'รหัสเกณฑ์', 'รหัสเดิม', 'หมวด', 'ประเภท', 'ชื่อเกณฑ์', 'คะแนน',
  'ระดับความรุนแรง', 'คุณลักษณะอันพึงประสงค์', 'ต้องมีหลักฐาน', 'เพดานครั้ง/ภาคเรียน',
  'อ้างอิงระเบียบ', 'ใช้งาน'];
// 'รหัส'      = รหัสภายในระบบ ออกให้อัตโนมัติ ห้ามแก้
// 'รหัสเกณฑ์'  = รหัสที่ระบบใช้อ้างอิง ไม่ซ้ำกัน เช่น ด-01 (ความดี) ผ-01 (ความผิด)
// 'รหัสเดิม'   = เลขรหัสเดิมที่โรงเรียนใช้อยู่ เก็บไว้เพื่อเทียบกับเอกสารเก่า ซ้ำกันได้

SCHEMA[SHEETS.RECORDS] = ['รหัส', 'เลขที่บันทึก', 'รหัสนักเรียน(ระบบ)', 'รหัสนักเรียน',
  'ชื่อนักเรียน', 'ห้อง', 'ปีการศึกษา', 'ภาคเรียน', 'รหัสเกณฑ์(ระบบ)', 'รหัสเกณฑ์',
  'ชื่อเกณฑ์', 'ประเภท', 'คะแนน', 'วันเวลาที่เกิดเหตุ', 'สถานที่', 'รายละเอียด',
  'ลิงก์หลักฐาน', 'ผู้บันทึก(ระบบ)', 'ผู้บันทึก', 'บันทึกเมื่อ', 'สถานะ',
  'ผู้พิจารณา', 'พิจารณาเมื่อ', 'หมายเหตุการพิจารณา'];

SCHEMA[SHEETS.LEDGER] = ['รหัส', 'รหัสนักเรียน(ระบบ)', 'ปีการศึกษา', 'บัญชี', 'ประเภทรายการ',
  'คะแนนที่เปลี่ยน', 'ยอดคงเหลือ', 'อ้างอิงบันทึก', 'เหตุผล', 'ผู้ทำรายการ', 'เมื่อ'];

SCHEMA[SHEETS.BALANCES] = ['รหัสนักเรียน(ระบบ)', 'ปีการศึกษา', 'คะแนนความประพฤติ',
  'คะแนนความดีสะสม', 'คะแนนที่ถูกหัก', 'ครั้งที่ทำความดี', 'ครั้งที่ทำผิด',
  'ความดีล่าสุด', 'ความผิดล่าสุด', 'ระดับความเสี่ยง', 'ปรับปรุงเมื่อ'];

SCHEMA[SHEETS.THRESHOLDS] = ['คะแนนต่ำสุด', 'คะแนนสูงสุด', 'ระดับ', 'การดำเนินการ', 'สี'];

SCHEMA[SHEETS.LEADERBOARD] = ['ระดับ', 'อันดับ', 'รหัสนักเรียน(ระบบ)', 'ชื่อที่แสดง',
  'ห้อง', 'คะแนนความดี', 'คะแนนความประพฤติ', 'สร้างเมื่อ'];

SCHEMA[SHEETS.CLASSHIST] = ['รหัสนักเรียน(ระบบ)', 'ปีการศึกษา', 'ระดับชั้น', 'ห้อง', 'เลขที่'];

SCHEMA[SHEETS.AUDIT] = ['เมื่อ', 'ผู้ใช้', 'บทบาท', 'การกระทำ', 'เป้าหมาย', 'รายละเอียด'];

/** บทบาทและสิทธิ์ */
var ROLES = {
  admin:     { name: 'ผู้ดูแลระบบ',        level: 100 },
  affairs:   { name: 'ฝ่ายกิจการนักเรียน',  level: 80 },
  level_head:{ name: 'หัวหน้าระดับชั้น',    level: 60 },
  homeroom:  { name: 'ครูที่ปรึกษา',        level: 40 },
  teacher:   { name: 'ครูผู้สอน',           level: 20 },
  executive: { name: 'ผู้บริหาร',           level: 70 }
};

/**
 * ตารางสิทธิ์: ความสามารถ -> บทบาทที่ทำได้
 * ตรวจสอบที่ฝั่งเซิร์ฟเวอร์ทุกครั้ง ไม่ใช่แค่ซ่อนปุ่มบนหน้าจอ
 */
var PERMISSIONS = {
  'record.create':    ['admin', 'affairs', 'level_head', 'homeroom', 'teacher'],
  'record.approve':   ['admin', 'affairs', 'level_head', 'homeroom'],
  'record.revoke':    ['admin', 'affairs'],
  'record.viewAll':   ['admin', 'affairs', 'level_head', 'executive'],
  'student.view':     ['admin', 'affairs', 'level_head', 'homeroom', 'teacher', 'executive'],
  'student.manage':   ['admin', 'affairs'],
  'report.view':      ['admin', 'affairs', 'level_head', 'homeroom', 'executive'],
  'report.exportAll': ['admin', 'affairs', 'executive'],
  'rule.manage':      ['admin', 'affairs'],
  'user.manage':      ['admin'],
  'settings.manage':  ['admin'],
  'audit.view':       ['admin', 'executive'],
  'leaderboard.publish': ['admin', 'affairs']
};

/** ความผิดระดับ 3-4 ต้องให้ฝ่ายกิจการนักเรียนอนุมัติเท่านั้น */
var SEVERE_APPROVERS = ['admin', 'affairs'];

var KIND = { MERIT: 'ความดี', DEMERIT: 'ความผิด' };
var STATUS = {
  DRAFT: 'ร่าง', SUBMITTED: 'รออนุมัติ', APPROVED: 'อนุมัติแล้ว',
  REJECTED: 'ไม่อนุมัติ', REVOKED: 'เพิกถอน'
};
var ACCOUNT = { CONDUCT: 'ความประพฤติ', MERIT: 'ความดีสะสม' };
var BAND = { LOWER: 'ม.ต้น', UPPER: 'ม.ปลาย' };

/** ค่าตั้งค่าเริ่มต้น (เขียนลงชีต "ตั้งค่า" ตอนติดตั้ง แก้ไขได้ภายหลัง) */
var DEFAULT_SETTINGS = [
  ['ปีการศึกษาปัจจุบัน', 2569, 'ปีการศึกษาที่ระบบใช้อ้างอิง'],
  ['ภาคเรียนปัจจุบัน', 1, 'ภาคเรียนปัจจุบัน (1 หรือ 2)'],
  ['คะแนนตั้งต้น', 100, 'คะแนนความประพฤติเมื่อแรกเข้า ม.1 และ ม.4'],
  ['เพดานคะแนนความประพฤติ', 100, 'คะแนนความประพฤติสูงสุด'],
  ['คะแนนความประพฤติต่ำสุด', 0, 'คะแนนความประพฤติต่ำสุด'],
  ['จำนวนอันดับกระดานเกียรติยศ', 10, 'แสดงกี่คนต่อระดับชั้น'],
  ['ขอบเขตไม่เคยกระทำผิด', 'ตั้งแต่แรกเข้า', 'ตั้งแต่แรกเข้า หรือ เฉพาะปีนี้'],
  ['คะแนนความดีขั้นต่ำที่ขึ้นกระดาน', 1, 'ต้องมีคะแนนความดีอย่างน้อยเท่าใด'],
  ['ปกปิดนามสกุลเมื่อไม่ยินยอม', 'ใช่', 'ใช่ = แสดงเป็น "ธนา ข." เมื่อผู้ปกครองไม่ยินยอม'],
  ['วันหมดอายุไฟล์รายงาน', 1, 'ลบไฟล์รายงานใน Drive อัตโนมัติหลังกี่วัน']
];

/** เกณฑ์ความเสี่ยงเริ่มต้น */
var DEFAULT_THRESHOLDS = [
  [91, 100, 'ปกติ',      'ไม่ต้องดำเนินการ', '#0ca30c'],
  [81,  90, 'เฝ้าระวัง',  'ครูที่ปรึกษาให้คำปรึกษาและบันทึกการพบนักเรียน', '#fab219'],
  [71,  80, 'เฝ้าระวัง',  'ครูที่ปรึกษาแจ้งผู้ปกครองรับทราบ', '#fab219'],
  [61,  70, 'เสี่ยง',     'เชิญผู้ปกครองพบครูที่ปรึกษาและหัวหน้าระดับ ครั้งที่ 1', '#ec835a'],
  [51,  60, 'เสี่ยง',     'ทำทัณฑ์บน ครั้งที่ 1 พร้อมแผนปรับเปลี่ยนพฤติกรรม', '#ec835a'],
  [31,  50, 'วิกฤต',     'คณะกรรมการกิจการนักเรียนพิจารณา ทำทัณฑ์บน ครั้งที่ 2', '#d03b3b'],
  [1,   30, 'วิกฤต',     'ส่งต่อระบบดูแลช่วยเหลือนักเรียน ประชุมร่วมฝ่ายบริหาร', '#d03b3b'],
  [0,    0, 'วิกฤต',     'เสนอคณะกรรมการสถานศึกษาพิจารณาตามระเบียบ', '#d03b3b']
];


/* ----------------------------------------------------------------------
 * 01_Db.gs
 * ---------------------------------------------------------------------- */

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

/** เขียนทับข้อมูลทั้งชีต (เก็บหัวตารางไว้) ใช้ตอนคำนวณบัญชีคะแนนใหม่ */
function dbReplaceAll(sheetName, objects) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sh = getSheet_(sheetName);
    var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    if (sh.getLastRow() > 1) {
      sh.getRange(2, 1, sh.getLastRow() - 1, headers.length).clearContent();
    }
    if (objects.length) {
      var hasId = headers.indexOf('รหัส') >= 0;
      var rows = objects.map(function (obj, i) {
        if (hasId) obj['รหัส'] = i + 1;
        return headers.map(function (h) {
          return (obj[h] === undefined || obj[h] === null) ? '' : obj[h];
        });
      });
      sh.getRange(2, 1, rows.length, headers.length).setValues(rows);
    }
    delete _memCache[sheetName];
    return objects.length;
  } finally {
    lock.releaseLock();
  }
}

/**
 * ปีการศึกษาไทยของวันที่ที่ระบุ (ปีการศึกษาเริ่ม 16 พฤษภาคม ถึง 31 มีนาคมปีถัดไป)
 * เช่น 20 มิ.ย. 2026 -> ปีการศึกษา 2569, 15 ก.พ. 2027 -> ปีการศึกษา 2569
 */
function academicYearOf(value) {
  var d = toDate_(value);
  if (!d) return currentYear();
  var be = d.getFullYear() + 543;
  return d.getMonth() + 1 >= 5 ? be : be - 1;
}

/** ภาคเรียนของวันที่ที่ระบุ (พ.ค.–ต.ค. = ภาค 1, พ.ย.–เม.ย. = ภาค 2) */
function termOf(value) {
  var d = toDate_(value);
  if (!d) return currentTerm();
  var m = d.getMonth() + 1;
  return (m >= 5 && m <= 10) ? 1 : 2;
}

/**
 * อ่านวันที่จากข้อความหลายรูปแบบที่โรงเรียนมักใช้ คืนค่าเป็น 'yyyy-MM-dd HH:mm:ss' (ค.ศ.)
 * รองรับ  2026-06-10, 2026-06-10 09:30, 10/06/2569, 10/6/2026, 10-06-2569
 * ปีตั้งแต่ 2400 ขึ้นไปถือว่าเป็น พ.ศ. ระบบจะลบ 543 ให้อัตโนมัติ
 */
function parseFlexibleDate(value) {
  if (!value && value !== 0) return null;
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : Utilities.formatDate(value, APP.TZ, 'yyyy-MM-dd HH:mm:ss');
  }

  var text = String(value).trim();
  if (!text) return null;

  var time = '00:00:00';
  var timeMatch = text.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (timeMatch) {
    time = ('0' + timeMatch[1]).slice(-2) + ':' + timeMatch[2] + ':' + (timeMatch[3] || '00');
    text = text.replace(timeMatch[0], '').trim();
  }

  var y, m, d;
  var iso = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  var dmy = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);

  if (iso)      { y = +iso[1]; m = +iso[2]; d = +iso[3]; }
  else if (dmy) { d = +dmy[1]; m = +dmy[2]; y = +dmy[3]; }
  else return null;

  if (y >= 2400) y -= 543;                       // แปลง พ.ศ. เป็น ค.ศ.
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;

  return y + '-' + ('0' + m).slice(-2) + '-' + ('0' + d).slice(-2) + ' ' + time;
}


/* ----------------------------------------------------------------------
 * 02_Auth.gs
 * ---------------------------------------------------------------------- */

/**
 * 02_Auth.gs — ระบบล็อกอิน เซสชัน และสิทธิ์การใช้งาน
 *
 * รหัสผ่านเก็บเป็นค่าแฮช SHA-256 ที่วนซ้ำ 1,000 รอบพร้อมเกลือสุ่มรายบุคคล
 * (Apps Script ไม่มี bcrypt/argon2 ให้ใช้ การวนซ้ำจึงเป็นวิธีถ่วงเวลาการเดารหัสเท่าที่ทำได้)
 *
 * เซสชันเก็บใน ScriptProperties ซึ่งคงอยู่ถาวรกว่า CacheService
 * และล้างรายการที่หมดอายุทุกครั้งที่มีการล็อกอินใหม่
 */

var SESSION_PREFIX = 'sess_';

/* ---------------------------- รหัสผ่าน ---------------------------- */

function makeSalt_() {
  return Utilities.getUuid().replace(/-/g, '').substring(0, 16);
}

function hashPassword_(password, salt) {
  var value = salt + '|' + password;
  for (var i = 0; i < APP.PBKDF_ROUNDS; i++) {
    var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8);
    value = bytes.map(function (b) {
      return ('0' + (b & 0xFF).toString(16)).slice(-2);
    }).join('');
  }
  return value;
}

/** เทียบสตริงแบบใช้เวลาคงที่ ลดโอกาสถูกโจมตีด้วยการจับเวลา */
function safeEquals_(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* ---------------------------- เซสชัน ---------------------------- */

function createSession_(user) {
  var props = PropertiesService.getScriptProperties();
  purgeExpiredSessions_(props);

  var token = Utilities.getUuid();
  var expires = Date.now() + APP.SESSION_HOURS * 3600 * 1000;
  props.setProperty(SESSION_PREFIX + token, JSON.stringify({
    userId: user['รหัส'],
    username: user['ชื่อผู้ใช้'],
    name: user['ชื่อ-สกุล'],
    role: user['บทบาท'],
    scope: String(user['ขอบเขต'] || ''),
    exp: expires
  }));
  return token;
}

function readSession_(token) {
  if (!token) return null;
  var raw = PropertiesService.getScriptProperties().getProperty(SESSION_PREFIX + token);
  if (!raw) return null;
  var s;
  try { s = JSON.parse(raw); } catch (e) { return null; }
  if (!s.exp || s.exp < Date.now()) {
    PropertiesService.getScriptProperties().deleteProperty(SESSION_PREFIX + token);
    return null;
  }
  return s;
}

function purgeExpiredSessions_(props) {
  props = props || PropertiesService.getScriptProperties();
  var all = props.getProperties();
  var now = Date.now();
  Object.keys(all).forEach(function (key) {
    if (key.indexOf(SESSION_PREFIX) !== 0) return;
    try {
      var s = JSON.parse(all[key]);
      if (!s.exp || s.exp < now) props.deleteProperty(key);
    } catch (e) {
      props.deleteProperty(key);
    }
  });
}

/**
 * ตรวจสอบเซสชันของทุกคำขอ — ฟังก์ชัน API ทุกตัวต้องเรียกตัวนี้เป็นบรรทัดแรก
 * คืนค่า object ผู้ใช้ หรือโยน error ถ้าเซสชันหมดอายุ
 */
function requireUser_(token) {
  var s = readSession_(token);
  if (!s) throw new Error('เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง');
  return s;
}

function requirePermission_(token, capability) {
  var user = requireUser_(token);
  if (!hasPermission_(user, capability)) {
    throw new Error('คุณไม่มีสิทธิ์ดำเนินการนี้ (' + capability + ')');
  }
  return user;
}

function hasPermission_(user, capability) {
  var allowed = PERMISSIONS[capability];
  return !!allowed && allowed.indexOf(user.role) >= 0;
}

/** รายการสิทธิ์ทั้งหมดของผู้ใช้ ส่งให้หน้าบ้านใช้ซ่อน/แสดงเมนู */
function permissionsOf_(user) {
  var out = {};
  Object.keys(PERMISSIONS).forEach(function (cap) {
    out[cap] = hasPermission_(user, cap);
  });
  return out;
}

/* ---------------------------- API ---------------------------- */

function apiLogin(username, password) {
  return safeCall_(function () {
    username = String(username || '').trim().toLowerCase();
    if (!username || !password) throw new Error('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน');

    var user = dbFind(SHEETS.USERS, function (u) {
      return String(u['ชื่อผู้ใช้']).trim().toLowerCase() === username;
    });

    // ข้อความเดียวกันทั้งกรณีไม่มีผู้ใช้และรหัสผ่านผิด ไม่ให้เดาว่ามีบัญชีนี้อยู่จริงหรือไม่
    var failMsg = 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง';
    if (!user) throw new Error(failMsg);
    if (String(user['ใช้งาน']) !== 'ใช่') throw new Error('บัญชีนี้ถูกระงับการใช้งาน');

    var hashed = hashPassword_(String(password), String(user['เกลือ']));
    if (!safeEquals_(hashed, String(user['รหัสผ่าน(เข้ารหัส)']))) throw new Error(failMsg);

    var token = createSession_(user);
    dbUpdateRow(SHEETS.USERS, user._row, { 'เข้าใช้ล่าสุด': nowStr() });
    logAudit({ username: user['ชื่อผู้ใช้'], role: user['บทบาท'] }, 'เข้าสู่ระบบ', '', '');

    return {
      token: token,
      user: {
        id: user['รหัส'],
        username: user['ชื่อผู้ใช้'],
        name: user['ชื่อ-สกุล'],
        role: user['บทบาท'],
        roleName: (ROLES[user['บทบาท']] || {}).name || user['บทบาท'],
        scope: String(user['ขอบเขต'] || ''),
        mustChangePassword: String(user['ต้องเปลี่ยนรหัสผ่าน']) === 'ใช่'
      },
      permissions: permissionsOf_({ role: user['บทบาท'] }),
      app: { name: APP.NAME, school: APP.SCHOOL, version: APP.VERSION, year: currentYear(), term: currentTerm() }
    };
  });
}

function apiLogout(token) {
  return safeCall_(function () {
    if (token) PropertiesService.getScriptProperties().deleteProperty(SESSION_PREFIX + token);
    return { ok: true };
  });
}

function apiMe(token) {
  return safeCall_(function () {
    var s = requireUser_(token);
    return {
      user: {
        id: s.userId, username: s.username, name: s.name, role: s.role,
        roleName: (ROLES[s.role] || {}).name || s.role, scope: s.scope
      },
      permissions: permissionsOf_(s),
      app: { name: APP.NAME, school: APP.SCHOOL, version: APP.VERSION, year: currentYear(), term: currentTerm() }
    };
  });
}

function apiChangePassword(token, oldPassword, newPassword) {
  return safeCall_(function () {
    var s = requireUser_(token);
    if (String(newPassword || '').length < 8) throw new Error('รหัสผ่านใหม่ต้องยาวอย่างน้อย 8 ตัวอักษร');

    var user = dbFind(SHEETS.USERS, function (u) { return u['รหัส'] === s.userId; });
    if (!user) throw new Error('ไม่พบบัญชีผู้ใช้');
    if (!safeEquals_(hashPassword_(String(oldPassword), String(user['เกลือ'])), String(user['รหัสผ่าน(เข้ารหัส)']))) {
      throw new Error('รหัสผ่านเดิมไม่ถูกต้อง');
    }

    var salt = makeSalt_();
    dbUpdateRow(SHEETS.USERS, user._row, {
      'เกลือ': salt,
      'รหัสผ่าน(เข้ารหัส)': hashPassword_(String(newPassword), salt),
      'ต้องเปลี่ยนรหัสผ่าน': 'ไม่'
    });
    logAudit(s, 'เปลี่ยนรหัสผ่าน', s.username, '');
    return { ok: true };
  });
}

/* ---------------------------- จัดการผู้ใช้ (ผู้ดูแลระบบ) ---------------------------- */

function apiListUsers(token) {
  return safeCall_(function () {
    requirePermission_(token, 'user.manage');
    return dbReadAll(SHEETS.USERS).map(function (u) {
      return {
        id: u['รหัส'], username: u['ชื่อผู้ใช้'], name: u['ชื่อ-สกุล'],
        role: u['บทบาท'], roleName: (ROLES[u['บทบาท']] || {}).name || u['บทบาท'],
        scope: String(u['ขอบเขต'] || ''), email: u['อีเมล'], phone: u['โทรศัพท์'],
        active: String(u['ใช้งาน']) === 'ใช่', lastLogin: u['เข้าใช้ล่าสุด']
      };
    });
  });
}

function apiSaveUser(token, payload) {
  return safeCall_(function () {
    var s = requirePermission_(token, 'user.manage');
    var username = String(payload.username || '').trim().toLowerCase();
    if (!username) throw new Error('กรุณาระบุชื่อผู้ใช้');
    if (!ROLES[payload.role]) throw new Error('บทบาทไม่ถูกต้อง');

    var existing = dbFind(SHEETS.USERS, function (u) {
      return String(u['ชื่อผู้ใช้']).trim().toLowerCase() === username;
    });

    if (payload.id) {
      var user = dbFind(SHEETS.USERS, function (u) { return u['รหัส'] === payload.id; });
      if (!user) throw new Error('ไม่พบบัญชีผู้ใช้');
      if (existing && existing['รหัส'] !== payload.id) throw new Error('ชื่อผู้ใช้นี้มีอยู่แล้ว');

      var changes = {
        'ชื่อผู้ใช้': username, 'ชื่อ-สกุล': payload.name, 'บทบาท': payload.role,
        'ขอบเขต': payload.scope || '', 'อีเมล': payload.email || '',
        'โทรศัพท์': payload.phone || '', 'ใช้งาน': payload.active ? 'ใช่' : 'ไม่'
      };
      if (payload.password) {
        var salt2 = makeSalt_();
        changes['เกลือ'] = salt2;
        changes['รหัสผ่าน(เข้ารหัส)'] = hashPassword_(String(payload.password), salt2);
        changes['ต้องเปลี่ยนรหัสผ่าน'] = 'ใช่';
      }
      dbUpdateRow(SHEETS.USERS, user._row, changes);
      logAudit(s, 'แก้ไขผู้ใช้', username, '');
      return { ok: true, id: payload.id };
    }

    if (existing) throw new Error('ชื่อผู้ใช้นี้มีอยู่แล้ว');
    if (String(payload.password || '').length < 8) throw new Error('รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร');

    var salt = makeSalt_();
    var created = dbInsert(SHEETS.USERS, {
      'ชื่อผู้ใช้': username,
      'รหัสผ่าน(เข้ารหัส)': hashPassword_(String(payload.password), salt),
      'เกลือ': salt,
      'ชื่อ-สกุล': payload.name,
      'บทบาท': payload.role,
      'ขอบเขต': payload.scope || '',
      'อีเมล': payload.email || '',
      'โทรศัพท์': payload.phone || '',
      'ใช้งาน': 'ใช่',
      'ต้องเปลี่ยนรหัสผ่าน': 'ใช่',
      'เข้าใช้ล่าสุด': '',
      'สร้างเมื่อ': nowStr()
    });
    logAudit(s, 'เพิ่มผู้ใช้', username, 'บทบาท ' + payload.role);
    return { ok: true, id: created['รหัส'] };
  });
}


/* ----------------------------------------------------------------------
 * 03_Scoring.gs
 * ---------------------------------------------------------------------- */

/**
 * 03_Scoring.gs — กลไกคะแนนและกระดานเกียรติยศ
 *
 * บัญชีคะแนนมี 2 ชุด
 *   ความประพฤติ  0-100 (เพดานตายตัว) ใช้ตัดสินทางวินัย
 *   ความดีสะสม   ไม่มีเพดาน ไม่เคยลด ใช้จัดอันดับกระดานเกียรติยศ
 *
 * ทำความดี  +N -> ความดีสะสม += N ; ความประพฤติ = min(100, ความประพฤติ + N)
 * ทำความผิด -N -> ความประพฤติ = max(0, ความประพฤติ - N) ; ความดีสะสมไม่เปลี่ยน
 *
 * ทุกการเปลี่ยนคะแนนต้องมีรายการในชีต "บัญชีคะแนน" เสมอ ตรวจสอบย้อนหลังได้ทุกคะแนน
 */

function ensureBalance_(studentId, year) {
  var bal = dbFind(SHEETS.BALANCES, function (b) {
    return b['รหัสนักเรียน(ระบบ)'] === studentId && Number(b['ปีการศึกษา']) === Number(year);
  });
  if (bal) return bal;

  var initial = getSettingNumber('คะแนนตั้งต้น', 100);
  dbInsert(SHEETS.BALANCES, {
    'รหัสนักเรียน(ระบบ)': studentId, 'ปีการศึกษา': year,
    'คะแนนความประพฤติ': initial, 'คะแนนความดีสะสม': 0, 'คะแนนที่ถูกหัก': 0,
    'ครั้งที่ทำความดี': 0, 'ครั้งที่ทำผิด': 0, 'ความดีล่าสุด': '', 'ความผิดล่าสุด': '',
    'ระดับความเสี่ยง': riskLevelOf_(initial).level, 'ปรับปรุงเมื่อ': nowStr()
  });
  dbInsert(SHEETS.LEDGER, {
    'รหัสนักเรียน(ระบบ)': studentId, 'ปีการศึกษา': year, 'บัญชี': ACCOUNT.CONDUCT,
    'ประเภทรายการ': 'คะแนนตั้งต้น', 'คะแนนที่เปลี่ยน': initial, 'ยอดคงเหลือ': initial,
    'อ้างอิงบันทึก': '', 'เหตุผล': 'คะแนนความประพฤติตั้งต้นเมื่อแรกเข้า',
    'ผู้ทำรายการ': '(ระบบ)', 'เมื่อ': nowStr()
  });

  return dbFind(SHEETS.BALANCES, function (b) {
    return b['รหัสนักเรียน(ระบบ)'] === studentId && Number(b['ปีการศึกษา']) === Number(year);
  });
}

function riskLevelOf_(score) {
  var rows = dbReadAll(SHEETS.THRESHOLDS);
  for (var i = 0; i < rows.length; i++) {
    if (score >= Number(rows[i]['คะแนนต่ำสุด']) && score <= Number(rows[i]['คะแนนสูงสุด'])) {
      return { level: rows[i]['ระดับ'], action: rows[i]['การดำเนินการ'], color: rows[i]['สี'] };
    }
  }
  return { level: 'ปกติ', action: '', color: '#0ca30c' };
}

/** ลงบัญชีคะแนนจากบันทึกที่ได้รับอนุมัติ */
function postRecord_(record, actor) {
  var studentId = record['รหัสนักเรียน(ระบบ)'];
  var year = Number(record['ปีการศึกษา']);
  var points = Number(record['คะแนน']);
  var bal = ensureBalance_(studentId, year);

  var maxScore = getSettingNumber('เพดานคะแนนความประพฤติ', 100);
  var minScore = getSettingNumber('คะแนนความประพฤติต่ำสุด', 0);
  var conduct = Number(bal['คะแนนความประพฤติ']);
  var merit = Number(bal['คะแนนความดีสะสม']);
  var ledgerRows = [];
  var changes = { 'ปรับปรุงเมื่อ': nowStr() };
  var actorName = actor ? actor.name : '(ระบบ)';

  if (record['ประเภท'] === KIND.MERIT) {
    var newMerit = merit + points;
    ledgerRows.push(ledgerRow_(studentId, year, ACCOUNT.MERIT, 'ความดี', points, newMerit,
      record['เลขที่บันทึก'], 'คะแนนความดีตามบันทึก ' + record['เลขที่บันทึก'], actorName));

    var newConduct = Math.min(maxScore, conduct + points);
    if (newConduct !== conduct) {
      ledgerRows.push(ledgerRow_(studentId, year, ACCOUNT.CONDUCT, 'ความดี', newConduct - conduct,
        newConduct, record['เลขที่บันทึก'], 'คืนคะแนนความประพฤติจากการทำความดี', actorName));
    }

    changes['คะแนนความดีสะสม'] = newMerit;
    changes['คะแนนความประพฤติ'] = newConduct;
    changes['ครั้งที่ทำความดี'] = Number(bal['ครั้งที่ทำความดี']) + 1;
    changes['ความดีล่าสุด'] = record['วันเวลาที่เกิดเหตุ'];
    changes['ระดับความเสี่ยง'] = riskLevelOf_(newConduct).level;
  } else {
    var afterDemerit = Math.max(minScore, conduct - points);
    ledgerRows.push(ledgerRow_(studentId, year, ACCOUNT.CONDUCT, 'ความผิด', afterDemerit - conduct,
      afterDemerit, record['เลขที่บันทึก'], 'หักคะแนนตามบันทึก ' + record['เลขที่บันทึก'], actorName));

    changes['คะแนนความประพฤติ'] = afterDemerit;
    changes['คะแนนที่ถูกหัก'] = Number(bal['คะแนนที่ถูกหัก']) + points;
    changes['ครั้งที่ทำผิด'] = Number(bal['ครั้งที่ทำผิด']) + 1;
    changes['ความผิดล่าสุด'] = record['วันเวลาที่เกิดเหตุ'];
    changes['ระดับความเสี่ยง'] = riskLevelOf_(afterDemerit).level;
  }

  dbInsertMany(SHEETS.LEDGER, ledgerRows);
  dbUpdateRow(SHEETS.BALANCES, bal._row, changes);
  return changes;
}

/** กลับรายการเมื่อบันทึกถูกเพิกถอนหรืออุทธรณ์สำเร็จ */
function reverseRecord_(record, reason, actor) {
  var studentId = record['รหัสนักเรียน(ระบบ)'];
  var year = Number(record['ปีการศึกษา']);
  var points = Number(record['คะแนน']);
  var bal = ensureBalance_(studentId, year);

  var entries = dbFilter(SHEETS.LEDGER, function (l) {
    return l['อ้างอิงบันทึก'] === record['เลขที่บันทึก'] && l['ประเภทรายการ'] !== 'ปรับปรุง';
  });
  if (!entries.length) return null;

  var conduct = Number(bal['คะแนนความประพฤติ']);
  var merit = Number(bal['คะแนนความดีสะสม']);
  var rows = [];
  var actorName = actor ? actor.name : '(ระบบ)';

  entries.forEach(function (e) {
    var delta = -Number(e['คะแนนที่เปลี่ยน']);
    if (e['บัญชี'] === ACCOUNT.CONDUCT) {
      conduct += delta;
      rows.push(ledgerRow_(studentId, year, ACCOUNT.CONDUCT, 'ปรับปรุง', delta, conduct,
        record['เลขที่บันทึก'], reason || 'กลับรายการบันทึกที่ถูกเพิกถอน', actorName));
    } else {
      merit += delta;
      rows.push(ledgerRow_(studentId, year, ACCOUNT.MERIT, 'ปรับปรุง', delta, merit,
        record['เลขที่บันทึก'], reason || 'กลับรายการบันทึกที่ถูกเพิกถอน', actorName));
    }
  });

  var changes = {
    'คะแนนความประพฤติ': conduct,
    'คะแนนความดีสะสม': merit,
    'ระดับความเสี่ยง': riskLevelOf_(conduct).level,
    'ปรับปรุงเมื่อ': nowStr()
  };
  if (record['ประเภท'] === KIND.MERIT) {
    changes['ครั้งที่ทำความดี'] = Math.max(0, Number(bal['ครั้งที่ทำความดี']) - 1);
  } else {
    changes['ครั้งที่ทำผิด'] = Math.max(0, Number(bal['ครั้งที่ทำผิด']) - 1);
    changes['คะแนนที่ถูกหัก'] = Math.max(0, Number(bal['คะแนนที่ถูกหัก']) - points);
  }

  dbInsertMany(SHEETS.LEDGER, rows);
  dbUpdateRow(SHEETS.BALANCES, bal._row, changes);
  return changes;
}

function ledgerRow_(studentId, year, account, type, delta, after, recordNo, reason, actorName) {
  return {
    'รหัสนักเรียน(ระบบ)': studentId, 'ปีการศึกษา': year, 'บัญชี': account,
    'ประเภทรายการ': type, 'คะแนนที่เปลี่ยน': delta, 'ยอดคงเหลือ': after,
    'อ้างอิงบันทึก': recordNo || '', 'เหตุผล': reason, 'ผู้ทำรายการ': actorName, 'เมื่อ': nowStr()
  };
}

/* ------------------------------------------------------------------ */
/* กระดานเกียรติยศ                                                      */
/* ------------------------------------------------------------------ */

/**
 * คำนวณอันดับนักเรียนคะแนนความดีสูงสุด แยก ม.ต้น / ม.ปลาย
 * เงื่อนไข: สถานะปกติ + ไม่เคยมีบันทึกความผิดที่อนุมัติแล้ว
 *          + คะแนนความประพฤติเต็ม + มีคะแนนความดีตามขั้นต่ำ
 */
function computeLeaderboard_() {
  var year = currentYear();
  var limit = getSettingNumber('จำนวนอันดับกระดานเกียรติยศ', 10);
  var minMerit = getSettingNumber('คะแนนความดีขั้นต่ำที่ขึ้นกระดาน', 1);
  var maxScore = getSettingNumber('เพดานคะแนนความประพฤติ', 100);
  var scope = String(getSetting('ขอบเขตไม่เคยกระทำผิด', 'ตั้งแต่แรกเข้า'));

  // นับความผิดที่อนุมัติแล้วของนักเรียนแต่ละคน
  var demeritByStudent = {};
  dbReadAll(SHEETS.RECORDS).forEach(function (r) {
    if (r['ประเภท'] !== KIND.DEMERIT || r['สถานะ'] !== STATUS.APPROVED) return;
    if (scope === 'เฉพาะปีนี้' && Number(r['ปีการศึกษา']) !== year) return;
    var id = r['รหัสนักเรียน(ระบบ)'];
    demeritByStudent[id] = (demeritByStudent[id] || 0) + 1;
  });

  var balanceByStudent = {};
  dbReadAll(SHEETS.BALANCES).forEach(function (b) {
    if (Number(b['ปีการศึกษา']) === year) balanceByStudent[b['รหัสนักเรียน(ระบบ)']] = b;
  });

  var candidates = [];
  dbReadAll(SHEETS.STUDENTS).forEach(function (s) {
    if (String(s['สถานะ']) !== 'ปกติ') return;
    if (demeritByStudent[s['รหัส']]) return;                 // เคยกระทำผิด -> ตัดออก

    var b = balanceByStudent[s['รหัส']];
    if (!b) return;
    var merit = Number(b['คะแนนความดีสะสม']) || 0;
    if (Number(b['คะแนนความประพฤติ']) < maxScore) return;
    if (merit < minMerit) return;

    candidates.push({
      band: levelBand(s['ระดับชั้น']),
      studentId: s['รหัส'],
      studentCode: String(s['รหัสนักเรียน']),
      displayName: publicName(s),
      fullName: studentFullName(s),
      classLabel: classLabel(s['ระดับชั้น'], s['ห้อง']),
      meritTotal: merit,
      meritCount: Number(b['ครั้งที่ทำความดี']) || 0,
      conductScore: Number(b['คะแนนความประพฤติ']),
      lastMeritAt: b['ความดีล่าสุด'] ? new Date(b['ความดีล่าสุด']).getTime() : Infinity
    });
  });

  // เรียง: คะแนนมาก > จำนวนครั้งมาก > ทำสำเร็จก่อน > รหัสนักเรียนน้อย
  // ข้อสุดท้ายทำให้ผลลัพธ์คงที่ ไม่สลับอันดับไปมาทุกครั้งที่รีเฟรช
  candidates.sort(function (a, b) {
    return (b.meritTotal - a.meritTotal)
        || (b.meritCount - a.meritCount)
        || (a.lastMeritAt - b.lastMeritAt)
        || a.studentCode.localeCompare(b.studentCode);
  });

  var result = {};
  result[BAND.LOWER] = [];
  result[BAND.UPPER] = [];
  candidates.forEach(function (c) {
    if (result[c.band].length < limit) {
      c.rank = result[c.band].length + 1;
      result[c.band].push(c);
    }
  });
  return result;
}

/** บันทึกอันดับลงชีต เพื่อให้หน้าหลักอ่านข้อมูลที่ "นิ่ง" และย้อนตรวจได้ */
function publishLeaderboard_(actor) {
  var board = computeLeaderboard_();
  var sh = getSheet_(SHEETS.LEADERBOARD);
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
  dbClearCache(SHEETS.LEADERBOARD);

  var stamp = nowStr();
  var rows = [];
  [BAND.LOWER, BAND.UPPER].forEach(function (band) {
    board[band].forEach(function (c) {
      rows.push({
        'ระดับ': band, 'อันดับ': c.rank, 'รหัสนักเรียน(ระบบ)': c.studentId,
        'ชื่อที่แสดง': c.displayName, 'ห้อง': c.classLabel,
        'คะแนนความดี': c.meritTotal, 'คะแนนความประพฤติ': c.conductScore, 'สร้างเมื่อ': stamp
      });
    });
  });
  dbInsertMany(SHEETS.LEADERBOARD, rows);
  if (actor) logAudit(actor, 'ประกาศกระดานเกียรติยศ', '', rows.length + ' รายการ');
  return { count: rows.length, at: stamp };
}

/**
 * ตัวช่วยซ่อมข้อมูล: คำนวณบัญชีเดินคะแนนและยอดคงเหลือใหม่ทั้งระบบ
 * จากบันทึกที่อนุมัติแล้วทั้งหมด เรียงตามเวลาที่เกิดเหตุจริง
 */
function rebuildAllBalances() {
  return recomputeLedgerFor_(null);
}

/* ------------------------------------------------------------------ */
/* คำนวณบัญชีคะแนนใหม่แบบเรียงตามเวลา                                    */
/* ------------------------------------------------------------------ */

/**
 * สร้างบัญชีเดินคะแนนและยอดคงเหลือใหม่จากบันทึกที่อนุมัติแล้ว โดยเรียงตามเวลาที่เกิดเหตุ
 *
 * จำเป็นต้องเรียงตามเวลา เพราะคะแนนความประพฤติมีเพดาน 100 ลำดับเหตุการณ์จึงมีผลต่อผลลัพธ์
 * เช่น นักเรียนเหลือ 80 แล้วนำเข้าบันทึกความดี +10 ของเดือนก่อน
 * ถ้าคิดตามลำดับที่บันทึกเข้าระบบจะได้ 90 แต่ที่ถูกต้องตามเวลาจริงคือ 80
 * (ความดีเกิดก่อนตอนที่คะแนนยังเต็ม 100 จึงชนเพดานไม่เพิ่มคะแนน แล้วค่อยถูกหัก 20)
 *
 * @param pairs รายการ {studentId, year} ที่ต้องการคำนวณใหม่ ถ้าเป็น null = คำนวณใหม่ทั้งระบบ
 */
function recomputeLedgerFor_(pairs) {
  var scope = null;
  if (pairs) {
    scope = {};
    pairs.forEach(function (p) { scope[p.studentId + '|' + p.year] = true; });
  }

  var initial  = getSettingNumber('คะแนนตั้งต้น', 100);
  var maxScore = getSettingNumber('เพดานคะแนนความประพฤติ', 100);
  var minScore = getSettingNumber('คะแนนความประพฤติต่ำสุด', 0);

  function inScope(studentId, year) {
    return !scope || scope[studentId + '|' + year];
  }

  // แถวที่ไม่เกี่ยวข้องกับการคำนวณรอบนี้ ให้คงไว้เหมือนเดิม
  var keptLedger = dbReadAll(SHEETS.LEDGER).filter(function (l) {
    return !inScope(l['รหัสนักเรียน(ระบบ)'], Number(l['ปีการศึกษา']));
  });
  var keptBalances = dbReadAll(SHEETS.BALANCES).filter(function (b) {
    return !inScope(b['รหัสนักเรียน(ระบบ)'], Number(b['ปีการศึกษา']));
  });

  var groups = {};
  if (scope) Object.keys(scope).forEach(function (k) { groups[k] = []; });

  dbReadAll(SHEETS.RECORDS).forEach(function (r) {
    if (r['สถานะ'] !== STATUS.APPROVED) return;
    var key = r['รหัสนักเรียน(ระบบ)'] + '|' + Number(r['ปีการศึกษา']);
    if (scope && !scope[key]) return;
    (groups[key] = groups[key] || []).push(r);
  });

  // นักเรียนที่ยังไม่มีบันทึกใด ๆ ก็ต้องมียอดตั้งต้นของปีการศึกษาปัจจุบัน
  if (!scope) {
    var year = currentYear();
    dbReadAll(SHEETS.STUDENTS).forEach(function (s) {
      var key = s['รหัส'] + '|' + year;
      if (!groups[key]) groups[key] = [];
    });
  }

  var stamp = nowStr();
  var newLedger = [], newBalances = [];

  Object.keys(groups).forEach(function (key) {
    var parts = key.split('|');
    var studentId = isNaN(Number(parts[0])) ? parts[0] : Number(parts[0]);
    var year = Number(parts[1]);

    var records = groups[key].slice().sort(function (a, b) {
      return new Date(a['วันเวลาที่เกิดเหตุ']) - new Date(b['วันเวลาที่เกิดเหตุ']);
    });

    var conduct = initial, merit = 0, demerit = 0;
    var meritCount = 0, demeritCount = 0, lastMerit = '', lastDemerit = '';

    newLedger.push({
      'รหัสนักเรียน(ระบบ)': studentId, 'ปีการศึกษา': year, 'บัญชี': ACCOUNT.CONDUCT,
      'ประเภทรายการ': 'คะแนนตั้งต้น', 'คะแนนที่เปลี่ยน': initial, 'ยอดคงเหลือ': initial,
      'อ้างอิงบันทึก': '', 'เหตุผล': 'คะแนนความประพฤติตั้งต้นเมื่อแรกเข้า',
      'ผู้ทำรายการ': '(ระบบ)', 'เมื่อ': stamp
    });

    records.forEach(function (r) {
      var points = Number(r['คะแนน']);
      var actor = r['ผู้พิจารณา'] || r['ผู้บันทึก'] || '(ระบบ)';

      if (r['ประเภท'] === KIND.MERIT) {
        merit += points;
        newLedger.push(ledgerRow_(studentId, year, ACCOUNT.MERIT, 'ความดี', points, merit,
          r['เลขที่บันทึก'], 'คะแนนความดีตามบันทึก ' + r['เลขที่บันทึก'], actor));

        var after = Math.min(maxScore, conduct + points);
        if (after !== conduct) {
          newLedger.push(ledgerRow_(studentId, year, ACCOUNT.CONDUCT, 'ความดี', after - conduct, after,
            r['เลขที่บันทึก'], 'คืนคะแนนความประพฤติจากการทำความดี', actor));
          conduct = after;
        }
        meritCount++;
        lastMerit = r['วันเวลาที่เกิดเหตุ'];
      } else {
        var afterDemerit = Math.max(minScore, conduct - points);
        newLedger.push(ledgerRow_(studentId, year, ACCOUNT.CONDUCT, 'ความผิด',
          afterDemerit - conduct, afterDemerit, r['เลขที่บันทึก'],
          'หักคะแนนตามบันทึก ' + r['เลขที่บันทึก'], actor));
        conduct = afterDemerit;
        demerit += points;
        demeritCount++;
        lastDemerit = r['วันเวลาที่เกิดเหตุ'];
      }
    });

    newBalances.push({
      'รหัสนักเรียน(ระบบ)': studentId, 'ปีการศึกษา': year,
      'คะแนนความประพฤติ': conduct, 'คะแนนความดีสะสม': merit, 'คะแนนที่ถูกหัก': demerit,
      'ครั้งที่ทำความดี': meritCount, 'ครั้งที่ทำผิด': demeritCount,
      'ความดีล่าสุด': lastMerit, 'ความผิดล่าสุด': lastDemerit,
      'ระดับความเสี่ยง': riskLevelOf_(conduct).level, 'ปรับปรุงเมื่อ': stamp
    });
  });

  dbReplaceAll(SHEETS.LEDGER, keptLedger.concat(newLedger));
  dbReplaceAll(SHEETS.BALANCES, keptBalances.concat(newBalances));
  return newBalances.length;
}


/* ----------------------------------------------------------------------
 * 04_Api.gs
 * ---------------------------------------------------------------------- */

/**
 * 04_Api.gs — ฟังก์ชันที่หน้าเว็บเรียกผ่าน google.script.run
 *
 * ทุกฟังก์ชันคืนค่ารูปแบบเดียวกัน { ok: true, data: ... } หรือ { ok: false, error: '...' }
 * หน้าบ้านจึงจัดการข้อผิดพลาดได้ที่เดียว
 */

function safeCall_(fn) {
  try {
    return { ok: true, data: fn() };
  } catch (e) {
    console.error(e.stack || e.message);
    return { ok: false, error: e.message || String(e) };
  }
}

/* ------------------------------------------------------------------ */
/* ขอบเขตการมองเห็นข้อมูลตามบทบาท                                        */
/* ------------------------------------------------------------------ */

/**
 * ครูที่ปรึกษาเห็นเฉพาะห้องที่รับผิดชอบ (ขอบเขต เช่น "1/1,1/2")
 * หัวหน้าระดับชั้นเห็นเฉพาะระดับของตน (ขอบเขต เช่น "1,2,3")
 * ครูผู้สอนค้นหานักเรียนได้ทุกคนเพื่อบันทึกพฤติกรรม แต่ดูประวัติเต็มไม่ได้
 */
function scopeFilter_(user) {
  var scope = String(user.scope || '').trim();
  if (hasPermission_(user, 'record.viewAll') || !scope) {
    return function () { return true; };
  }
  if (user.role === 'homeroom') {
    var rooms = scope.split(',').map(function (x) { return x.trim(); });
    return function (s) { return rooms.indexOf(s['ระดับชั้น'] + '/' + s['ห้อง']) >= 0; };
  }
  if (user.role === 'level_head') {
    var grades = scope.split(',').map(function (x) { return x.trim(); });
    return function (s) { return grades.indexOf(String(s['ระดับชั้น'])) >= 0; };
  }
  return function () { return true; };
}

function canSeeFullHistory_(user, student) {
  if (hasPermission_(user, 'record.viewAll')) return true;
  return scopeFilter_(user)(student);
}

/* ------------------------------------------------------------------ */
/* แดชบอร์ด                                                            */
/* ------------------------------------------------------------------ */

function apiDashboard(token) {
  return safeCall_(function () {
    var user = requireUser_(token);
    var year = currentYear();
    var students = dbReadAll(SHEETS.STUDENTS).filter(function (s) { return String(s['สถานะ']) === 'ปกติ'; });
    var balances = {};
    dbReadAll(SHEETS.BALANCES).forEach(function (b) {
      if (Number(b['ปีการศึกษา']) === year) balances[b['รหัสนักเรียน(ระบบ)']] = b;
    });
    var records = dbReadAll(SHEETS.RECORDS).filter(function (r) { return Number(r['ปีการศึกษา']) === year; });
    var approved = records.filter(function (r) { return r['สถานะ'] === STATUS.APPROVED; });

    // ---- ตัวเลขสรุป ----
    var scoreSum = 0, scored = 0, risk = { 'ปกติ': 0, 'เฝ้าระวัง': 0, 'เสี่ยง': 0, 'วิกฤต': 0 };
    students.forEach(function (s) {
      var b = balances[s['รหัส']];
      var score = b ? Number(b['คะแนนความประพฤติ']) : getSettingNumber('คะแนนตั้งต้น', 100);
      scoreSum += score; scored++;
      var level = b ? String(b['ระดับความเสี่ยง']) : 'ปกติ';
      if (risk[level] === undefined) risk[level] = 0;
      risk[level]++;
    });

    var thisMonth = Utilities.formatDate(new Date(), APP.TZ, 'yyyy-MM');
    var monthMerit = 0, monthDemerit = 0;
    approved.forEach(function (r) {
      var d = toDate_(r['วันเวลาที่เกิดเหตุ']);
      if (!d || Utilities.formatDate(d, APP.TZ, 'yyyy-MM') !== thisMonth) return;
      if (r['ประเภท'] === KIND.MERIT) monthMerit++; else monthDemerit++;
    });

    // ---- แนวโน้ม 6 เดือนล่าสุด ----
    var months = [];
    var cursor = new Date();
    cursor.setDate(1);
    for (var i = 5; i >= 0; i--) {
      var d = new Date(cursor.getFullYear(), cursor.getMonth() - i, 1);
      months.push({
        key: Utilities.formatDate(d, APP.TZ, 'yyyy-MM'),
        label: TH_MONTHS[d.getMonth()].substring(0, 3) + ' ' + String((d.getFullYear() + 543) % 100),
        merit: 0, demerit: 0
      });
    }
    var monthIndex = {};
    months.forEach(function (m, idx) { monthIndex[m.key] = idx; });
    approved.forEach(function (r) {
      var d = toDate_(r['วันเวลาที่เกิดเหตุ']);
      if (!d) return;
      var idx = monthIndex[Utilities.formatDate(d, APP.TZ, 'yyyy-MM')];
      if (idx === undefined) return;
      if (r['ประเภท'] === KIND.MERIT) months[idx].merit++; else months[idx].demerit++;
    });

    // ---- พฤติกรรมที่พบบ่อย ----
    var violationCount = {};
    approved.forEach(function (r) {
      if (r['ประเภท'] !== KIND.DEMERIT) return;
      var key = r['ชื่อเกณฑ์'];
      violationCount[key] = (violationCount[key] || 0) + 1;
    });
    var topViolations = Object.keys(violationCount)
      .map(function (k) { return { name: k, count: violationCount[k] }; })
      .sort(function (a, b) { return b.count - a.count; })
      .slice(0, 5);

    // ---- คะแนนเฉลี่ยรายระดับชั้น ----
    var byGrade = {};
    students.forEach(function (s) {
      var g = Number(s['ระดับชั้น']);
      if (!byGrade[g]) byGrade[g] = { sum: 0, n: 0 };
      var b = balances[s['รหัส']];
      byGrade[g].sum += b ? Number(b['คะแนนความประพฤติ']) : getSettingNumber('คะแนนตั้งต้น', 100);
      byGrade[g].n++;
    });
    var gradeAvg = [1, 2, 3, 4, 5, 6].filter(function (g) { return byGrade[g]; })
      .map(function (g) {
        return { label: 'ม.' + g, value: Math.round(byGrade[g].sum / byGrade[g].n * 10) / 10, n: byGrade[g].n };
      });

    var pending = records.filter(function (r) { return r['สถานะ'] === STATUS.SUBMITTED; }).length;
    var board = computeLeaderboard_();

    return {
      stats: {
        students: students.length,
        avgScore: scored ? Math.round(scoreSum / scored * 10) / 10 : 0,
        monthMerit: monthMerit,
        monthDemerit: monthDemerit,
        atRisk: (risk['เสี่ยง'] || 0) + (risk['วิกฤต'] || 0),
        watch: risk['เฝ้าระวัง'] || 0,
        pending: pending,
        meritRatio: monthDemerit ? Math.round(monthMerit / monthDemerit * 10) / 10 : null
      },
      risk: risk,
      months: months,
      topViolations: topViolations,
      gradeAvg: gradeAvg,
      leaderboard: {
        lower: board[BAND.LOWER].slice(0, 5),
        upper: board[BAND.UPPER].slice(0, 5)
      },
      canApprove: hasPermission_(user, 'record.approve')
    };
  });
}

/* ------------------------------------------------------------------ */
/* นักเรียน                                                            */
/* ------------------------------------------------------------------ */

function apiSearchStudents(token, query, filters) {
  return safeCall_(function () {
    var user = requirePermission_(token, 'student.view');
    var year = currentYear();
    filters = filters || {};
    var q = String(query || '').trim().toLowerCase();

    var balances = {};
    dbReadAll(SHEETS.BALANCES).forEach(function (b) {
      if (Number(b['ปีการศึกษา']) === year) balances[b['รหัสนักเรียน(ระบบ)']] = b;
    });

    var out = [];
    dbReadAll(SHEETS.STUDENTS).forEach(function (s) {
      if (filters.limit && out.length >= filters.limit) return;
      if (filters.activeOnly !== false && String(s['สถานะ']) !== 'ปกติ') return;
      if (filters.grade && Number(s['ระดับชั้น']) !== Number(filters.grade)) return;
      if (filters.room && Number(s['ห้อง']) !== Number(filters.room)) return;

      if (q) {
        var haystack = (String(s['รหัสนักเรียน']) + ' ' + studentFullName(s) + ' ' +
          classLabel(s['ระดับชั้น'], s['ห้อง'])).toLowerCase();
        if (haystack.indexOf(q) < 0) return;
      }

      var b = balances[s['รหัส']];
      var score = b ? Number(b['คะแนนความประพฤติ']) : getSettingNumber('คะแนนตั้งต้น', 100);
      out.push({
        id: s['รหัส'], code: String(s['รหัสนักเรียน']), name: studentFullName(s),
        classLabel: classLabel(s['ระดับชั้น'], s['ห้อง']),
        grade: Number(s['ระดับชั้น']), room: Number(s['ห้อง']), seat: s['เลขที่'],
        conductScore: score,
        meritTotal: b ? Number(b['คะแนนความดีสะสม']) : 0,
        demeritCount: b ? Number(b['ครั้งที่ทำผิด']) : 0,
        riskLevel: b ? String(b['ระดับความเสี่ยง']) : 'ปกติ',
        inScope: canSeeFullHistory_(user, s)
      });
    });

    out.sort(function (a, b) {
      return a.grade - b.grade || a.room - b.room || Number(a.seat) - Number(b.seat)
          || a.code.localeCompare(b.code);
    });
    return out;
  });
}

function apiGetStudent(token, studentId) {
  return safeCall_(function () {
    var user = requirePermission_(token, 'student.view');
    var year = currentYear();
    var s = dbFind(SHEETS.STUDENTS, function (x) { return x['รหัส'] === studentId; });
    if (!s) throw new Error('ไม่พบข้อมูลนักเรียน');
    if (!canSeeFullHistory_(user, s)) throw new Error('คุณไม่มีสิทธิ์ดูประวัติของนักเรียนคนนี้');

    var b = dbFind(SHEETS.BALANCES, function (x) {
      return x['รหัสนักเรียน(ระบบ)'] === studentId && Number(x['ปีการศึกษา']) === year;
    });
    var score = b ? Number(b['คะแนนความประพฤติ']) : getSettingNumber('คะแนนตั้งต้น', 100);
    var risk = riskLevelOf_(score);

    var history = dbFilter(SHEETS.RECORDS, function (r) {
      return r['รหัสนักเรียน(ระบบ)'] === studentId &&
             r['สถานะ'] !== STATUS.REJECTED && r['สถานะ'] !== STATUS.DRAFT;
    }).map(function (r) {
      return {
        id: r['รหัส'], recordNo: r['เลขที่บันทึก'], kind: r['ประเภท'],
        ruleCode: r['รหัสเกณฑ์'], ruleName: r['ชื่อเกณฑ์'], points: Number(r['คะแนน']),
        occurredAt: String(r['วันเวลาที่เกิดเหตุ']), occurredThai: thaiDate(r['วันเวลาที่เกิดเหตุ'], true),
        location: r['สถานที่'], detail: r['รายละเอียด'], reportedBy: r['ผู้บันทึก'],
        status: r['สถานะ'], year: Number(r['ปีการศึกษา'])
      };
    }).sort(function (a, b) { return new Date(b.occurredAt) - new Date(a.occurredAt); });

    // กราฟคะแนนตามลำดับเวลา ใช้แสดงแนวโน้มในหน้าประวัติ
    var timeline = [];
    var running = getSettingNumber('คะแนนตั้งต้น', 100);
    var maxScore = getSettingNumber('เพดานคะแนนความประพฤติ', 100);
    var minScore = getSettingNumber('คะแนนความประพฤติต่ำสุด', 0);
    history.slice().reverse().forEach(function (h) {
      if (h.status !== STATUS.APPROVED || h.year !== year) return;
      running = h.kind === KIND.MERIT
        ? Math.min(maxScore, running + h.points)
        : Math.max(minScore, running - h.points);
      timeline.push({ date: h.occurredThai, score: running });
    });

    return {
      student: {
        id: s['รหัส'], code: String(s['รหัสนักเรียน']), name: studentFullName(s),
        prefix: s['คำนำหน้า'], firstName: s['ชื่อ'], lastName: s['นามสกุล'],
        gender: s['เพศ'], classLabel: classLabel(s['ระดับชั้น'], s['ห้อง']),
        grade: Number(s['ระดับชั้น']), room: Number(s['ห้อง']), seat: s['เลขที่'],
        band: levelBand(s['ระดับชั้น']), status: s['สถานะ'],
        publishConsent: String(s['ยินยอมเผยแพร่']) === 'ใช่',
        guardianName: s['ชื่อผู้ปกครอง'], guardianPhone: s['โทรผู้ปกครอง']
      },
      balance: {
        conductScore: score,
        meritTotal: b ? Number(b['คะแนนความดีสะสม']) : 0,
        demeritTotal: b ? Number(b['คะแนนที่ถูกหัก']) : 0,
        meritCount: b ? Number(b['ครั้งที่ทำความดี']) : 0,
        demeritCount: b ? Number(b['ครั้งที่ทำผิด']) : 0,
        riskLevel: risk.level, riskAction: risk.action, riskColor: risk.color
      },
      history: history,
      timeline: timeline
    };
  });
}

/* ------------------------------------------------------------------ */
/* หลักเกณฑ์                                                           */
/* ------------------------------------------------------------------ */

function apiListRules(token) {
  return safeCall_(function () {
    requireUser_(token);
    return dbReadAll(SHEETS.RULES)
      .filter(function (r) { return String(r['ใช้งาน']) === 'ใช่'; })
      .map(function (r) {
        return {
          id: r['รหัส'], code: r['รหัสเกณฑ์'], oldCode: String(r['รหัสเดิม'] || ''),
          category: r['หมวด'], kind: r['ประเภท'],
          name: r['ชื่อเกณฑ์'], points: Number(r['คะแนน']),
          severity: r['ระดับความรุนแรง'] === '' ? null : Number(r['ระดับความรุนแรง']),
          trait: r['คุณลักษณะอันพึงประสงค์'],
          requiresEvidence: String(r['ต้องมีหลักฐาน']) === 'ใช่'
        };
      });
  });
}

/* ------------------------------------------------------------------ */
/* บันทึกพฤติกรรม                                                       */
/* ------------------------------------------------------------------ */

function apiCreateRecord(token, payload) {
  return safeCall_(function () {
    var user = requirePermission_(token, 'record.create');
    var year = currentYear();

    var s = dbFind(SHEETS.STUDENTS, function (x) { return x['รหัส'] === payload.studentId; });
    if (!s) throw new Error('ไม่พบข้อมูลนักเรียน');

    var rule = dbFind(SHEETS.RULES, function (x) { return x['รหัส'] === payload.ruleId; });
    if (!rule) throw new Error('ไม่พบหลักเกณฑ์ที่เลือก');
    if (String(rule['ใช้งาน']) !== 'ใช่') throw new Error('หลักเกณฑ์นี้ถูกยกเลิกการใช้งานแล้ว');

    if (!String(payload.detail || '').trim()) throw new Error('กรุณากรอกรายละเอียดเหตุการณ์');
    if (String(rule['ต้องมีหลักฐาน']) === 'ใช่' && !String(payload.evidenceUrl || '').trim()) {
      throw new Error('หลักเกณฑ์นี้ต้องแนบลิงก์หลักฐานประกอบ');
    }

    // ตรวจเพดานจำนวนครั้งต่อภาคเรียน ป้องกันคะแนนเฟ้อ
    var cap = Number(rule['เพดานครั้ง/ภาคเรียน']);
    if (cap > 0) {
      var used = dbFilter(SHEETS.RECORDS, function (r) {
        return r['รหัสนักเรียน(ระบบ)'] === payload.studentId &&
               r['รหัสเกณฑ์(ระบบ)'] === payload.ruleId &&
               Number(r['ปีการศึกษา']) === year &&
               Number(r['ภาคเรียน']) === currentTerm() &&
               (r['สถานะ'] === STATUS.APPROVED || r['สถานะ'] === STATUS.SUBMITTED);
      }).length;
      if (used >= cap) {
        throw new Error('เกณฑ์นี้บันทึกให้นักเรียนคนนี้ได้ไม่เกิน ' + cap + ' ครั้งต่อภาคเรียน (ใช้ไปแล้ว ' + used + ' ครั้ง)');
      }
    }

    var occurredAt = payload.occurredAt ? String(payload.occurredAt) : nowStr();
    var recordNo = nextRecordNo_(year);

    var record = {
      'เลขที่บันทึก': recordNo,
      'รหัสนักเรียน(ระบบ)': s['รหัส'],
      'รหัสนักเรียน': String(s['รหัสนักเรียน']),
      'ชื่อนักเรียน': studentFullName(s),
      'ห้อง': classLabel(s['ระดับชั้น'], s['ห้อง']),
      'ปีการศึกษา': year,
      'ภาคเรียน': currentTerm(),
      'รหัสเกณฑ์(ระบบ)': rule['รหัส'],
      'รหัสเกณฑ์': rule['รหัสเกณฑ์'],
      'ชื่อเกณฑ์': rule['ชื่อเกณฑ์'],
      'ประเภท': rule['ประเภท'],
      'คะแนน': Number(rule['คะแนน']),
      'วันเวลาที่เกิดเหตุ': occurredAt,
      'สถานที่': payload.location || '',
      'รายละเอียด': String(payload.detail).trim(),
      'ลิงก์หลักฐาน': payload.evidenceUrl || '',
      'ผู้บันทึก(ระบบ)': user.userId,
      'ผู้บันทึก': user.name,
      'บันทึกเมื่อ': nowStr(),
      'สถานะ': STATUS.SUBMITTED,
      'ผู้พิจารณา': '', 'พิจารณาเมื่อ': '', 'หมายเหตุการพิจารณา': ''
    };

    dbInsert(SHEETS.RECORDS, record);
    logAudit(user, 'บันทึกพฤติกรรม', recordNo,
      studentFullName(s) + ' / ' + rule['ชื่อเกณฑ์'] + ' ' + rule['คะแนน'] + ' คะแนน');

    return { recordNo: recordNo, status: STATUS.SUBMITTED, studentName: studentFullName(s) };
  });
}

function apiPendingRecords(token) {
  return safeCall_(function () {
    var user = requirePermission_(token, 'record.approve');
    var scoped = scopeFilter_(user);
    var studentsById = {};
    dbReadAll(SHEETS.STUDENTS).forEach(function (s) { studentsById[s['รหัส']] = s; });

    var rulesById = {};
    dbReadAll(SHEETS.RULES).forEach(function (r) { rulesById[r['รหัส']] = r; });

    return dbFilter(SHEETS.RECORDS, function (r) { return r['สถานะ'] === STATUS.SUBMITTED; })
      .filter(function (r) {
        var s = studentsById[r['รหัสนักเรียน(ระบบ)']];
        return s ? scoped(s) : false;
      })
      .map(function (r) {
        var rule = rulesById[r['รหัสเกณฑ์(ระบบ)']];
        var severity = rule && rule['ระดับความรุนแรง'] !== '' ? Number(rule['ระดับความรุนแรง']) : null;
        return {
          id: r['รหัส'], recordNo: r['เลขที่บันทึก'], studentName: r['ชื่อนักเรียน'],
          studentCode: String(r['รหัสนักเรียน']), classLabel: r['ห้อง'],
          kind: r['ประเภท'], ruleCode: r['รหัสเกณฑ์'], ruleName: r['ชื่อเกณฑ์'],
          points: Number(r['คะแนน']), severity: severity,
          occurredThai: thaiDate(r['วันเวลาที่เกิดเหตุ'], true),
          location: r['สถานที่'], detail: r['รายละเอียด'], evidenceUrl: r['ลิงก์หลักฐาน'],
          reportedBy: r['ผู้บันทึก'], reportedAt: String(r['บันทึกเมื่อ']),
          // ความผิดร้ายแรงต้องให้ฝ่ายกิจการนักเรียนพิจารณาเท่านั้น
          canDecide: !(severity >= 3 && SEVERE_APPROVERS.indexOf(user.role) < 0)
        };
      })
      .sort(function (a, b) { return new Date(a.reportedAt) - new Date(b.reportedAt); });
  });
}

function apiReviewRecord(token, recordId, decision, note) {
  return safeCall_(function () {
    var user = requirePermission_(token, 'record.approve');
    var r = dbFind(SHEETS.RECORDS, function (x) { return x['รหัส'] === recordId; });
    if (!r) throw new Error('ไม่พบบันทึก');
    if (r['สถานะ'] !== STATUS.SUBMITTED) throw new Error('บันทึกนี้ได้รับการพิจารณาไปแล้ว');
    if (r['ผู้บันทึก(ระบบ)'] === user.userId && user.role !== 'admin' && user.role !== 'affairs') {
      throw new Error('ไม่สามารถอนุมัติบันทึกที่ตนเองเป็นผู้บันทึกได้');
    }

    var rule = dbFind(SHEETS.RULES, function (x) { return x['รหัส'] === r['รหัสเกณฑ์(ระบบ)']; });
    var severity = rule && rule['ระดับความรุนแรง'] !== '' ? Number(rule['ระดับความรุนแรง']) : 0;
    if (severity >= 3 && SEVERE_APPROVERS.indexOf(user.role) < 0) {
      throw new Error('ความผิดระดับร้ายแรงต้องให้ฝ่ายกิจการนักเรียนเป็นผู้พิจารณา');
    }

    var newStatus = decision === 'approve' ? STATUS.APPROVED : STATUS.REJECTED;
    dbUpdateRow(SHEETS.RECORDS, r._row, {
      'สถานะ': newStatus, 'ผู้พิจารณา': user.name,
      'พิจารณาเมื่อ': nowStr(), 'หมายเหตุการพิจารณา': note || ''
    });

    var result = null;
    if (newStatus === STATUS.APPROVED) {
      r['สถานะ'] = STATUS.APPROVED;
      result = postRecord_(r, user);
    }
    logAudit(user, newStatus === STATUS.APPROVED ? 'อนุมัติบันทึก' : 'ไม่อนุมัติบันทึก',
      r['เลขที่บันทึก'], r['ชื่อนักเรียน'] + ' / ' + (note || ''));

    return { status: newStatus, balance: result };
  });
}

function apiRevokeRecord(token, recordId, reason) {
  return safeCall_(function () {
    var user = requirePermission_(token, 'record.revoke');
    if (!String(reason || '').trim()) throw new Error('กรุณาระบุเหตุผลในการเพิกถอน');

    var r = dbFind(SHEETS.RECORDS, function (x) { return x['รหัส'] === recordId; });
    if (!r) throw new Error('ไม่พบบันทึก');
    if (r['สถานะ'] !== STATUS.APPROVED) throw new Error('เพิกถอนได้เฉพาะบันทึกที่อนุมัติแล้ว');

    reverseRecord_(r, reason, user);
    dbUpdateRow(SHEETS.RECORDS, r._row, {
      'สถานะ': STATUS.REVOKED, 'ผู้พิจารณา': user.name,
      'พิจารณาเมื่อ': nowStr(), 'หมายเหตุการพิจารณา': reason
    });
    logAudit(user, 'เพิกถอนบันทึก', r['เลขที่บันทึก'], reason);
    return { ok: true };
  });
}

function apiMyRecords(token, limit) {
  return safeCall_(function () {
    var user = requireUser_(token);
    return dbFilter(SHEETS.RECORDS, function (r) { return r['ผู้บันทึก(ระบบ)'] === user.userId; })
      .map(function (r) {
        return {
          id: r['รหัส'], recordNo: r['เลขที่บันทึก'], studentName: r['ชื่อนักเรียน'],
          classLabel: r['ห้อง'], kind: r['ประเภท'], ruleName: r['ชื่อเกณฑ์'],
          points: Number(r['คะแนน']), status: r['สถานะ'],
          occurredThai: thaiDate(r['วันเวลาที่เกิดเหตุ'], true),
          reportedAt: String(r['บันทึกเมื่อ']), reviewNote: r['หมายเหตุการพิจารณา']
        };
      })
      .sort(function (a, b) { return new Date(b.reportedAt) - new Date(a.reportedAt); })
      .slice(0, limit || 50);
  });
}

/* ------------------------------------------------------------------ */
/* กระดานเกียรติยศ                                                      */
/* ------------------------------------------------------------------ */

function apiLeaderboard(token) {
  return safeCall_(function () {
    requireUser_(token);
    var board = computeLeaderboard_();
    var published = dbReadAll(SHEETS.LEADERBOARD);
    return {
      lower: board[BAND.LOWER],
      upper: board[BAND.UPPER],
      publishedAt: published.length ? String(published[0]['สร้างเมื่อ']) : null,
      publishedAtThai: published.length ? thaiDate(published[0]['สร้างเมื่อ'], true) : null
    };
  });
}

function apiPublishLeaderboard(token) {
  return safeCall_(function () {
    var user = requirePermission_(token, 'leaderboard.publish');
    return publishLeaderboard_(user);
  });
}

/* ------------------------------------------------------------------ */
/* ตั้งค่าระบบ                                                          */
/* ------------------------------------------------------------------ */

function apiGetSettings(token) {
  return safeCall_(function () {
    requirePermission_(token, 'settings.manage');
    return dbReadAll(SHEETS.SETTINGS).map(function (r) {
      return { key: r['คีย์'], value: r['ค่า'], description: r['คำอธิบาย'] };
    });
  });
}

function apiSaveSetting(token, key, value) {
  return safeCall_(function () {
    var user = requirePermission_(token, 'settings.manage');
    setSetting(key, value);
    logAudit(user, 'แก้ไขค่าตั้งค่า', key, String(value));
    return { ok: true };
  });
}

function apiAuditLog(token, limit) {
  return safeCall_(function () {
    requirePermission_(token, 'audit.view');
    return dbReadAll(SHEETS.AUDIT)
      .slice(-(limit || 200)).reverse()
      .map(function (r) {
        return {
          at: String(r['เมื่อ']), user: r['ผู้ใช้'], role: r['บทบาท'],
          action: r['การกระทำ'], target: r['เป้าหมาย'], detail: r['รายละเอียด']
        };
      });
  });
}

/* ------------------------------------------------------------------ */
/* จัดการข้อมูลนักเรียน                                                  */
/* ------------------------------------------------------------------ */

function apiSaveStudent(token, payload) {
  return safeCall_(function () {
    var user = requirePermission_(token, 'student.manage');
    var code = String(payload.code || '').trim();
    if (!code) throw new Error('กรุณาระบุรหัสประจำตัวนักเรียน');
    if (!String(payload.firstName || '').trim() || !String(payload.lastName || '').trim()) {
      throw new Error('กรุณากรอกชื่อและนามสกุล');
    }
    var grade = Number(payload.grade), room = Number(payload.room);
    if (!(grade >= 1 && grade <= 6)) throw new Error('ระดับชั้นต้องอยู่ระหว่าง 1 ถึง 6');
    if (!(room >= 1)) throw new Error('กรุณาระบุห้องเรียน');

    var dup = dbFind(SHEETS.STUDENTS, function (s) { return String(s['รหัสนักเรียน']) === code; });

    var fields = {
      'รหัสนักเรียน': code, 'คำนำหน้า': payload.prefix || '',
      'ชื่อ': String(payload.firstName).trim(), 'นามสกุล': String(payload.lastName).trim(),
      'เพศ': payload.gender || 'ไม่ระบุ', 'ระดับชั้น': grade, 'ห้อง': room,
      'เลขที่': payload.seat || '', 'สถานะ': payload.status || 'ปกติ',
      'ยินยอมเผยแพร่': payload.publishConsent ? 'ใช่' : 'ไม่',
      'ชื่อผู้ปกครอง': payload.guardianName || '', 'โทรผู้ปกครอง': payload.guardianPhone || '',
      'LINE ผู้ปกครอง': payload.guardianLine || ''
    };

    if (payload.id) {
      var s = dbFind(SHEETS.STUDENTS, function (x) { return x['รหัส'] === payload.id; });
      if (!s) throw new Error('ไม่พบข้อมูลนักเรียน');
      if (dup && dup['รหัส'] !== payload.id) throw new Error('รหัสประจำตัว ' + code + ' ถูกใช้ไปแล้ว');
      dbUpdateRow(SHEETS.STUDENTS, s._row, fields);
      logAudit(user, 'แก้ไขข้อมูลนักเรียน', code, '');
      return { id: payload.id };
    }

    if (dup) throw new Error('รหัสประจำตัว ' + code + ' มีอยู่แล้วในระบบ');
    fields['ชั้นแรกเข้า'] = grade <= 3 ? 1 : 4;
    fields['ปีแรกเข้า'] = currentYear();
    fields['สร้างเมื่อ'] = nowStr();
    var created = dbInsert(SHEETS.STUDENTS, fields);
    ensureBalance_(created['รหัส'], currentYear());
    logAudit(user, 'เพิ่มนักเรียน', code, studentFullName(fields));
    return { id: created['รหัส'] };
  });
}

function apiRebuildBalances(token) {
  return safeCall_(function () {
    var user = requirePermission_(token, 'settings.manage');
    var count = rebuildAllBalances();
    logAudit(user, 'คำนวณคะแนนใหม่ทั้งระบบ', '', count + ' คน');
    return { count: count };
  });
}

/** ออกเลขที่บันทึกถัดไปของปีการศึกษาที่ระบุ นับจากเลขสูงสุดที่เคยออกไว้ */
function nextRecordNo_(year) {
  var max = 0;
  dbReadAll(SHEETS.RECORDS).forEach(function (r) {
    var m = String(r['เลขที่บันทึก']).match(/^BR-(\d+)-(\d+)$/);
    if (m && Number(m[1]) === Number(year)) max = Math.max(max, Number(m[2]));
  });
  return 'BR-' + year + '-' + ('000000' + (max + 1)).slice(-6);
}

/* ------------------------------------------------------------------ */
/* จัดการหลักเกณฑ์คะแนน                                                 */
/* ------------------------------------------------------------------ */

function apiListAllRules(token, kind) {
  return safeCall_(function () {
    requirePermission_(token, 'rule.manage');
    return dbReadAll(SHEETS.RULES)
      .filter(function (r) { return !kind || r['ประเภท'] === kind; })
      .map(function (r) {
        return {
          id: r['รหัส'], code: r['รหัสเกณฑ์'], oldCode: String(r['รหัสเดิม'] || ''),
          category: r['หมวด'], kind: r['ประเภท'], name: r['ชื่อเกณฑ์'],
          points: Number(r['คะแนน']),
          severity: r['ระดับความรุนแรง'] === '' ? null : Number(r['ระดับความรุนแรง']),
          trait: r['คุณลักษณะอันพึงประสงค์'],
          requiresEvidence: String(r['ต้องมีหลักฐาน']) === 'ใช่',
          maxPerTerm: r['เพดานครั้ง/ภาคเรียน'] === '' ? null : Number(r['เพดานครั้ง/ภาคเรียน']),
          legalRef: r['อ้างอิงระเบียบ'],
          active: String(r['ใช้งาน']) === 'ใช่',
          usageCount: 0
        };
      })
      .sort(function (a, b) { return String(a.code).localeCompare(String(b.code)); });
  });
}

function apiSaveRule(token, payload) {
  return safeCall_(function () {
    var user = requirePermission_(token, 'rule.manage');
    var name = String(payload.name || '').trim();
    if (!name) throw new Error('กรุณากรอกชื่อเกณฑ์');

    var points = Number(payload.points);
    if (!(points > 0)) throw new Error('คะแนนต้องเป็นจำนวนเต็มบวก');
    if (payload.kind !== KIND.MERIT && payload.kind !== KIND.DEMERIT) throw new Error('ประเภทเกณฑ์ไม่ถูกต้อง');

    var severity = '';
    if (payload.kind === KIND.DEMERIT) {
      severity = Number(payload.severity) || severityFromPoints(points);
      if (severity < 1 || severity > 4) severity = severityFromPoints(points);
    }

    var fields = {
      'รหัสเดิม': String(payload.oldCode || ''),
      'หมวด': payload.category || 'ทั่วไป',
      'ประเภท': payload.kind,
      'ชื่อเกณฑ์': name,
      'คะแนน': points,
      'ระดับความรุนแรง': severity,
      'คุณลักษณะอันพึงประสงค์': payload.trait || '',
      'ต้องมีหลักฐาน': payload.requiresEvidence ? 'ใช่' : 'ไม่',
      'เพดานครั้ง/ภาคเรียน': payload.maxPerTerm || '',
      'อ้างอิงระเบียบ': payload.legalRef || '',
      'ใช้งาน': payload.active === false ? 'ไม่' : 'ใช่'
    };

    if (payload.id) {
      var rule = dbFind(SHEETS.RULES, function (r) { return r['รหัส'] === payload.id; });
      if (!rule) throw new Error('ไม่พบหลักเกณฑ์ที่ต้องการแก้ไข');
      dbUpdateRow(SHEETS.RULES, rule._row, fields);
      logAudit(user, 'แก้ไขหลักเกณฑ์', rule['รหัสเกณฑ์'], name + ' ' + points + ' คะแนน');
      return { id: payload.id, code: rule['รหัสเกณฑ์'] };
    }

    var prefix = payload.kind === KIND.MERIT ? 'ด-' : 'ผ-';
    var maxSeq = 0;
    dbReadAll(SHEETS.RULES).forEach(function (r) {
      var m = String(r['รหัสเกณฑ์']).match(new RegExp('^' + prefix + '(\\d+)$'));
      if (m) maxSeq = Math.max(maxSeq, Number(m[1]));
    });
    fields['รหัสเกณฑ์'] = prefix + pad2_(maxSeq + 1);

    var created = dbInsert(SHEETS.RULES, fields);
    logAudit(user, 'เพิ่มหลักเกณฑ์', fields['รหัสเกณฑ์'], name + ' ' + points + ' คะแนน');
    return { id: created['รหัส'], code: fields['รหัสเกณฑ์'] };
  });
}

/**
 * ลบหลักเกณฑ์ — ถ้าเคยถูกใช้บันทึกไปแล้วจะไม่ลบจริง แต่ปิดการใช้งานแทน
 * เพื่อไม่ให้ประวัติของนักเรียนที่อ้างอิงเกณฑ์นี้เสียหาย
 */
function apiDeleteRule(token, ruleId) {
  return safeCall_(function () {
    var user = requirePermission_(token, 'rule.manage');
    var rule = dbFind(SHEETS.RULES, function (r) { return r['รหัส'] === ruleId; });
    if (!rule) throw new Error('ไม่พบหลักเกณฑ์ที่ต้องการลบ');

    var used = dbFilter(SHEETS.RECORDS, function (r) { return r['รหัสเกณฑ์(ระบบ)'] === ruleId; }).length;
    if (used) {
      dbUpdateRow(SHEETS.RULES, rule._row, { 'ใช้งาน': 'ไม่' });
      logAudit(user, 'ปิดการใช้งานหลักเกณฑ์', rule['รหัสเกณฑ์'], 'มีบันทึกอ้างอิงอยู่ ' + used + ' รายการ');
      return { deleted: false, deactivated: true, used: used };
    }

    dbDeleteRow(SHEETS.RULES, rule._row);
    logAudit(user, 'ลบหลักเกณฑ์', rule['รหัสเกณฑ์'], rule['ชื่อเกณฑ์']);
    return { deleted: true, deactivated: false, used: 0 };
  });
}


/* ----------------------------------------------------------------------
 * 05_Reports.gs
 * ---------------------------------------------------------------------- */

/**
 * 05_Reports.gs — ระบบรายงานและการส่งออกไฟล์ Excel / PDF
 *
 * วิธีส่งออก: สร้างไฟล์ Google Sheets ชั่วคราว จัดรูปแบบ แล้วให้ Google แปลงเป็น
 * .xlsx หรือ .pdf ผ่าน export URL จากนั้นลบไฟล์ชั่วคราวทิ้ง
 * ข้อดีคือฟอนต์ไทยแสดงผลถูกต้องเสมอ เพราะใช้ตัวแปลงของ Google เอง
 * และไม่มีไฟล์ค้างอยู่ใน Drive ให้กังวลเรื่องข้อมูลรั่วไหล
 */

var REPORTS = {
  R01: { name: 'ระเบียนความประพฤติรายบุคคล', needs: ['student'], landscape: false },
  R02: { name: 'สรุปคะแนนรายห้อง',            needs: ['class'],   landscape: false },
  R03: { name: 'นักเรียนกลุ่มเสี่ยง',           needs: [],         landscape: true  },
  R04: { name: 'พฤติกรรมที่พบบ่อย',            needs: [],         landscape: false },
  R05: { name: 'สรุปภาพรวมรายระดับชั้น',        needs: [],         landscape: true  },
  R06: { name: 'สรุปการทำความดีรายหมวด',       needs: [],         landscape: false },
  R07: { name: 'สถิติการบันทึกรายครู',          needs: [],         landscape: true  },
  R09: { name: 'แนวโน้มรายเดือน ความดี-ความผิด', needs: [],        landscape: false },
  R11: { name: 'กระดานเกียรติยศ',              needs: [],         landscape: false }
};

function apiListReports(token) {
  return safeCall_(function () {
    requirePermission_(token, 'report.view');
    return Object.keys(REPORTS).map(function (id) {
      return { id: id, name: REPORTS[id].name, needs: REPORTS[id].needs };
    });
  });
}

function apiBuildReport(token, reportId, params) {
  return safeCall_(function () {
    var user = requirePermission_(token, 'report.view');
    return buildReport_(user, reportId, params || {});
  });
}

/**
 * ส่งออกรายงานเป็นไฟล์ คืนค่าเป็น base64 ให้หน้าเว็บดาวน์โหลด
 * ไม่เก็บไฟล์ไว้ใน Drive จึงไม่มีลิงก์ค้างที่ใครก็เปิดได้
 */
function apiExportReport(token, reportId, params, format) {
  return safeCall_(function () {
    var user = requirePermission_(token, 'report.view');
    var report = buildReport_(user, reportId, params || {});
    var blob = renderReportFile_(report, format === 'pdf' ? 'pdf' : 'xlsx');

    logAudit(user, 'ส่งออกรายงาน', reportId, report.title + ' (' + format + ')');
    return {
      fileName: blob.getName(),
      mimeType: blob.getContentType(),
      base64: Utilities.base64Encode(blob.getBytes())
    };
  });
}

/* ------------------------------------------------------------------ */
/* ตัวสร้างรายงานแต่ละชนิด                                               */
/* ------------------------------------------------------------------ */

function buildReport_(user, reportId, params) {
  var year = params.year ? Number(params.year) : currentYear();
  var meta = REPORTS[reportId];
  if (!meta) throw new Error('ไม่พบรายงานที่ระบุ');

  var report = { id: reportId, title: meta.name, landscape: !!meta.landscape,
                 subtitle: 'ปีการศึกษา ' + year, columns: [], rows: [], notes: [] };

  var records = dbReadAll(SHEETS.RECORDS).filter(function (r) { return Number(r['ปีการศึกษา']) === year; });
  var approved = records.filter(function (r) { return r['สถานะ'] === STATUS.APPROVED; });
  var students = dbReadAll(SHEETS.STUDENTS).filter(function (s) { return String(s['สถานะ']) === 'ปกติ'; });
  var balances = {};
  dbReadAll(SHEETS.BALANCES).forEach(function (b) {
    if (Number(b['ปีการศึกษา']) === year) balances[b['รหัสนักเรียน(ระบบ)']] = b;
  });
  var scoped = scopeFilter_(user);

  function scoreOf(s) {
    var b = balances[s['รหัส']];
    return b ? Number(b['คะแนนความประพฤติ']) : getSettingNumber('คะแนนตั้งต้น', 100);
  }

  if (reportId === 'R01') {
    var s = dbFind(SHEETS.STUDENTS, function (x) { return x['รหัส'] === Number(params.studentId); });
    if (!s) throw new Error('กรุณาเลือกนักเรียน');
    if (!canSeeFullHistory_(user, s)) throw new Error('คุณไม่มีสิทธิ์ออกรายงานของนักเรียนคนนี้');
    var b = balances[s['รหัส']];
    var score = scoreOf(s);

    report.title = 'ระเบียนความประพฤตินักเรียน';
    report.subtitle = studentFullName(s) + '  เลขประจำตัว ' + s['รหัสนักเรียน'] +
      '  ชั้น ' + classLabel(s['ระดับชั้น'], s['ห้อง']) + '  ปีการศึกษา ' + year;
    report.notes = [
      'คะแนนความประพฤติคงเหลือ ' + score + ' คะแนน   ระดับ: ' + riskLevelOf_(score).level,
      'คะแนนความดีสะสม ' + (b ? b['คะแนนความดีสะสม'] : 0) + ' คะแนน จาก ' +
        (b ? b['ครั้งที่ทำความดี'] : 0) + ' ครั้ง   คะแนนที่ถูกหักรวม ' + (b ? b['คะแนนที่ถูกหัก'] : 0) + ' คะแนน'
    ];
    report.columns = ['วันที่', 'ประเภท', 'หลักเกณฑ์', 'คะแนน', 'รายละเอียด', 'ผู้บันทึก'];

    // แสดงความดีก่อนความผิดเสมอ ผู้ปกครองจะรับฟังได้ดีกว่า
    var mine = records.filter(function (r) {
      return r['รหัสนักเรียน(ระบบ)'] === s['รหัส'] && r['สถานะ'] === STATUS.APPROVED;
    });
    [KIND.MERIT, KIND.DEMERIT].forEach(function (kind) {
      mine.filter(function (r) { return r['ประเภท'] === kind; })
        .sort(function (a, b2) { return new Date(a['วันเวลาที่เกิดเหตุ']) - new Date(b2['วันเวลาที่เกิดเหตุ']); })
        .forEach(function (r) {
          report.rows.push([
            thaiDate(r['วันเวลาที่เกิดเหตุ']), r['ประเภท'],
            r['รหัสเกณฑ์'] + ' ' + r['ชื่อเกณฑ์'],
            (kind === KIND.MERIT ? '+' : '-') + r['คะแนน'],
            r['รายละเอียด'], r['ผู้บันทึก']
          ]);
        });
    });
    if (!report.rows.length) report.rows.push(['—', 'ไม่มีบันทึกในปีการศึกษานี้', '', '', '', '']);

  } else if (reportId === 'R02') {
    var grade = Number(params.grade), room = Number(params.room);
    if (!grade || !room) throw new Error('กรุณาเลือกระดับชั้นและห้อง');
    report.title = 'สรุปคะแนนความประพฤติรายห้อง';
    report.subtitle = 'ชั้น ' + classLabel(grade, room) + '  ปีการศึกษา ' + year;
    report.columns = ['เลขที่', 'รหัสนักเรียน', 'ชื่อ-สกุล', 'คะแนนความประพฤติ',
                      'คะแนนความดีสะสม', 'คะแนนที่ถูกหัก', 'ครั้งที่ทำผิด', 'ระดับ'];
    students.filter(function (s2) {
      return Number(s2['ระดับชั้น']) === grade && Number(s2['ห้อง']) === room && scoped(s2);
    }).sort(function (a, b2) { return Number(a['เลขที่']) - Number(b2['เลขที่']); })
      .forEach(function (s2) {
        var bb = balances[s2['รหัส']];
        report.rows.push([
          s2['เลขที่'], String(s2['รหัสนักเรียน']), studentFullName(s2), scoreOf(s2),
          bb ? bb['คะแนนความดีสะสม'] : 0, bb ? bb['คะแนนที่ถูกหัก'] : 0,
          bb ? bb['ครั้งที่ทำผิด'] : 0, bb ? bb['ระดับความเสี่ยง'] : 'ปกติ'
        ]);
      });

  } else if (reportId === 'R03') {
    var cutoff = params.cutoff ? Number(params.cutoff) : 70;
    report.title = 'รายงานนักเรียนกลุ่มเสี่ยง';
    report.subtitle = 'คะแนนความประพฤติไม่เกิน ' + cutoff + ' คะแนน  ปีการศึกษา ' + year;
    report.columns = ['ห้อง', 'รหัสนักเรียน', 'ชื่อ-สกุล', 'คะแนนคงเหลือ', 'ครั้งที่ทำผิด',
                      'ระดับ', 'การดำเนินการที่ต้องทำ', 'ผู้ปกครอง', 'โทรศัพท์'];
    students.filter(function (s2) { return scoped(s2) && scoreOf(s2) <= cutoff; })
      .sort(function (a, b2) { return scoreOf(a) - scoreOf(b2); })
      .forEach(function (s2) {
        var sc = scoreOf(s2), risk = riskLevelOf_(sc), bb = balances[s2['รหัส']];
        report.rows.push([
          classLabel(s2['ระดับชั้น'], s2['ห้อง']), String(s2['รหัสนักเรียน']), studentFullName(s2),
          sc, bb ? bb['ครั้งที่ทำผิด'] : 0, risk.level, risk.action,
          s2['ชื่อผู้ปกครอง'] || '', s2['โทรผู้ปกครอง'] || ''
        ]);
      });
    if (!report.rows.length) report.rows.push(['—', 'ไม่มีนักเรียนที่คะแนนต่ำกว่าเกณฑ์', '', '', '', '', '', '', '']);

  } else if (reportId === 'R04') {
    report.title = 'พฤติกรรมที่พบบ่อย';
    report.columns = ['อันดับ', 'หมวด', 'พฤติกรรม', 'จำนวนครั้ง', 'จำนวนนักเรียน',
                      'คะแนนที่หักรวม', 'สถานที่ที่พบบ่อย', 'ร้อยละ'];
    var rulesById = {};
    dbReadAll(SHEETS.RULES).forEach(function (r) { rulesById[r['รหัส']] = r; });

    var agg = {};
    var totalDemerit = 0;
    approved.filter(function (r) { return r['ประเภท'] === KIND.DEMERIT; }).forEach(function (r) {
      var key = r['รหัสเกณฑ์'];
      if (!agg[key]) {
        var rule = rulesById[r['รหัสเกณฑ์(ระบบ)']];
        agg[key] = { name: r['ชื่อเกณฑ์'], category: rule ? rule['หมวด'] : '', count: 0,
                     students: {}, points: 0, places: {} };
      }
      agg[key].count++;
      agg[key].students[r['รหัสนักเรียน(ระบบ)']] = true;
      agg[key].points += Number(r['คะแนน']);
      var place = String(r['สถานที่'] || '').trim();
      if (place) agg[key].places[place] = (agg[key].places[place] || 0) + 1;
      totalDemerit++;
    });

    Object.keys(agg).map(function (k) { return { code: k, v: agg[k] }; })
      .sort(function (a, b2) { return b2.v.count - a.v.count; })
      .forEach(function (item, i) {
        var places = Object.keys(item.v.places)
          .sort(function (a, b2) { return item.v.places[b2] - item.v.places[a]; });
        report.rows.push([
          i + 1, item.v.category, item.code + ' ' + item.v.name, item.v.count,
          Object.keys(item.v.students).length, item.v.points, places[0] || '—',
          totalDemerit ? Math.round(item.v.count / totalDemerit * 1000) / 10 + '%' : '0%'
        ]);
      });
    if (!report.rows.length) report.rows.push(['—', 'ยังไม่มีบันทึกความผิด', '', '', '', '', '', '']);

  } else if (reportId === 'R05') {
    report.title = 'สรุปภาพรวมรายระดับชั้น';
    report.columns = ['ระดับชั้น', 'นักเรียนทั้งหมด', 'คะแนนเฉลี่ย', 'คะแนนต่ำสุด', 'คะแนนเต็ม 100',
                      'เฝ้าระวัง', 'ต้องช่วยเหลือ', 'ครั้งที่ทำความดี', 'ครั้งที่ทำผิด', 'ร้อยละไม่มีประวัติผิด'];
    for (var g = 1; g <= 6; g++) {
      var group = students.filter(function (s2) { return Number(s2['ระดับชั้น']) === g; });
      if (!group.length) continue;
      var sum = 0, min = 100, full = 0, watch = 0, help = 0, mc = 0, dc = 0, clean = 0;
      group.forEach(function (s2) {
        var sc = scoreOf(s2), bb = balances[s2['รหัส']];
        sum += sc;
        if (sc < min) min = sc;
        if (sc >= 100) full++;
        if (sc >= 61 && sc < 100) watch++;
        if (sc <= 60) help++;
        mc += bb ? Number(bb['ครั้งที่ทำความดี']) : 0;
        var d = bb ? Number(bb['ครั้งที่ทำผิด']) : 0;
        dc += d;
        if (!d) clean++;
      });
      report.rows.push(['ม.' + g, group.length, Math.round(sum / group.length * 100) / 100,
        min, full, watch, help, mc, dc, Math.round(clean / group.length * 1000) / 10 + '%']);
    }

  } else if (reportId === 'R06') {
    report.title = 'สรุปการทำความดีรายหมวด';
    report.columns = ['หมวดความดี', 'จำนวนครั้ง', 'จำนวนนักเรียนที่มีส่วนร่วม', 'คะแนนรวม', 'คะแนนเฉลี่ยต่อครั้ง'];
    var rulesById2 = {};
    dbReadAll(SHEETS.RULES).forEach(function (r) { rulesById2[r['รหัส']] = r; });
    var cat = {};
    approved.filter(function (r) { return r['ประเภท'] === KIND.MERIT; }).forEach(function (r) {
      var rule = rulesById2[r['รหัสเกณฑ์(ระบบ)']];
      var key = rule ? rule['หมวด'] : 'อื่น ๆ';
      if (!cat[key]) cat[key] = { count: 0, students: {}, points: 0 };
      cat[key].count++;
      cat[key].students[r['รหัสนักเรียน(ระบบ)']] = true;
      cat[key].points += Number(r['คะแนน']);
    });
    Object.keys(cat).sort().forEach(function (k) {
      report.rows.push([k, cat[k].count, Object.keys(cat[k].students).length, cat[k].points,
        Math.round(cat[k].points / cat[k].count * 10) / 10]);
    });
    if (!report.rows.length) report.rows.push(['—', 'ยังไม่มีบันทึกความดี', '', '', '']);

  } else if (reportId === 'R07') {
    report.title = 'สถิติการบันทึกรายครู';
    report.subtitle = 'ปีการศึกษา ' + year + '  (ใช้เพื่อพัฒนาระบบและอบรมครู ไม่ใช่ประเมินความดีความชอบ)';
    report.columns = ['ครู', 'บันทึกทั้งหมด', 'ให้คะแนนความดี', 'หักคะแนน', 'ไม่อนุมัติ',
                      'ร้อยละความดี', 'บันทึกล่าสุด'];
    var byTeacher = {};
    records.forEach(function (r) {
      var key = r['ผู้บันทึก'];
      if (!byTeacher[key]) byTeacher[key] = { total: 0, merit: 0, demerit: 0, rejected: 0, last: '' };
      var t = byTeacher[key];
      t.total++;
      if (r['ประเภท'] === KIND.MERIT) t.merit++; else t.demerit++;
      if (r['สถานะ'] === STATUS.REJECTED) t.rejected++;
      var at = String(r['บันทึกเมื่อ']);
      if (at > t.last) t.last = at;
    });
    Object.keys(byTeacher).sort(function (a, b2) { return byTeacher[b2].total - byTeacher[a].total; })
      .forEach(function (k) {
        var t = byTeacher[k];
        report.rows.push([k, t.total, t.merit, t.demerit, t.rejected,
          Math.round(t.merit / t.total * 1000) / 10 + '%', thaiDate(t.last)]);
      });
    if (!report.rows.length) report.rows.push(['—', 'ยังไม่มีบันทึก', '', '', '', '', '']);

  } else if (reportId === 'R09') {
    report.title = 'แนวโน้มรายเดือน ความดี เทียบกับ ความผิด';
    report.columns = ['เดือน', 'ครั้งความดี', 'ครั้งความผิด', 'คะแนนความดี', 'คะแนนที่หัก', 'อัตราส่วนดีต่อผิด'];
    var m = {};
    approved.forEach(function (r) {
      var d = toDate_(r['วันเวลาที่เกิดเหตุ']);
      if (!d) return;
      var key = Utilities.formatDate(d, APP.TZ, 'yyyy-MM');
      if (!m[key]) m[key] = { mc: 0, dc: 0, mp: 0, dp: 0 };
      if (r['ประเภท'] === KIND.MERIT) { m[key].mc++; m[key].mp += Number(r['คะแนน']); }
      else { m[key].dc++; m[key].dp += Number(r['คะแนน']); }
    });
    Object.keys(m).sort().forEach(function (k) {
      var parts = k.split('-');
      var label = TH_MONTHS[Number(parts[1]) - 1] + ' ' + (Number(parts[0]) + 543);
      report.rows.push([label, m[k].mc, m[k].dc, m[k].mp, m[k].dp,
        m[k].dc ? Math.round(m[k].mc / m[k].dc * 100) / 100 : '—']);
    });
    if (!report.rows.length) report.rows.push(['—', 0, 0, 0, 0, '—']);

  } else if (reportId === 'R11') {
    var board = computeLeaderboard_();
    report.title = 'กระดานเกียรติยศ นักเรียนคะแนนความดีสูงสุด';
    report.columns = ['ระดับ', 'อันดับ', 'ชื่อ-สกุล', 'ห้อง', 'คะแนนความดีสะสม', 'จำนวนครั้ง', 'คะแนนความประพฤติ'];
    [BAND.LOWER, BAND.UPPER].forEach(function (band) {
      board[band].forEach(function (c) {
        report.rows.push([band, c.rank, c.fullName, c.classLabel, c.meritTotal, c.meritCount, c.conductScore]);
      });
    });
    if (!report.rows.length) report.rows.push(['—', '', 'ยังไม่มีนักเรียนที่เข้าเกณฑ์', '', '', '', '']);
  }

  report.generatedAt = thaiDate(new Date(), true);
  report.generatedBy = user.name;
  report.rowCount = report.rows.length;
  return report;
}

/* ------------------------------------------------------------------ */
/* แปลงรายงานเป็นไฟล์                                                   */
/* ------------------------------------------------------------------ */

function renderReportFile_(report, format) {
  var tempName = 'temp-report-' + Utilities.getUuid();
  var ss = SpreadsheetApp.create(tempName);
  var fileId = ss.getId();

  try {
    var sheet = ss.getSheets()[0];
    sheet.setName(report.id);
    var width = Math.max(report.columns.length, 1);
    var cursor = 1;

    // ---- หัวรายงาน ----
    writeHeaderLine_(sheet, cursor++, width, APP.SCHOOL, 16, true, '#0d366b');
    writeHeaderLine_(sheet, cursor++, width, report.title, 14, true, '#0b0b0b');
    if (report.subtitle) writeHeaderLine_(sheet, cursor++, width, report.subtitle, 11, false, '#52514e');
    report.notes.forEach(function (n) {
      writeHeaderLine_(sheet, cursor++, width, n, 10, false, '#52514e');
    });
    cursor++;   // เว้นบรรทัด

    // ---- ตาราง ----
    var headerRow = cursor;
    sheet.getRange(headerRow, 1, 1, width).setValues([report.columns])
      .setFontWeight('bold').setFontSize(10)
      .setBackground('#e8eef7').setFontColor('#0b0b0b')
      .setVerticalAlignment('middle').setWrap(true);

    if (report.rows.length) {
      var body = report.rows.map(function (r) {
        var row = r.slice(0, width);
        while (row.length < width) row.push('');
        return row;
      });
      sheet.getRange(headerRow + 1, 1, body.length, width).setValues(body)
        .setFontSize(10).setVerticalAlignment('top').setWrap(true);
      sheet.getRange(headerRow, 1, body.length + 1, width)
        .setBorder(true, true, true, true, true, true, '#c3c2b7', SpreadsheetApp.BorderStyle.SOLID);
    }

    // ---- ท้ายรายงาน ----
    var footRow = headerRow + report.rows.length + 2;
    sheet.getRange(footRow, 1, 1, width).merge()
      .setValue('ออกรายงานเมื่อ ' + report.generatedAt + '  โดย ' + report.generatedBy +
                '  |  ' + APP.NAME + '  |  เอกสารนี้มีข้อมูลส่วนบุคคล โปรดใช้ในราชการเท่านั้น')
      .setFontSize(8).setFontColor('#898781');

    sheet.setFrozenRows(headerRow);
    for (var c = 1; c <= width; c++) {
      sheet.autoResizeColumn(c);
      if (sheet.getColumnWidth(c) > 320) sheet.setColumnWidth(c, 320);
      if (sheet.getColumnWidth(c) < 70) sheet.setColumnWidth(c, 70);
    }
    SpreadsheetApp.flush();

    var safeTitle = report.title.replace(/[\\/:*?"<>|]/g, '-');
    var stamp = Utilities.formatDate(new Date(), APP.TZ, 'yyyyMMdd-HHmm');
    var fileName = report.id + ' ' + safeTitle + ' ' + stamp + '.' + format;
    var blob = fetchExport_(fileId, format, report.landscape).setName(fileName);
    return blob;

  } finally {
    try { DriveApp.getFileById(fileId).setTrashed(true); } catch (e) { /* ไม่ให้ล้มทั้งรายงาน */ }
  }
}

function writeHeaderLine_(sheet, row, width, text, size, bold, color) {
  var range = sheet.getRange(row, 1, 1, width);
  if (width > 1) range.merge();
  range.setValue(text).setFontSize(size).setFontWeight(bold ? 'bold' : 'normal')
       .setFontColor(color).setHorizontalAlignment('center');
}

function fetchExport_(fileId, format, landscape) {
  var url = 'https://docs.google.com/spreadsheets/d/' + fileId + '/export?format=' +
    (format === 'pdf' ? 'pdf' : 'xlsx');

  if (format === 'pdf') {
    url += '&size=A4' +
           '&portrait=' + (landscape ? 'false' : 'true') +
           '&fitw=true&gridlines=false&printtitle=false&sheetnames=false' +
           '&pagenum=CENTER&fzr=true' +
           '&top_margin=0.50&bottom_margin=0.50&left_margin=0.50&right_margin=0.50';
  }

  var response = UrlFetchApp.fetch(url, {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  });
  if (response.getResponseCode() !== 200) {
    throw new Error('สร้างไฟล์รายงานไม่สำเร็จ (รหัส ' + response.getResponseCode() + ') กรุณาลองใหม่อีกครั้ง');
  }
  return response.getBlob();
}


/* ----------------------------------------------------------------------
 * 06_Setup.gs
 * ---------------------------------------------------------------------- */

/**
 * 06_Setup.gs — ติดตั้งระบบ สร้างชีต และใส่ข้อมูลตั้งต้น
 *
 * วิธีใช้: เปิดไฟล์ Google Sheets -> เมนู "ระบบคะแนนความประพฤติ" -> "ติดตั้งระบบ"
 * รันซ้ำได้ปลอดภัย ชีตที่มีอยู่แล้วจะไม่ถูกลบข้อมูล
 */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('⚙️ ระบบคะแนนความประพฤติ')
    .addItem('1. ติดตั้งระบบ (สร้างชีตและข้อมูลตั้งต้น)', 'setupSystem')
    .addItem('2. สร้างบัญชีผู้ดูแลระบบ', 'createAdminPrompt')
    .addSeparator()
    .addItem('ใส่ข้อมูลตัวอย่างสำหรับทดลองใช้', 'installDemoData')
    .addItem('คำนวณคะแนนคงเหลือใหม่ทั้งหมด', 'menuRebuildBalances')
    .addItem('ประกาศกระดานเกียรติยศตอนนี้', 'menuPublishLeaderboard')
    .addSeparator()
    .addItem('ล้างเซสชันการเข้าใช้ทั้งหมด', 'menuClearSessions')
    .addToUi();
}

function setupSystem() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', ss.getId());
  _ssCache = ss;

  var created = [];
  Object.keys(SCHEMA).forEach(function (sheetName) {
    var sh = ss.getSheetByName(sheetName);
    if (!sh) {
      sh = ss.insertSheet(sheetName);
      created.push(sheetName);
    }
    var headers = SCHEMA[sheetName];
    sh.getRange(1, 1, 1, headers.length).setValues([headers])
      .setFontWeight('bold').setBackground('#e8eef7').setFontColor('#0b0b0b');
    sh.setFrozenRows(1);
    if (sh.getMaxColumns() > headers.length) {
      sh.deleteColumns(headers.length + 1, sh.getMaxColumns() - headers.length);
    }
    sh.autoResizeColumns(1, headers.length);
  });

  dbClearCache();

  if (!dbReadAll(SHEETS.SETTINGS, false).length) {
    dbInsertMany(SHEETS.SETTINGS, DEFAULT_SETTINGS.map(function (r) {
      return { 'คีย์': r[0], 'ค่า': r[1], 'คำอธิบาย': r[2] };
    }));
  }
  if (!dbReadAll(SHEETS.THRESHOLDS, false).length) {
    dbInsertMany(SHEETS.THRESHOLDS, DEFAULT_THRESHOLDS.map(function (r) {
      return { 'คะแนนต่ำสุด': r[0], 'คะแนนสูงสุด': r[1], 'ระดับ': r[2], 'การดำเนินการ': r[3], 'สี': r[4] };
    }));
  }
  if (!dbReadAll(SHEETS.RULES, false).length) seedRules_();

  // ลบชีตเปล่าที่ Google สร้างมาให้ตอนสร้างไฟล์ใหม่
  var blank = ss.getSheetByName('Sheet1') || ss.getSheetByName('ชีต1');
  if (blank && ss.getSheets().length > 1) ss.deleteSheet(blank);

  var hasAdmin = dbFilter(SHEETS.USERS, function (u) { return u['บทบาท'] === 'admin'; }).length > 0;
  SpreadsheetApp.getUi().alert('ติดตั้งระบบเรียบร้อย',
    'สร้างชีตใหม่ ' + created.length + ' แผ่น\n' +
    'หลักเกณฑ์ในระบบ ' + dbReadAll(SHEETS.RULES, false).length + ' ข้อ (ความดี 30 ข้อ ความผิด 57 ข้อ)\n\n' +
    (hasAdmin ? 'ขั้นถัดไป: เผยแพร่เว็บแอป (Deploy > New deployment > Web app)'
              : 'ขั้นถัดไป: เลือกเมนู "2. สร้างบัญชีผู้ดูแลระบบ"'),
    SpreadsheetApp.getUi().ButtonSet.OK);
}

function createAdminPrompt() {
  var ui = SpreadsheetApp.getUi();
  var u = ui.prompt('สร้างบัญชีผู้ดูแลระบบ', 'ชื่อผู้ใช้ (ภาษาอังกฤษ เช่น admin)', ui.ButtonSet.OK_CANCEL);
  if (u.getSelectedButton() !== ui.Button.OK) return;
  var name = ui.prompt('สร้างบัญชีผู้ดูแลระบบ', 'ชื่อ-สกุล ผู้ดูแลระบบ', ui.ButtonSet.OK_CANCEL);
  if (name.getSelectedButton() !== ui.Button.OK) return;
  var p = ui.prompt('สร้างบัญชีผู้ดูแลระบบ', 'รหัสผ่าน (อย่างน้อย 8 ตัวอักษร)', ui.ButtonSet.OK_CANCEL);
  if (p.getSelectedButton() !== ui.Button.OK) return;

  try {
    createUser_(u.getResponseText(), p.getResponseText(), name.getResponseText(), 'admin', '');
    ui.alert('สร้างบัญชีเรียบร้อย', 'เข้าสู่ระบบด้วยชื่อผู้ใช้ "' +
      u.getResponseText().trim().toLowerCase() + '" ได้ทันที', ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('เกิดข้อผิดพลาด', e.message, ui.ButtonSet.OK);
  }
}

function createUser_(username, password, fullName, role, scope) {
  username = String(username || '').trim().toLowerCase();
  if (!username) throw new Error('กรุณาระบุชื่อผู้ใช้');
  if (String(password || '').length < 8) throw new Error('รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร');
  if (dbFind(SHEETS.USERS, function (x) { return String(x['ชื่อผู้ใช้']).toLowerCase() === username; })) {
    throw new Error('ชื่อผู้ใช้ "' + username + '" มีอยู่แล้ว');
  }
  var salt = makeSalt_();
  return dbInsert(SHEETS.USERS, {
    'ชื่อผู้ใช้': username,
    'รหัสผ่าน(เข้ารหัส)': hashPassword_(String(password), salt),
    'เกลือ': salt,
    'ชื่อ-สกุล': fullName || username,
    'บทบาท': role,
    'ขอบเขต': scope || '',
    'อีเมล': '', 'โทรศัพท์': '',
    'ใช้งาน': 'ใช่', 'ต้องเปลี่ยนรหัสผ่าน': 'ไม่',
    'เข้าใช้ล่าสุด': '', 'สร้างเมื่อ': nowStr()
  });
}

function menuRebuildBalances() {
  var n = rebuildAllBalances();
  SpreadsheetApp.getUi().alert('คำนวณคะแนนใหม่เรียบร้อย ' + n + ' รายการ');
}

function menuPublishLeaderboard() {
  var r = publishLeaderboard_(null);
  SpreadsheetApp.getUi().alert('ประกาศกระดานเกียรติยศเรียบร้อย ' + r.count + ' รายการ');
}

function menuClearSessions() {
  var props = PropertiesService.getScriptProperties();
  var all = props.getProperties();
  var n = 0;
  Object.keys(all).forEach(function (k) {
    if (k.indexOf(SESSION_PREFIX) === 0) { props.deleteProperty(k); n++; }
  });
  SpreadsheetApp.getUi().alert('ล้างเซสชันแล้ว ' + n + ' รายการ ผู้ใช้ทุกคนต้องเข้าสู่ระบบใหม่');
}

/* ------------------------------------------------------------------ */
/* ข้อมูลตัวอย่างสำหรับทดลองใช้                                           */
/* ------------------------------------------------------------------ */

function installDemoData() {
  var ui = SpreadsheetApp.getUi();
  if (dbReadAll(SHEETS.STUDENTS, false).length) {
    var ans = ui.alert('มีข้อมูลนักเรียนอยู่แล้ว',
      'ระบบจะเพิ่มนักเรียนตัวอย่างต่อท้ายข้อมูลเดิม ต้องการดำเนินการต่อหรือไม่',
      ui.ButtonSet.YES_NO);
    if (ans !== ui.Button.YES) return;
  }

  var year = currentYear();
  var demo = [
    ['30001', 'เด็กชาย', 'กิตติ', 'ตั้งใจดี', 'ชาย', 1, 1, 1, 'ใช่'],
    ['30002', 'เด็กหญิง', 'นภา', 'ศรีสุข', 'หญิง', 1, 1, 2, 'ใช่'],
    ['30003', 'เด็กชาย', 'ธนา', 'ขยันเรียน', 'ชาย', 1, 1, 3, 'ไม่'],
    ['30004', 'เด็กหญิง', 'ปรีดา', 'ใจงาม', 'หญิง', 1, 1, 4, 'ใช่'],
    ['30005', 'เด็กชาย', 'ภูมิ', 'รักเรียน', 'ชาย', 2, 1, 1, 'ใช่'],
    ['30006', 'เด็กหญิง', 'มณี', 'อ่อนหวาน', 'หญิง', 3, 1, 1, 'ใช่'],
    ['40001', 'นาย', 'วิชัย', 'มุ่งมั่น', 'ชาย', 4, 1, 1, 'ใช่'],
    ['40002', 'นางสาว', 'สุดา', 'พากเพียร', 'หญิง', 4, 1, 2, 'ใช่'],
    ['40003', 'นาย', 'อนันต์', 'กล้าหาญ', 'ชาย', 4, 1, 3, 'ใช่'],
    ['40004', 'นางสาว', 'เกศรา', 'อ่อนน้อม', 'หญิง', 4, 1, 4, 'ไม่'],
    ['40005', 'นาย', 'ชาญ', 'ตั้งมั่น', 'ชาย', 5, 1, 1, 'ใช่'],
    ['40006', 'นางสาว', 'ดาริกา', 'แจ่มใส', 'หญิง', 6, 1, 1, 'ใช่']
  ];

  dbInsertMany(SHEETS.STUDENTS, demo.map(function (d) {
    return {
      'รหัสนักเรียน': d[0], 'คำนำหน้า': d[1], 'ชื่อ': d[2], 'นามสกุล': d[3], 'เพศ': d[4],
      'ระดับชั้น': d[5], 'ห้อง': d[6], 'เลขที่': d[7], 'ชั้นแรกเข้า': d[5] <= 3 ? 1 : 4,
      'ปีแรกเข้า': year, 'สถานะ': 'ปกติ', 'ยินยอมเผยแพร่': d[8],
      'ชื่อผู้ปกครอง': 'ผู้ปกครองของ ' + d[2], 'โทรผู้ปกครอง': '08x-xxx-xxxx',
      'LINE ผู้ปกครอง': '', 'สร้างเมื่อ': nowStr()
    };
  }));

  // สร้างบัญชีครูตัวอย่าง (รหัสผ่านเดียวกันทุกคน ต้องเปลี่ยนก่อนใช้จริง)
  [['kru.somchai', 'นายสมชาย ใจดี', 'homeroom', '1/1'],
   ['kru.malee', 'นางมาลี รักเรียน', 'teacher', ''],
   ['affairs', 'หัวหน้างานกิจการนักเรียน', 'affairs', ''],
   ['director', 'ผู้อำนวยการโรงเรียน', 'executive', '']
  ].forEach(function (u) {
    try { createUser_(u[0], 'demo1234', u[1], u[2], u[3]); } catch (e) { /* มีอยู่แล้ว */ }
  });

  rebuildAllBalances();
  ui.alert('ใส่ข้อมูลตัวอย่างเรียบร้อย',
    'นักเรียน ' + demo.length + ' คน\n\n' +
    'บัญชีทดลอง (รหัสผ่าน demo1234 ทุกบัญชี):\n' +
    '  kru.somchai — ครูที่ปรึกษา ม.1/1\n' +
    '  kru.malee — ครูผู้สอน\n' +
    '  affairs — ฝ่ายกิจการนักเรียน\n' +
    '  director — ผู้บริหาร\n\n' +
    'อย่าลืมลบบัญชีทดลองทั้งหมดก่อนใช้งานจริง',
    ui.ButtonSet.OK);
}


/* ----------------------------------------------------------------------
 * 07_WebApp.gs
 * ---------------------------------------------------------------------- */

/**
 * 07_WebApp.gs — จุดเข้าเว็บแอป
 *
 * เผยแพร่: Deploy > New deployment > Web app
 *   Execute as        : Me (บัญชีของโรงเรียนที่เป็นเจ้าของไฟล์)
 *   Who has access    : Anyone  (ระบบมีหน้าล็อกอินของตัวเองอยู่แล้ว
 *                       ครูจึงไม่ต้องมีบัญชี Google ก็ใช้งานได้)
 */

function doGet(e) {
  var page = (e && e.parameter && e.parameter.page) || 'app';
  var template = HtmlService.createTemplateFromFile('Index');
  template.publicMode = (page === 'board');   // ?page=board = กระดานเกียรติยศสาธารณะ

  return template.evaluate()
    .setTitle(APP.NAME + ' ' + APP.SCHOOL)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setFaviconUrl('https://ssl.gstatic.com/docs/script/images/favicon.ico');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * กระดานเกียรติยศสำหรับหน้าเว็บสาธารณะ — เรียกได้โดยไม่ต้องเข้าสู่ระบบ
 * คืนเฉพาะข้อมูลที่เผยแพร่ได้: อันดับ ชื่อที่ปกปิดแล้ว ห้อง และคะแนนความดี
 * ไม่มีข้อมูลด้านลบใด ๆ ออกจากฟังก์ชันนี้
 */
function apiPublicLeaderboard() {
  return safeCall_(function () {
    var rows = dbReadAll(SHEETS.LEADERBOARD);
    var result = { lower: [], upper: [], publishedAtThai: null, school: APP.SCHOOL, year: currentYear() };

    rows.sort(function (a, b) { return Number(a['อันดับ']) - Number(b['อันดับ']); })
      .forEach(function (r) {
        var item = {
          rank: Number(r['อันดับ']), displayName: r['ชื่อที่แสดง'],
          classLabel: r['ห้อง'], meritTotal: Number(r['คะแนนความดี'])
        };
        if (r['ระดับ'] === BAND.LOWER) result.lower.push(item);
        else result.upper.push(item);
        if (!result.publishedAtThai) result.publishedAtThai = thaiDate(r['สร้างเมื่อ'], true);
      });

    // สถิติรวมทั้งโรงเรียน ไม่ระบุตัวบุคคล จึงเผยแพร่ได้ตาม PDPA
    var year = currentYear();
    var meritCount = dbReadAll(SHEETS.RECORDS).filter(function (r) {
      return Number(r['ปีการศึกษา']) === year && r['ประเภท'] === KIND.MERIT &&
             r['สถานะ'] === STATUS.APPROVED;
    }).length;
    result.totalMeritActs = meritCount;
    return result;
  });
}


/* ----------------------------------------------------------------------
 * 08_RuleData.gs
 * ---------------------------------------------------------------------- */

/**
 * 08_RuleData.gs — หลักเกณฑ์คะแนนจริงของโรงเรียนจุนวิทยาคม
 *
 * ข้อมูลชุดนี้ถอดมาจากตารางเกณฑ์ที่โรงเรียนใช้อยู่จริง
 *   เกณฑ์การทำความดี      30 ข้อ
 *   เกณฑ์คะแนนไม่พึงประสงค์ 57 ข้อ
 *
 * คอลัมน์ "รหัสเดิม" เก็บเลขรหัสที่โรงเรียนใช้อยู่ในเอกสารเดิมไว้ทั้งหมด
 * ส่วน "รหัสเกณฑ์" เป็นรหัสที่ระบบออกให้ใหม่แบบไม่ซ้ำกัน (ด-01..ด-30 และ ผ-01..ผ-57)
 * เพราะรหัสเดิมของโรงเรียนมีเลขซ้ำกันอยู่หลายคู่ (54, 55, 56) ถ้าใช้อ้างอิงตรง ๆ
 * ระบบจะแยกไม่ออกว่าหมายถึงเกณฑ์ข้อใด
 *
 * ระดับความรุนแรงคำนวณจากคะแนนที่หัก ใช้กำหนดว่าใครมีสิทธิ์อนุมัติ
 *   1-5 คะแนน = ระดับ 1 (เบา)        6-15 คะแนน = ระดับ 2 (ปานกลาง)
 *   16-30 คะแนน = ระดับ 3 (ร้ายแรง)   31 คะแนนขึ้นไป = ระดับ 4 (ร้ายแรงมาก)
 * ระดับ 3 ขึ้นไปต้องให้ฝ่ายกิจการนักเรียนเป็นผู้พิจารณาเท่านั้น
 */

/** [ลำดับ, ชื่อเกณฑ์, คะแนน, หมวด, คุณลักษณะอันพึงประสงค์, ต้องมีหลักฐาน] */
var SCHOOL_MERIT_RULES = [
  [1,  'เก็บของมีค่าราคาต่ำกว่า 100 บาท', 5, 'ความซื่อสัตย์สุจริต', 'ซื่อสัตย์สุจริต', 'ไม่'],
  [2,  'มีความเสียสละช่วยเหลือครู', 5, 'มารยาทและความมีน้ำใจ', 'มีจิตสาธารณะ', 'ไม่'],
  [3,  'ทำกิจกรรมปรับพฤติกรรม (จิตสาธารณะ 1 ชั่วโมง / 5 คะแนน)', 5, 'จิตอาสาและบำเพ็ญประโยชน์', 'มีจิตสาธารณะ', 'ไม่'],
  [4,  'เข้าร่วมกิจกรรมของโรงเรียน', 10, 'การเข้าร่วมและสร้างชื่อเสียง', 'มุ่งมั่นในการทำงาน', 'ไม่'],
  [5,  'ช่วยเหลืองานโรงเรียน', 10, 'จิตอาสาและบำเพ็ญประโยชน์', 'มีจิตสาธารณะ', 'ไม่'],
  [6,  'เก็บของมีค่าราคาตั้งแต่ 100 – 1,000 บาท', 10, 'ความซื่อสัตย์สุจริต', 'ซื่อสัตย์สุจริต', 'ไม่'],
  [7,  'ร่วมประกวด/แข่งขัน ทั้งในและนอกโรงเรียน', 15, 'การเข้าร่วมและสร้างชื่อเสียง', 'มุ่งมั่นในการทำงาน', 'ไม่'],
  [8,  'เก็บของมีค่าราคาตั้งแต่ 1,001 – 5,000 บาท', 15, 'ความซื่อสัตย์สุจริต', 'ซื่อสัตย์สุจริต', 'ไม่'],
  [9,  'ได้รับการประเมิน ว่าดีเยี่ยมประจำภาคเรียน', 15, 'ความรับผิดชอบและใฝ่เรียนรู้', 'ใฝ่เรียนรู้', 'ไม่'],
  [10, 'เป็นตัวแทนของโรงเรียนเข้าร่วมกิจกรรมกับชุมชน/ครั้ง', 10, 'การเข้าร่วมและสร้างชื่อเสียง', 'มีจิตสาธารณะ', 'ไม่'],
  [11, 'ช่วยเหลือครูผู้รู้เบาะแสนักเรียนผู้กระทำความผิด', 20, 'ความซื่อสัตย์สุจริต', 'ซื่อสัตย์สุจริต', 'ไม่'],
  [12, 'ชนะเลิศประกวด/แข่งขันระดับโรงเรียน', 30, 'การเข้าร่วมและสร้างชื่อเสียง', 'มุ่งมั่นในการทำงาน', 'ไม่'],
  [13, 'เก็บของมีค่า 5,000 บาทขึ้นไป', 30, 'ความซื่อสัตย์สุจริต', 'ซื่อสัตย์สุจริต', 'ไม่'],
  [14, 'เป็นตัวแทนโรงเรียนเข้าร่วมการอบรม/เข้าค่าย/สัมมนา', 30, 'การเข้าร่วมและสร้างชื่อเสียง', 'ใฝ่เรียนรู้', 'ไม่'],
  [15, 'เข้าร่วมการแข่งขันระดับเขตพื้นที่การศึกษา ระดับจังหวัด', 30, 'การเข้าร่วมและสร้างชื่อเสียง', 'มุ่งมั่นในการทำงาน', 'ไม่'],
  [16, 'คณะกรรมการสภานักเรียนตลอดปีการศึกษา', 30, 'จิตอาสาและบำเพ็ญประโยชน์', 'มีจิตสาธารณะ', 'ไม่'],
  [17, 'เป็นหัวหน้าห้อง และเป็นกรรมการห้องเรียน', 20, 'ความรับผิดชอบและใฝ่เรียนรู้', 'มุ่งมั่นในการทำงาน', 'ไม่'],
  [18, 'ช่วยงานดนตรี นาฏศิลป์ กีฬา ตลอดปีการศึกษา', 30, 'การเข้าร่วมและสร้างชื่อเสียง', 'รักความเป็นไทย', 'ไม่'],
  [19, 'ได้รับรางวัลการแข่งขันระดับเขตพื้นที่การศึกษา', 50, 'การเข้าร่วมและสร้างชื่อเสียง', 'มุ่งมั่นในการทำงาน', 'ไม่'],
  [20, 'ได้รับรางวัลการประกวด/แข่งขันระดับภาค', 70, 'การเข้าร่วมและสร้างชื่อเสียง', 'มุ่งมั่นในการทำงาน', 'ไม่'],
  [21, 'ได้รับการยกย่องชมเชยจากหน่วยงานภายนอก (เช่น ร่วมงาน ฯลฯ)', 100, 'การเข้าร่วมและสร้างชื่อเสียง', 'มีจิตสาธารณะ', 'ไม่'],
  [22, 'บรรพชาสามเณรและบวชศีลจาริณี ได้รับคัดเลือกจากโรงเรียน', 100, 'มารยาทและความมีน้ำใจ', 'รักความเป็นไทย', 'ไม่'],
  [23, 'เข้าร่วมกิจกรรมของโรงเรียนงานแสดงมุทิตาจิต', 10, 'มารยาทและความมีน้ำใจ', 'รักความเป็นไทย', 'ไม่'],
  [24, 'เข้าร่วมกิจกรรมจิตสาธารณะร่วมกับหน่วยงานภายนอก', 30, 'จิตอาสาและบำเพ็ญประโยชน์', 'มีจิตสาธารณะ', 'ไม่'],
  [25, 'เข้าร่วมกิจกรรมจิตสาธารณะภายในโรงเรียน', 10, 'จิตอาสาและบำเพ็ญประโยชน์', 'มีจิตสาธารณะ', 'ไม่'],
  [26, 'เข้าร่วมกิจกรรมของโรงเรียน (งานปีใหม่)', 5, 'การเข้าร่วมและสร้างชื่อเสียง', 'รักความเป็นไทย', 'ไม่'],
  [27, 'ช่วยเหลืองานกลุ่มบริหารงานกิจการนักเรียน ตั้งแต่เวลา 08.00-16.00 น.', 40, 'จิตอาสาและบำเพ็ญประโยชน์', 'มีจิตสาธารณะ', 'ไม่'],
  [28, 'บริจาคโลหิต โดยมีหลักฐานยืนยัน', 5, 'จิตอาสาและบำเพ็ญประโยชน์', 'มีจิตสาธารณะ', 'ใช่'],
  [29, 'ได้รับรางวัลการประกวด/แข่งขันระดับประเทศ', 80, 'การเข้าร่วมและสร้างชื่อเสียง', 'มุ่งมั่นในการทำงาน', 'ไม่'],
  [30, 'ได้รับรางวัลการประกวด/แข่งขันระดับนานาชาติ', 100, 'การเข้าร่วมและสร้างชื่อเสียง', 'มุ่งมั่นในการทำงาน', 'ไม่']
];

/** [ลำดับ, รหัสเดิมของโรงเรียน, ชื่อเกณฑ์, คะแนนที่หัก, หมวด] */
var SCHOOL_DEMERIT_RULES = [
  [1,  '1',  'มาสาย', 5, 'การมาเรียนและเวลาเรียน'],
  [2,  '2',  'ไม่เข้าเรียนบางคาบ ครั้งที่ 1', 5, 'การมาเรียนและเวลาเรียน'],
  [3,  '3',  'ไม่เข้าเรียนบางคาบ ครั้งที่ 2', 10, 'การมาเรียนและเวลาเรียน'],
  [4,  '4',  'ไม่ส่งใบลา', 5, 'การมาเรียนและเวลาเรียน'],
  [5,  '5',  'หลบหนีโรงเรียน ครั้งที่ 1', 20, 'การมาเรียนและเวลาเรียน'],
  [6,  '6',  'หลบหนีโรงเรียน ครั้งที่ 2', 30, 'การมาเรียนและเวลาเรียน'],
  [7,  '7',  'ไม่ตั้งใจเรียน', 5, 'ความประพฤติทั่วไป'],
  [8,  '8',  'ขัดคำสั่งครูอาจารย์ในเรื่องที่ชอบธรรม', 30, 'ความประพฤติทั่วไป'],
  [9,  '9',  'ปลอมลายมือชื่อผู้ปกครองหรือครู', 10, 'การทุจริตและเอกสาร'],
  [10, '10', 'ไม่ส่งใบสำรวจนักเรียนประจำชั้น', 10, 'ความประพฤติทั่วไป'],
  [11, '11', 'แต่งกายผิดระเบียบวินัย', 10, 'การแต่งกายและทรงผม'],
  [12, '12', 'ผมยาวหรือผิดทรงไปจากที่โรงเรียนกำหนด', 10, 'การแต่งกายและทรงผม'],
  [13, '13', 'ใส่เครื่องประดับ', 10, 'การแต่งกายและทรงผม'],
  [14, '14', 'ลักขโมย ครั้งที่ 1', 30, 'ทรัพย์สินและการลักขโมย'],
  [15, '15', 'ลักขโมย ครั้งที่ 2', 50, 'ทรัพย์สินและการลักขโมย'],
  [16, '16', 'แข่งกีฬาเดิมพัน', 10, 'การพนัน'],
  [17, '17', 'ทายเลข, ทอย หรือโยน ปั่นแปะ', 20, 'การพนัน'],
  [18, '18', 'เล่นไพ่ ไฮโล น้ำเต้า', 30, 'การพนัน'],
  [19, '44', 'สูบบุหรี่, บุหรี่ไฟฟ้า ครั้งที่ 1', 20, 'สารเสพติด บุหรี่ สุรา'],
  [20, '20', 'ดื่มสุรา', 50, 'สารเสพติด บุหรี่ สุรา'],
  [21, '21', 'เสพยาเสพติดทุกชนิด', 50, 'สารเสพติด บุหรี่ สุรา'],
  [22, '22', 'ทำลายทรัพย์สินของบุคคลอื่น', 30, 'ทรัพย์สินและการลักขโมย'],
  [23, '23', 'เข้าไปสถานที่ต้องห้าม', 30, 'ความประพฤติและชื่อเสียง'],
  [24, '24', 'ทะเลาะวิวาทกับเพื่อนนักเรียน', 50, 'ความรุนแรงและการกลั่นแกล้ง'],
  [25, '25', 'ทะเลาะวิวาทกับบุคคลภายนอก', 50, 'ความรุนแรงและการกลั่นแกล้ง'],
  [26, '26', 'ชักชวนบุคคลภายนอกเข้ามาทะเลาะวิวาทในโรงเรียน', 50, 'ความรุนแรงและการกลั่นแกล้ง'],
  [27, '27', 'แสดงกิริยามารยาทที่ไม่สุภาพและ/หรือไม่เหมาะสมในที่สาธารณะ เช่น วัด ฯลฯ', 30, 'ความประพฤติและชื่อเสียง'],
  [28, '28', 'กลั่นแกล้ง รังแก บีบบังคับขู่เข็ญด้วยวาจาและกระทำต่อผู้อ่อนแอกว่า', 30, 'ความรุนแรงและการกลั่นแกล้ง'],
  [29, '29', 'แสดงกริยาท่าทาง หรือใช้วาจาก้าวร้าวต่อครู - บุคลากร', 50, 'ความรุนแรงและการกลั่นแกล้ง'],
  [30, '30', 'มีพฤติกรรมชู้สาว', 30, 'ความประพฤติและชื่อเสียง'],
  [31, '31', 'ยุยงให้เกิดความแตกแยกความสามัคคีในหมู่คณะ', 50, 'ความรุนแรงและการกลั่นแกล้ง'],
  [32, '32', 'ไม่เข้าแถวหน้าเสาธง', 3, 'ความประพฤติทั่วไป'],
  [33, '33', 'ใส่ถุงเท้าข้อสั้น (ครั้งที่ 1)', 5, 'การแต่งกายและทรงผม'],
  [34, '34', 'ใส่ถุงเท้าข้อสั้น (ครั้งที่ 2)', 10, 'การแต่งกายและทรงผม'],
  [35, '35', 'จงใจไม่เข้าแถว/หลบหนีการเข้าแถวเคารพธงชาติ', 10, 'ความประพฤติทั่วไป'],
  [36, '36', 'แอบค้น/ขโมยของ ของครู-บุคลากร', 20, 'ทรัพย์สินและการลักขโมย'],
  [37, '37', 'สนับสนุน ยุยง ร่วมด้วย ในการแอบค้น/ขโมยของ ของครู-บุคลากร', 10, 'ทรัพย์สินและการลักขโมย'],
  [38, '38', 'หลบหนีโรงเรียน ครั้งที่ 3', 50, 'การมาเรียนและเวลาเรียน'],
  [39, '39', 'คู่กรณีเป็นต้นเหตุการทะเลาะวิวาทถูกกระทำฝ่ายเดียว', 20, 'ความรุนแรงและการกลั่นแกล้ง'],
  [40, '40', 'ปลอมแปลงเอกสารเกี่ยวกับโรงเรียน', 50, 'การทุจริตและเอกสาร'],
  [41, '41', 'หนีเที่ยวนอกสถานศึกษา', 20, 'การมาเรียนและเวลาเรียน'],
  [42, '42', 'สมรู้ร่วมคิดในการกระทำผิด', 30, 'ความประพฤติและชื่อเสียง'],
  [43, '43', 'จำหน่ายบุหรี่, บุหรี่ไฟฟ้า, อุปกรณ์สูบบุหรี่ไฟฟ้า', 50, 'สารเสพติด บุหรี่ สุรา'],
  [44, '45', 'สูบบุหรี่, บุหรี่ไฟฟ้า ครั้งที่ 2', 30, 'สารเสพติด บุหรี่ สุรา'],
  [45, '46', 'สูบบุหรี่, บุหรี่ไฟฟ้า ครั้งที่ 3 ขึ้นไป', 50, 'สารเสพติด บุหรี่ สุรา'],
  [46, '54', 'ให้หรือยินยอมให้ผู้อื่นสวมเครื่องแบบของโรงเรียน', 50, 'ความประพฤติและชื่อเสียง'],
  [47, '56', 'กระทำการใดที่เสื่อมเสียชื่อเสียงของตนเองหรือผู้อื่น', 30, 'ความประพฤติและชื่อเสียง'],
  [48, '55', 'กระทำการทำให้เสื่อมเสียชื่อเสียงของโรงเรียนอย่างร้ายแรง', 30, 'ความประพฤติและชื่อเสียง'],
  [49, '52', 'ดัดแปลงรถขับขี่เสียงดังก่อให้เกิดความรำคาญ', 50, 'ความประพฤติและชื่อเสียง'],
  [50, '47', 'นำพาหรือชักชวนบุคคลภายนอกเข้ามาในโรงเรียน', 50, 'ความประพฤติและชื่อเสียง'],
  [51, '99', 'ล้อชื่อบิดามารดาของเพื่อน', 50, 'ความรุนแรงและการกลั่นแกล้ง'],
  [52, '19', 'นัดแนะบุคคลภายนอกจำหน่ายหรือส่งบุหรี่ให้', 30, 'สารเสพติด บุหรี่ สุรา'],
  [53, '53', 'หลบหนีกิจกรรมโรงเรียน', 10, 'การมาเรียนและเวลาเรียน'],
  [54, '54', 'ชาร์จแบตโทรศัพท์ ครั้งที่ 1', 5, 'ความประพฤติทั่วไป'],
  [55, '55', 'โกหกครู', 30, 'การทุจริตและเอกสาร'],
  [56, '56', 'ไม่ส่งใบเข้าห้องสอบ', 20, 'ความประพฤติทั่วไป'],
  [57, '57', 'แสดงวาจาล้อเลียน ส่อเสียด ด่าทอและใช้คำหยาบ', 50, 'ความรุนแรงและการกลั่นแกล้ง']
];

/** แปลงคะแนนที่หักเป็นระดับความรุนแรง ใช้กำหนดผู้มีสิทธิ์อนุมัติ */
function severityFromPoints(points) {
  points = Number(points);
  if (points <= 5) return 1;
  if (points <= 15) return 2;
  if (points <= 30) return 3;
  return 4;
}

function pad2_(n) { return ('0' + n).slice(-2); }

/** ใส่หลักเกณฑ์ตั้งต้นของโรงเรียนลงชีต "หลักเกณฑ์" */
function seedRules_() {
  var rows = SCHOOL_MERIT_RULES.map(function (m) {
    return {
      'รหัสเกณฑ์': 'ด-' + pad2_(m[0]),
      'รหัสเดิม': m[0],
      'หมวด': m[3],
      'ประเภท': KIND.MERIT,
      'ชื่อเกณฑ์': m[1],
      'คะแนน': m[2],
      'ระดับความรุนแรง': '',
      'คุณลักษณะอันพึงประสงค์': m[4],
      'ต้องมีหลักฐาน': m[5],
      'เพดานครั้ง/ภาคเรียน': '',
      'อ้างอิงระเบียบ': '',
      'ใช้งาน': 'ใช่'
    };
  }).concat(SCHOOL_DEMERIT_RULES.map(function (d) {
    var severity = severityFromPoints(d[3]);
    return {
      'รหัสเกณฑ์': 'ผ-' + pad2_(d[0]),
      'รหัสเดิม': d[1],
      'หมวด': d[4],
      'ประเภท': KIND.DEMERIT,
      'ชื่อเกณฑ์': d[2],
      'คะแนน': d[3],
      'ระดับความรุนแรง': severity,
      'คุณลักษณะอันพึงประสงค์': '',
      // ความผิดระดับร้ายแรงขึ้นไปควรมีหลักฐานประกอบเสมอ เพราะกระทบสิทธิของนักเรียนมาก
      'ต้องมีหลักฐาน': severity >= 3 ? 'ใช่' : 'ไม่',
      'เพดานครั้ง/ภาคเรียน': '',
      'อ้างอิงระเบียบ': 'ระเบียบโรงเรียนจุนวิทยาคมว่าด้วยความประพฤตินักเรียน',
      'ใช้งาน': 'ใช่'
    };
  }));

  dbInsertMany(SHEETS.RULES, rows);
  return rows.length;
}


/* ----------------------------------------------------------------------
 * 09_Import.gs
 * ---------------------------------------------------------------------- */

/**
 * 09_Import.gs — ระบบนำเข้าข้อมูลจากไฟล์ CSV / Excel
 *
 * นำเข้าได้ 5 ประเภท
 *   1. ข้อมูลนักเรียน
 *   2. เกณฑ์การทำความดี
 *   3. เกณฑ์คะแนนไม่พึงประสงค์
 *   4. บันทึกการทำความดีของนักเรียน
 *   5. บันทึกการถูกตัดคะแนนของนักเรียน
 *
 * ทำงานสองจังหวะเสมอ: **ตรวจสอบก่อน** แล้วจึง **ยืนยันนำเข้า**
 * ผู้ใช้จะเห็นก่อนว่าแถวไหนจะถูกเพิ่ม แถวไหนจะถูกแก้ไข แถวไหนข้าม และแถวไหนผิดพลาดเพราะอะไร
 * ไม่มีการเขียนข้อมูลใด ๆ ลงชีตจนกว่าจะกดยืนยัน
 */

var IMPORT_TYPES = {
  students: {
    name: 'ข้อมูลนักเรียน',
    icon: '👥',
    sheet: 'นักเรียน',
    permission: 'student.manage',
    note: 'ถ้ารหัสประจำตัวซ้ำกับที่มีอยู่ ระบบจะอัปเดตข้อมูลเดิม (เช่น เลื่อนชั้น ย้ายห้อง) ไม่สร้างซ้ำ',
    columns: [
      { key: 'รหัสนักเรียน', required: true, alias: ['รหัสประจำตัว', 'เลขประจำตัว', 'รหัส'], hint: 'เช่น 30001' },
      { key: 'คำนำหน้า', alias: ['คำนำหน้าชื่อ'], hint: 'เด็กชาย / นางสาว' },
      { key: 'ชื่อ', required: true, alias: ['ชื่อจริง'] },
      { key: 'นามสกุล', required: true, alias: ['สกุล'] },
      { key: 'เพศ', hint: 'ชาย / หญิง' },
      { key: 'ระดับชั้น', required: true, alias: ['ชั้น', 'ระดับ'], hint: 'ใส่เลข 1-6 (ม.1 = 1)' },
      { key: 'ห้อง', required: true, alias: ['ห้องเรียน'], hint: 'เช่น 1' },
      { key: 'เลขที่', alias: ['เลขที่ในห้อง'] },
      { key: 'ยินยอมเผยแพร่', hint: 'ใช่ / ไม่ (ความยินยอม PDPA ให้แสดงชื่อบนกระดานเกียรติยศ)' },
      { key: 'ชื่อผู้ปกครอง' },
      { key: 'โทรผู้ปกครอง', alias: ['เบอร์ผู้ปกครอง', 'โทรศัพท์ผู้ปกครอง'] },
      { key: 'LINE ผู้ปกครอง', alias: ['ไลน์ผู้ปกครอง'] },
      { key: 'สถานะ', hint: 'ปกติ / พ้นสภาพ (เว้นว่าง = ปกติ)' }
    ]
  },

  merit_rules: {
    name: 'เกณฑ์การทำความดี',
    icon: '🌟',
    sheet: 'หลักเกณฑ์',
    permission: 'rule.manage',
    kind: KIND.MERIT,
    note: 'ถ้ารหัสเดิมหรือชื่อเกณฑ์ตรงกับที่มีอยู่ ระบบจะอัปเดตคะแนนและรายละเอียดให้ ไม่สร้างซ้ำ',
    columns: [
      { key: 'รหัสเดิม', alias: ['รหัส', 'ลำดับ'], hint: 'เลขรหัสที่โรงเรียนใช้อยู่เดิม (ซ้ำกันได้)' },
      { key: 'ชื่อเกณฑ์', required: true, alias: ['สถานะการเข้าร่วมกิจกรรม', 'รายการ', 'เกณฑ์'] },
      { key: 'คะแนน', required: true, alias: ['คะแนนที่ได้', 'คะแนนบวก'], hint: 'ใส่เป็นจำนวนเต็มบวก' },
      { key: 'หมวด', alias: ['หมวดหมู่', 'ประเภทกิจกรรม'] },
      { key: 'คุณลักษณะอันพึงประสงค์', alias: ['คุณลักษณะ'] },
      { key: 'ต้องมีหลักฐาน', hint: 'ใช่ / ไม่' },
      { key: 'เพดานครั้ง/ภาคเรียน', alias: ['เพดานครั้ง', 'จำกัดครั้ง'], hint: 'เว้นว่าง = ไม่จำกัด' },
      { key: 'ใช้งาน', hint: 'ใช่ / ไม่' }
    ]
  },

  demerit_rules: {
    name: 'เกณฑ์คะแนนไม่พึงประสงค์',
    icon: '⚠️',
    sheet: 'หลักเกณฑ์',
    permission: 'rule.manage',
    kind: KIND.DEMERIT,
    note: 'ระดับความรุนแรงคำนวณจากคะแนนที่หักให้อัตโนมัติ ถ้าไม่ได้ระบุมาในไฟล์',
    columns: [
      { key: 'รหัสเดิม', alias: ['รหัส', 'ลำดับ'], hint: 'เลขรหัสที่โรงเรียนใช้อยู่เดิม (ซ้ำกันได้)' },
      { key: 'ชื่อเกณฑ์', required: true, alias: ['สถานะการเข้าร่วมกิจกรรม', 'รายการ', 'เกณฑ์', 'พฤติกรรม'] },
      { key: 'คะแนน', required: true, alias: ['คะแนนลบ', 'คะแนนที่หัก', 'คะแนนหัก'], hint: 'ใส่เป็นจำนวนเต็มบวก ระบบจะหักให้เอง' },
      { key: 'หมวด', alias: ['หมวดหมู่'] },
      { key: 'ระดับความรุนแรง', hint: '1-4 เว้นว่างได้ ระบบคำนวณจากคะแนนให้' },
      { key: 'ต้องมีหลักฐาน', hint: 'ใช่ / ไม่' },
      { key: 'อ้างอิงระเบียบ' },
      { key: 'ใช้งาน', hint: 'ใช่ / ไม่' }
    ]
  },

  merit_records: {
    name: 'บันทึกการทำความดีของนักเรียน',
    icon: '📗',
    sheet: 'บันทึกพฤติกรรม',
    permission: 'record.approve',
    kind: KIND.MERIT,
    note: 'ใช้นำเข้าข้อมูลย้อนหลัง ระบบจะคำนวณคะแนนของนักเรียนที่เกี่ยวข้องใหม่ตามลำดับเวลาจริง',
    columns: [
      { key: 'รหัสนักเรียน', required: true, alias: ['รหัสประจำตัว', 'เลขประจำตัว'] },
      { key: 'เกณฑ์', required: true, alias: ['รหัสเกณฑ์', 'รหัสเดิม', 'ชื่อเกณฑ์', 'รายการ'],
        hint: 'ใส่รหัสเกณฑ์ของระบบ (ด-01) หรือรหัสเดิม หรือชื่อเกณฑ์เต็ม ๆ' },
      { key: 'วันที่', required: true, alias: ['วันเวลาที่เกิดเหตุ', 'วันที่ทำความดี'],
        hint: 'รองรับ 2026-06-10 หรือ 10/06/2569' },
      { key: 'รายละเอียด', alias: ['หมายเหตุ', 'รายละเอียดเหตุการณ์'] },
      { key: 'สถานที่' },
      { key: 'ผู้บันทึก', alias: ['ครูผู้บันทึก'] },
      { key: 'สถานะ', hint: 'อนุมัติแล้ว / รออนุมัติ (เว้นว่าง = อนุมัติแล้ว)' }
    ]
  },

  demerit_records: {
    name: 'บันทึกการถูกตัดคะแนนของนักเรียน',
    icon: '📕',
    sheet: 'บันทึกพฤติกรรม',
    permission: 'record.approve',
    kind: KIND.DEMERIT,
    note: 'ใช้นำเข้าข้อมูลย้อนหลัง ระบบจะคำนวณคะแนนของนักเรียนที่เกี่ยวข้องใหม่ตามลำดับเวลาจริง',
    columns: [
      { key: 'รหัสนักเรียน', required: true, alias: ['รหัสประจำตัว', 'เลขประจำตัว'] },
      { key: 'เกณฑ์', required: true, alias: ['รหัสเกณฑ์', 'รหัสเดิม', 'ชื่อเกณฑ์', 'รายการ', 'พฤติกรรม'],
        hint: 'ใส่รหัสเกณฑ์ของระบบ (ผ-01) หรือรหัสเดิม หรือชื่อเกณฑ์เต็ม ๆ' },
      { key: 'วันที่', required: true, alias: ['วันเวลาที่เกิดเหตุ', 'วันที่กระทำผิด'],
        hint: 'รองรับ 2026-06-10 หรือ 10/06/2569' },
      { key: 'รายละเอียด', alias: ['หมายเหตุ', 'รายละเอียดเหตุการณ์'] },
      { key: 'สถานที่' },
      { key: 'ผู้บันทึก', alias: ['ครูผู้บันทึก'] },
      { key: 'สถานะ', hint: 'อนุมัติแล้ว / รออนุมัติ (เว้นว่าง = อนุมัติแล้ว)' }
    ]
  }
};

/* ------------------------------------------------------------------ */
/* API                                                                 */
/* ------------------------------------------------------------------ */

function apiImportTypes(token) {
  return safeCall_(function () {
    var user = requireUser_(token);
    return Object.keys(IMPORT_TYPES)
      .filter(function (id) { return hasPermission_(user, IMPORT_TYPES[id].permission); })
      .map(function (id) {
        var t = IMPORT_TYPES[id];
        return {
          id: id, name: t.name, icon: t.icon, note: t.note,
          columns: t.columns.map(function (c) {
            return { key: c.key, required: !!c.required, hint: c.hint || '',
                     alias: (c.alias || []).join(', ') };
          })
        };
      });
  });
}

/** ไฟล์ตัวอย่างพร้อมหัวตารางและข้อมูลตัวอย่าง 1 แถว */
function apiImportTemplate(token, typeId) {
  return safeCall_(function () {
    var t = IMPORT_TYPES[typeId];
    if (!t) throw new Error('ไม่พบประเภทข้อมูลที่ระบุ');
    requirePermission_(token, t.permission);

    var headers = t.columns.map(function (c) { return c.key; });
    var sample = importSampleRow_(typeId);
    var csv = [headers, sample].map(function (row) {
      return row.map(function (v) {
        v = String(v === undefined ? '' : v);
        return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
      }).join(',');
    }).join('\n');

    return { fileName: 'แบบฟอร์มนำเข้า-' + t.name + '.csv', csv: csv };
  });
}

function apiImportPreview(token, typeId, csvText) {
  return safeCall_(function () {
    var t = IMPORT_TYPES[typeId];
    if (!t) throw new Error('ไม่พบประเภทข้อมูลที่ระบุ');
    var user = requirePermission_(token, t.permission);
    return analyzeImport_(user, typeId, csvText, 60);
  });
}

function apiImportCommit(token, typeId, csvText) {
  return safeCall_(function () {
    var t = IMPORT_TYPES[typeId];
    if (!t) throw new Error('ไม่พบประเภทข้อมูลที่ระบุ');
    var user = requirePermission_(token, t.permission);

    var analysis = analyzeImport_(user, typeId, csvText, 0);
    if (!analysis.summary.create && !analysis.summary.update) {
      throw new Error('ไม่มีแถวที่นำเข้าได้ กรุณาตรวจสอบข้อมูลตามรายการที่แจ้งไว้');
    }

    var result = typeId === 'students'      ? commitStudents_(analysis, user)
               : typeId.indexOf('_rules') > 0   ? commitRules_(analysis, user)
               : commitRecords_(analysis, user);

    dbClearCache();
    logAudit(user, 'นำเข้าข้อมูล', t.name,
      'เพิ่ม ' + result.created + ' · แก้ไข ' + result.updated + ' · ข้าม ' + analysis.summary.skip);

    result.skipped = analysis.summary.skip;
    result.errors = analysis.summary.error;
    result.typeName = t.name;
    return result;
  });
}

/* ------------------------------------------------------------------ */
/* ตรวจสอบข้อมูลก่อนนำเข้า                                               */
/* ------------------------------------------------------------------ */

function analyzeImport_(user, typeId, csvText, previewLimit) {
  var t = IMPORT_TYPES[typeId];
  var text = String(csvText || '').trim();
  if (!text) throw new Error('ยังไม่ได้ใส่ข้อมูล');

  var table;
  try {
    table = Utilities.parseCsv(text);
  } catch (e) {
    throw new Error('อ่านข้อมูลไม่สำเร็จ กรุณาตรวจสอบว่าเป็นรูปแบบ CSV ที่ถูกต้อง (' + e.message + ')');
  }
  if (table.length < 2) throw new Error('ต้องมีบรรทัดหัวตาราง และข้อมูลอย่างน้อย 1 แถว');

  // ---- จับคู่หัวตารางกับคอลัมน์ที่ระบบรู้จัก ----
  var rawHeaders = table[0].map(function (h) { return String(h).trim(); });
  var map = {}, unknown = [];
  rawHeaders.forEach(function (h, i) {
    if (!h) return;
    var matched = null;
    t.columns.forEach(function (c) {
      if (matched) return;
      if (c.key === h || (c.alias || []).indexOf(h) >= 0) matched = c.key;
    });
    if (matched) { if (map[matched] === undefined) map[matched] = i; }
    else unknown.push(h);
  });

  var missing = t.columns.filter(function (c) { return c.required && map[c.key] === undefined; })
                         .map(function (c) { return c.key; });
  if (missing.length) {
    throw new Error('ไฟล์ขาดคอลัมน์ที่จำเป็น: ' + missing.join(', ') +
      '  (หัวตารางที่พบในไฟล์: ' + rawHeaders.filter(String).join(', ') + ')');
  }

  function cell(row, key) {
    var i = map[key];
    return i === undefined ? '' : String(row[i] === undefined ? '' : row[i]).trim();
  }

  var ctx = buildImportContext_(typeId);
  var rows = [], preview = [];
  var summary = { total: 0, create: 0, update: 0, skip: 0, error: 0 };

  for (var r = 1; r < table.length; r++) {
    if (table[r].join('').trim() === '') continue;
    summary.total++;

    var parsed;
    try {
      parsed = parseImportRow_(typeId, function (k) { return cell(table[r], k); }, ctx, user);
    } catch (e) {
      parsed = { action: 'error', message: e.message, display: cell(table[r], t.columns[0].key) };
    }
    parsed.line = r + 1;
    summary[parsed.action]++;
    if (parsed.action === 'create' || parsed.action === 'update') rows.push(parsed);
    if (!previewLimit || preview.length < previewLimit) preview.push(parsed);
  }

  return {
    typeId: typeId, typeName: t.name, note: t.note,
    matchedColumns: Object.keys(map), unknownColumns: unknown,
    summary: summary, rows: rows, preview: preview,
    truncated: !!previewLimit && summary.total > preview.length
  };
}

/** เตรียมข้อมูลอ้างอิงที่ต้องใช้ตรวจสอบ อ่านครั้งเดียวใช้ทุกแถว */
function buildImportContext_(typeId) {
  var ctx = { studentsByCode: {}, rulesById: {}, ruleByKey: {}, ambiguous: {}, recordKeys: {}, recordNos: {} };

  dbReadAll(SHEETS.STUDENTS).forEach(function (s) {
    ctx.studentsByCode[String(s['รหัสนักเรียน']).trim()] = s;
  });

  dbReadAll(SHEETS.RULES).forEach(function (r) {
    ctx.rulesById[r['รหัส']] = r;
    var kind = r['ประเภท'];
    [String(r['รหัสเกณฑ์']).trim(), String(r['รหัสเดิม']).trim(), String(r['ชื่อเกณฑ์']).trim()]
      .forEach(function (k) {
        if (!k) return;
        var key = kind + '|' + k;
        // รหัสเดิมของโรงเรียนมีเลขซ้ำกันอยู่ ถ้าซ้ำต้องเตือนให้ใช้รหัสเกณฑ์ของระบบแทน
        if (ctx.ruleByKey[key] && ctx.ruleByKey[key]['รหัส'] !== r['รหัส']) ctx.ambiguous[key] = true;
        else ctx.ruleByKey[key] = r;
      });
  });

  if (typeId.indexOf('_records') > 0) {
    dbReadAll(SHEETS.RECORDS).forEach(function (r) {
      ctx.recordNos[String(r['เลขที่บันทึก'])] = true;
      var day = String(r['วันเวลาที่เกิดเหตุ']).substring(0, 10);
      ctx.recordKeys[r['รหัสนักเรียน(ระบบ)'] + '|' + r['รหัสเกณฑ์(ระบบ)'] + '|' + day] = true;
    });
  }
  return ctx;
}

function yesNo_(value, fallback) {
  var v = String(value || '').trim().toLowerCase();
  if (['ใช่', 'y', 'yes', 'true', '1', 'มี'].indexOf(v) >= 0) return 'ใช่';
  if (['ไม่', 'ไม่ใช่', 'n', 'no', 'false', '0', 'ไม่มี'].indexOf(v) >= 0) return 'ไม่';
  return fallback;
}

function parseImportRow_(typeId, get, ctx, user) {
  if (typeId === 'students') return parseStudentRow_(get, ctx);
  if (typeId === 'merit_rules' || typeId === 'demerit_rules') return parseRuleRow_(typeId, get, ctx);
  return parseRecordRow_(typeId, get, ctx, user);
}

/* ---- นักเรียน ---- */
function parseStudentRow_(get, ctx) {
  var code = get('รหัสนักเรียน');
  if (!code) return { action: 'error', message: 'ไม่มีรหัสประจำตัวนักเรียน', display: '' };

  var first = get('ชื่อ'), last = get('นามสกุล');
  if (!first || !last) return { action: 'error', message: 'ต้องมีทั้งชื่อและนามสกุล', display: code };

  var grade = Number(get('ระดับชั้น'));
  if (!(grade >= 1 && grade <= 6)) {
    return { action: 'error', message: 'ระดับชั้นต้องเป็นเลข 1 ถึง 6 (พบ "' + get('ระดับชั้น') + '")', display: code };
  }
  var room = Number(get('ห้อง'));
  if (!(room >= 1)) return { action: 'error', message: 'ห้องเรียนต้องเป็นตัวเลขตั้งแต่ 1', display: code };

  var existing = ctx.studentsByCode[code];
  var data = {
    'รหัสนักเรียน': code,
    'คำนำหน้า': get('คำนำหน้า'),
    'ชื่อ': first, 'นามสกุล': last,
    'เพศ': get('เพศ') || 'ไม่ระบุ',
    'ระดับชั้น': grade, 'ห้อง': room, 'เลขที่': get('เลขที่'),
    'สถานะ': get('สถานะ') || 'ปกติ',
    'ยินยอมเผยแพร่': yesNo_(get('ยินยอมเผยแพร่'), existing ? existing['ยินยอมเผยแพร่'] : 'ไม่'),
    'ชื่อผู้ปกครอง': get('ชื่อผู้ปกครอง'),
    'โทรผู้ปกครอง': get('โทรผู้ปกครอง'),
    'LINE ผู้ปกครอง': get('LINE ผู้ปกครอง')
  };

  if (existing) {
    return { action: 'update', data: data, row: existing._row,
             display: code + ' ' + first + ' ' + last,
             message: 'มีอยู่แล้ว จะอัปเดตเป็น ม.' + grade + '/' + room };
  }
  data['ชั้นแรกเข้า'] = grade <= 3 ? 1 : 4;
  data['ปีแรกเข้า'] = currentYear();
  data['สร้างเมื่อ'] = nowStr();
  return { action: 'create', data: data, display: code + ' ' + first + ' ' + last,
           message: 'เพิ่มใหม่ ม.' + grade + '/' + room };
}

/* ---- หลักเกณฑ์ ---- */
function parseRuleRow_(typeId, get, ctx) {
  var t = IMPORT_TYPES[typeId];
  var name = get('ชื่อเกณฑ์');
  if (!name) return { action: 'error', message: 'ไม่มีชื่อเกณฑ์', display: get('รหัสเดิม') };

  var points = Number(String(get('คะแนน')).replace(/[^0-9.-]/g, ''));
  if (!(points > 0)) {
    return { action: 'error', message: 'คะแนนต้องเป็นจำนวนเต็มบวก (พบ "' + get('คะแนน') + '")', display: name };
  }

  var oldCode = get('รหัสเดิม');
  var existing = (oldCode && ctx.ruleByKey[t.kind + '|' + oldCode] && !ctx.ambiguous[t.kind + '|' + oldCode])
    ? ctx.ruleByKey[t.kind + '|' + oldCode]
    : ctx.ruleByKey[t.kind + '|' + name];

  var severity = '';
  if (t.kind === KIND.DEMERIT) {
    severity = Number(get('ระดับความรุนแรง')) || severityFromPoints(points);
    if (severity < 1 || severity > 4) severity = severityFromPoints(points);
  }

  var data = {
    'รหัสเดิม': oldCode,
    'หมวด': get('หมวด') || (t.kind === KIND.MERIT ? 'ทั่วไป' : 'ความประพฤติทั่วไป'),
    'ประเภท': t.kind,
    'ชื่อเกณฑ์': name,
    'คะแนน': points,
    'ระดับความรุนแรง': severity,
    'คุณลักษณะอันพึงประสงค์': get('คุณลักษณะอันพึงประสงค์'),
    'ต้องมีหลักฐาน': yesNo_(get('ต้องมีหลักฐาน'), t.kind === KIND.DEMERIT && severity >= 3 ? 'ใช่' : 'ไม่'),
    'เพดานครั้ง/ภาคเรียน': get('เพดานครั้ง/ภาคเรียน'),
    'อ้างอิงระเบียบ': get('อ้างอิงระเบียบ'),
    'ใช้งาน': yesNo_(get('ใช้งาน'), 'ใช่')
  };

  if (existing) {
    var changed = Number(existing['คะแนน']) !== points;
    return { action: 'update', data: data, row: existing._row, display: name,
             message: changed ? 'อัปเดตคะแนนจาก ' + existing['คะแนน'] + ' เป็น ' + points
                              : 'อัปเดตรายละเอียด (คะแนนเท่าเดิม ' + points + ')' };
  }
  return { action: 'create', data: data, display: name,
           message: 'เพิ่มใหม่ ' + (t.kind === KIND.MERIT ? '+' : '−') + points + ' คะแนน' };
}

/* ---- บันทึกพฤติกรรม ---- */
function parseRecordRow_(typeId, get, ctx, user) {
  var t = IMPORT_TYPES[typeId];

  var code = get('รหัสนักเรียน');
  var student = ctx.studentsByCode[code];
  if (!student) {
    return { action: 'error', display: code,
             message: 'ไม่พบนักเรียนรหัส "' + code + '" ในระบบ (นำเข้าข้อมูลนักเรียนก่อน)' };
  }

  var ruleKey = get('เกณฑ์');
  if (!ruleKey) return { action: 'error', message: 'ไม่ได้ระบุเกณฑ์', display: code };

  var lookup = t.kind + '|' + ruleKey;
  if (ctx.ambiguous[lookup]) {
    return { action: 'error', display: code,
             message: 'รหัส "' + ruleKey + '" ตรงกับเกณฑ์มากกว่าหนึ่งข้อ กรุณาใช้รหัสเกณฑ์ของระบบ (เช่น ผ-46) หรือชื่อเกณฑ์เต็ม' };
  }
  var rule = ctx.ruleByKey[lookup];
  if (!rule) {
    return { action: 'error', display: code,
             message: 'ไม่พบเกณฑ์ "' + ruleKey + '" ใน' + t.name.replace('บันทึก', 'เกณฑ์') };
  }

  var when = parseFlexibleDate(get('วันที่'));
  if (!when) {
    return { action: 'error', display: code,
             message: 'อ่านวันที่ "' + get('วันที่') + '" ไม่ได้ (ใช้รูปแบบ 2026-06-10 หรือ 10/06/2569)' };
  }

  var dedupe = student['รหัส'] + '|' + rule['รหัส'] + '|' + when.substring(0, 10);
  if (ctx.recordKeys[dedupe]) {
    return { action: 'skip', display: studentFullName(student),
             message: 'มีบันทึกเกณฑ์นี้ของนักเรียนคนนี้ในวันเดียวกันอยู่แล้ว' };
  }
  ctx.recordKeys[dedupe] = true;

  var year = academicYearOf(when);
  var status = get('สถานะ') === STATUS.SUBMITTED ? STATUS.SUBMITTED : STATUS.APPROVED;
  var reporter = get('ผู้บันทึก') || user.name;

  return {
    action: 'create',
    display: studentFullName(student) + ' · ' + rule['ชื่อเกณฑ์'],
    message: thaiDate(when) + ' · ' + (t.kind === KIND.MERIT ? '+' : '−') + rule['คะแนน'] +
             ' คะแนน · ปีการศึกษา ' + year,
    data: {
      'รหัสนักเรียน(ระบบ)': student['รหัส'],
      'รหัสนักเรียน': String(student['รหัสนักเรียน']),
      'ชื่อนักเรียน': studentFullName(student),
      'ห้อง': classLabel(student['ระดับชั้น'], student['ห้อง']),
      'ปีการศึกษา': year,
      'ภาคเรียน': termOf(when),
      'รหัสเกณฑ์(ระบบ)': rule['รหัส'],
      'รหัสเกณฑ์': rule['รหัสเกณฑ์'],
      'ชื่อเกณฑ์': rule['ชื่อเกณฑ์'],
      'ประเภท': t.kind,
      'คะแนน': Number(rule['คะแนน']),
      'วันเวลาที่เกิดเหตุ': when,
      'สถานที่': get('สถานที่'),
      'รายละเอียด': get('รายละเอียด') || rule['ชื่อเกณฑ์'],
      'ลิงก์หลักฐาน': '',
      'ผู้บันทึก(ระบบ)': user.userId,
      'ผู้บันทึก': reporter,
      'บันทึกเมื่อ': nowStr(),
      'สถานะ': status,
      'ผู้พิจารณา': status === STATUS.APPROVED ? '(นำเข้าข้อมูล)' : '',
      'พิจารณาเมื่อ': status === STATUS.APPROVED ? nowStr() : '',
      'หมายเหตุการพิจารณา': status === STATUS.APPROVED ? 'นำเข้าข้อมูลย้อนหลัง' : ''
    }
  };
}

/* ------------------------------------------------------------------ */
/* บันทึกลงชีต                                                          */
/* ------------------------------------------------------------------ */

function commitStudents_(analysis, user) {
  var created = 0, updated = 0;
  var toCreate = [];

  analysis.rows.forEach(function (r) {
    if (r.action === 'update') { dbUpdateRow(SHEETS.STUDENTS, r.row, r.data); updated++; }
    else { toCreate.push(r.data); created++; }
  });
  dbInsertMany(SHEETS.STUDENTS, toCreate);

  if (created) {
    // นักเรียนใหม่ต้องมียอดคะแนนตั้งต้นของปีการศึกษาปัจจุบัน
    var year = currentYear();
    dbClearCache(SHEETS.STUDENTS);
    var pairs = [];
    dbReadAll(SHEETS.STUDENTS).forEach(function (s) {
      if (!dbFind(SHEETS.BALANCES, function (b) {
        return b['รหัสนักเรียน(ระบบ)'] === s['รหัส'] && Number(b['ปีการศึกษา']) === year;
      })) pairs.push({ studentId: s['รหัส'], year: year });
    });
    if (pairs.length) recomputeLedgerFor_(pairs);
  }
  return { created: created, updated: updated };
}

function commitRules_(analysis, user) {
  var created = 0, updated = 0;
  var toCreate = [];
  var prefix = IMPORT_TYPES[analysis.typeId].kind === KIND.MERIT ? 'ด-' : 'ผ-';

  // หาเลขรหัสเกณฑ์ถัดไปที่ยังไม่ถูกใช้
  var maxSeq = 0;
  dbReadAll(SHEETS.RULES).forEach(function (r) {
    var m = String(r['รหัสเกณฑ์']).match(new RegExp('^' + prefix + '(\\d+)$'));
    if (m) maxSeq = Math.max(maxSeq, Number(m[1]));
  });

  analysis.rows.forEach(function (r) {
    if (r.action === 'update') { dbUpdateRow(SHEETS.RULES, r.row, r.data); updated++; }
    else {
      r.data['รหัสเกณฑ์'] = prefix + pad2_(++maxSeq);
      toCreate.push(r.data);
      created++;
    }
  });
  dbInsertMany(SHEETS.RULES, toCreate);
  return { created: created, updated: updated };
}

function commitRecords_(analysis, user) {
  var year = currentYear();
  var seq = {};
  dbReadAll(SHEETS.RECORDS).forEach(function (r) {
    var m = String(r['เลขที่บันทึก']).match(/^BR-(\d+)-(\d+)$/);
    if (m) seq[m[1]] = Math.max(seq[m[1]] || 0, Number(m[2]));
  });

  var pairs = {}, toCreate = [];
  analysis.rows.forEach(function (r) {
    var y = r.data['ปีการศึกษา'];
    seq[y] = (seq[y] || 0) + 1;
    r.data['เลขที่บันทึก'] = 'BR-' + y + '-' + ('000000' + seq[y]).slice(-6);
    toCreate.push(r.data);
    if (r.data['สถานะ'] === STATUS.APPROVED) {
      pairs[r.data['รหัสนักเรียน(ระบบ)'] + '|' + y] = true;
    }
  });

  dbInsertMany(SHEETS.RECORDS, toCreate);
  dbClearCache(SHEETS.RECORDS);

  // คำนวณคะแนนของนักเรียนที่เกี่ยวข้องใหม่ตามลำดับเวลาจริง
  var list = Object.keys(pairs).map(function (k) {
    var p = k.split('|');
    return { studentId: isNaN(Number(p[0])) ? p[0] : Number(p[0]), year: Number(p[1]) };
  });
  if (list.length) recomputeLedgerFor_(list);

  return { created: toCreate.length, updated: 0, recomputed: list.length };
}

function importSampleRow_(typeId) {
  var samples = {
    students: ['30001', 'เด็กชาย', 'กิตติ', 'ตั้งใจดี', 'ชาย', '1', '1', '1', 'ใช่', 'นายสมศักดิ์ ตั้งใจดี', '0812345678', '', 'ปกติ'],
    merit_rules: ['1', 'เก็บของมีค่าราคาต่ำกว่า 100 บาท', '5', 'ความซื่อสัตย์สุจริต', 'ซื่อสัตย์สุจริต', 'ไม่', '', 'ใช่'],
    demerit_rules: ['1', 'มาสาย', '5', 'การมาเรียนและเวลาเรียน', '1', 'ไม่', 'ระเบียบโรงเรียนฯ', 'ใช่'],
    merit_records: ['30001', 'ด-01', '10/06/2569', 'เก็บกระเป๋าเงินได้ส่งคืนเจ้าของ', 'หน้าห้องปกครอง', 'นายสมชาย ใจดี', 'อนุมัติแล้ว'],
    demerit_records: ['30001', 'ผ-01', '10/06/2569', 'มาโรงเรียนสาย 20 นาที', 'ประตูหน้าโรงเรียน', 'นายสมชาย ใจดี', 'อนุมัติแล้ว']
  };
  return samples[typeId] || [];
}
