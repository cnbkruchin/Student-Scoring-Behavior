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
