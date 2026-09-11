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
