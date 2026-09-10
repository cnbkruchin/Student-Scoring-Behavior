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

/** ตัวช่วยซ่อมข้อมูล: คำนวณคะแนนคงเหลือใหม่ทั้งหมดจากบันทึกที่อนุมัติแล้ว */
function rebuildAllBalances() {
  var year = currentYear();
  var initial = getSettingNumber('คะแนนตั้งต้น', 100);
  var maxScore = getSettingNumber('เพดานคะแนนความประพฤติ', 100);
  var minScore = getSettingNumber('คะแนนความประพฤติต่ำสุด', 0);

  var state = {};
  dbReadAll(SHEETS.STUDENTS).forEach(function (s) {
    state[s['รหัส']] = {
      conduct: initial, merit: 0, demerit: 0, meritCount: 0, demeritCount: 0,
      lastMerit: '', lastDemerit: ''
    };
  });

  var records = dbReadAll(SHEETS.RECORDS)
    .filter(function (r) { return r['สถานะ'] === STATUS.APPROVED && Number(r['ปีการศึกษา']) === year; })
    .sort(function (a, b) { return new Date(a['วันเวลาที่เกิดเหตุ']) - new Date(b['วันเวลาที่เกิดเหตุ']); });

  records.forEach(function (r) {
    var st = state[r['รหัสนักเรียน(ระบบ)']];
    if (!st) return;
    var p = Number(r['คะแนน']);
    if (r['ประเภท'] === KIND.MERIT) {
      st.merit += p;
      st.conduct = Math.min(maxScore, st.conduct + p);
      st.meritCount++;
      st.lastMerit = r['วันเวลาที่เกิดเหตุ'];
    } else {
      st.conduct = Math.max(minScore, st.conduct - p);
      st.demerit += p;
      st.demeritCount++;
      st.lastDemerit = r['วันเวลาที่เกิดเหตุ'];
    }
  });

  var sh = getSheet_(SHEETS.BALANCES);
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
  dbClearCache(SHEETS.BALANCES);

  var rows = Object.keys(state).map(function (id) {
    var st = state[id];
    return {
      'รหัสนักเรียน(ระบบ)': Number(id), 'ปีการศึกษา': year,
      'คะแนนความประพฤติ': st.conduct, 'คะแนนความดีสะสม': st.merit, 'คะแนนที่ถูกหัก': st.demerit,
      'ครั้งที่ทำความดี': st.meritCount, 'ครั้งที่ทำผิด': st.demeritCount,
      'ความดีล่าสุด': st.lastMerit, 'ความผิดล่าสุด': st.lastDemerit,
      'ระดับความเสี่ยง': riskLevelOf_(st.conduct).level, 'ปรับปรุงเมื่อ': nowStr()
    };
  });
  dbInsertMany(SHEETS.BALANCES, rows);
  return rows.length;
}
