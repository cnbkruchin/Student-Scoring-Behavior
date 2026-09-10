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
