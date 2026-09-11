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
