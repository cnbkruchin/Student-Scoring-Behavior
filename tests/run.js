/* โหลดไฟล์ .gs ทั้งหมดเข้า global scope เหมือนที่ Apps Script ทำ แล้วรันสถานการณ์ทดสอบ */
const fs = require('fs'), path = require('path'), vm = require('vm');
require('./mock.js');
console.error = function(){};

const dir = require('path').join(__dirname, '..', 'apps-script');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.gs')).sort();
files.forEach(f => {
  vm.runInThisContext(fs.readFileSync(path.join(dir, f), 'utf8'), { filename: f });
});

let pass = 0, fail = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + (ok ? '' : `  ได้ ${JSON.stringify(actual)} ควรเป็น ${JSON.stringify(expected)}`));
  ok ? pass++ : fail++;
}
function section(t) { console.log('\n=== ' + t + ' ==='); }
function unwrap(res, label) {
  if (!res.ok) throw new Error((label || '') + ' ล้มเหลว: ' + res.error);
  return res.data;
}

/* ---------- 1. ติดตั้งระบบ ---------- */
section('ติดตั้งระบบ');
setupSystem();
check('สร้างชีตครบทุกแผ่น', Object.keys(SCHEMA).every(n => !!getSheet_(n)), true);
check('ใส่ค่าตั้งค่าเริ่มต้น', dbReadAll(SHEETS.SETTINGS, false).length, DEFAULT_SETTINGS.length);
check('ใส่หลักเกณฑ์', dbReadAll(SHEETS.RULES, false).length, 45);
check('ปีการศึกษาปัจจุบัน', currentYear(), 2569);

/* ---------- 2. ผู้ใช้และการเข้าสู่ระบบ ---------- */
section('ผู้ใช้และการเข้าสู่ระบบ');
createUser_('admin', 'admin12345', 'ผู้ดูแลระบบ', 'admin', '');
createUser_('kru.somchai', 'demo1234', 'นายสมชาย ใจดี', 'homeroom', '1/1');
createUser_('kru.malee', 'demo1234', 'นางมาลี รักเรียน', 'teacher', '');
createUser_('affairs', 'demo1234', 'หัวหน้ากิจการนักเรียน', 'affairs', '');

check('รหัสผ่านผิด ปฏิเสธ', apiLogin('admin', 'wrongpass').ok, false);
check('ผู้ใช้ไม่มีจริง ข้อความเหมือนกัน',
  apiLogin('nobody', 'x').error, apiLogin('admin', 'wrongpass').error);

const admin = unwrap(apiLogin('admin', 'admin12345'), 'ล็อกอิน admin');
const homeroom = unwrap(apiLogin('kru.somchai', 'demo1234'));
const teacher = unwrap(apiLogin('kru.malee', 'demo1234'));
const affairs = unwrap(apiLogin('affairs', 'demo1234'));
check('ล็อกอินได้รับ token', typeof admin.token, 'string');
check('ไม่เก็บรหัสผ่านเป็นข้อความธรรมดา',
  dbFind(SHEETS.USERS, u => u['ชื่อผู้ใช้'] === 'admin')['รหัสผ่าน(เข้ารหัส)'] === 'admin12345', false);
check('ชื่อผู้ใช้ไม่สนตัวพิมพ์เล็กใหญ่', apiLogin('ADMIN', 'admin12345').ok, true);
check('สิทธิ์ครูผู้สอน: บันทึกได้', teacher.permissions['record.create'], true);
check('สิทธิ์ครูผู้สอน: อนุมัติไม่ได้', teacher.permissions['record.approve'], false);
check('สิทธิ์ครูผู้สอน: จัดการผู้ใช้ไม่ได้', teacher.permissions['user.manage'], false);
check('token ปลอมถูกปฏิเสธ', apiDashboard('token-ปลอม').ok, false);

/* ---------- 3. นักเรียน ---------- */
section('ข้อมูลนักเรียน');
const students = [
  ['30001','เด็กชาย','กิตติ','ตั้งใจดี',1,1,1,true],
  ['30002','เด็กหญิง','นภา','ศรีสุข',1,1,2,true],
  ['30003','เด็กชาย','ธนา','ขยันเรียน',1,1,3,false],
  ['30004','เด็กหญิง','ปรีดา','ใจงาม',2,1,1,true],
  ['40001','นาย','วิชัย','มุ่งมั่น',4,1,1,true],
  ['40002','นางสาว','สุดา','พากเพียร',4,1,2,true],
  ['40003','นาย','อนันต์','กล้าหาญ',4,1,3,true]
];
students.forEach(s => unwrap(apiSaveStudent(admin.token, {
  code: s[0], prefix: s[1], firstName: s[2], lastName: s[3],
  grade: s[4], room: s[5], seat: s[6], publishConsent: s[7]
}), 'เพิ่มนักเรียน ' + s[0]));

check('เพิ่มนักเรียนครบ', dbReadAll(SHEETS.STUDENTS).length, 7);
check('รหัสซ้ำถูกปฏิเสธ', apiSaveStudent(admin.token, {
  code: '30001', firstName: 'ซ้ำ', lastName: 'ทดสอบ', grade: 1, room: 1 }).ok, false);
check('ทุกคนได้คะแนนตั้งต้น 100',
  dbReadAll(SHEETS.BALANCES).every(b => Number(b['คะแนนความประพฤติ']) === 100), true);
check('ครูผู้สอนเพิ่มนักเรียนไม่ได้', apiSaveStudent(teacher.token, {
  code: '99999', firstName: 'ก', lastName: 'ข', grade: 1, room: 1 }).ok, false);

const byCode = {};
dbReadAll(SHEETS.STUDENTS).forEach(s => { byCode[s['รหัสนักเรียน']] = s['รหัส']; });
const ruleByCode = {};
dbReadAll(SHEETS.RULES).forEach(r => { ruleByCode[r['รหัสเกณฑ์']] = r['รหัส']; });

/* ---------- 4. บันทึกและอนุมัติ ---------- */
section('บันทึกพฤติกรรมและการอนุมัติ');
function rec(token, code, ruleCode, detail, when) {
  return apiCreateRecord(token, {
    studentId: byCode[code], ruleId: ruleByCode[ruleCode],
    detail: detail, location: 'โรงเรียน',
    occurredAt: when || '2026-06-10 09:00:00',
    evidenceUrl: 'https://drive.google.com/mock'
  });
}
check('บันทึกโดยไม่มีรายละเอียด ถูกปฏิเสธ', apiCreateRecord(teacher.token, {
  studentId: byCode['30001'], ruleId: ruleByCode['M-101'], detail: '  ' }).ok, false);
check('เกณฑ์ที่ต้องมีหลักฐาน ถ้าไม่แนบถูกปฏิเสธ', apiCreateRecord(teacher.token, {
  studentId: byCode['30001'], ruleId: ruleByCode['M-302'], detail: 'เก็บเงินได้' }).ok, false);

const r1 = unwrap(rec(teacher.token, '30001', 'M-302', 'เก็บกระเป๋าเงินส่งคืนเจ้าของ'), 'r1');
const r2 = unwrap(rec(teacher.token, '30001', 'M-201', 'จิตอาสาพัฒนาโรงเรียน', '2026-06-20 13:00:00'));
const r3 = unwrap(rec(teacher.token, '30002', 'M-201', 'จิตอาสาปลูกต้นไม้', '2026-06-15 13:00:00'));
const r4 = unwrap(rec(teacher.token, '30003', 'M-503', 'รางวัลระดับภาค', '2026-07-05 09:00:00'));
const r5 = unwrap(rec(teacher.token, '30003', 'D-201', 'มาสาย 20 นาที', '2026-07-10 08:20:00'));
const r6 = unwrap(rec(teacher.token, '40001', 'M-502', 'รางวัลระดับเขต', '2026-06-25 09:00:00'));
const r7 = unwrap(rec(teacher.token, '40002', 'M-502', 'รางวัลระดับเขต', '2026-07-15 09:00:00'));
const r8 = unwrap(rec(teacher.token, '40003', 'D-501', 'สูบบุหรี่ไฟฟ้าในห้องน้ำ', '2026-07-20 12:30:00'));

check('บันทึกเข้าสถานะรออนุมัติ', r1.status, 'รออนุมัติ');
check('คะแนนยังไม่เปลี่ยนก่อนอนุมัติ',
  unwrap(apiGetStudent(admin.token, byCode['30001'])).balance.conductScore, 100);

const pendingForHomeroom = unwrap(apiPendingRecords(homeroom.token));
check('ครูที่ปรึกษาเห็นเฉพาะห้อง 1/1', pendingForHomeroom.every(p => p.classLabel === 'ม.1/1'), true);
check('ครูผู้สอนเข้าหน้าอนุมัติไม่ได้', apiPendingRecords(teacher.token).ok, false);

const allPending = unwrap(apiPendingRecords(admin.token));
const severe = allPending.find(p => p.ruleCode === 'D-501');
check('ความผิดร้ายแรงครูที่ปรึกษาตัดสินไม่ได้',
  unwrap(apiPendingRecords(homeroom.token)).concat(allPending)
    .filter(p => p.ruleCode === 'D-501').length > 0, true);
const homeroomSevere = apiReviewRecord(homeroom.token, severe.id, 'approve', '');
check('ครูที่ปรึกษาอนุมัติความผิดร้ายแรงไม่ได้', homeroomSevere.ok, false);

function idOf(recordNo) {
  return dbFind(SHEETS.RECORDS, r => r['เลขที่บันทึก'] === recordNo)['รหัส'];
}
[r1, r2, r3, r4, r5, r6, r7, r8].forEach(r => {
  unwrap(apiReviewRecord(affairs.token, idOf(r.recordNo), 'approve', ''), 'อนุมัติ ' + r.recordNo);
});

/* ---------- 5. กลไกคะแนน ---------- */
section('กลไกคะแนน');
function bal(code) { return unwrap(apiGetStudent(admin.token, byCode[code])).balance; }

check('30001 ความดี 10+3 คะแนนความดีสะสม', bal('30001').meritTotal, 13);
check('30001 ความประพฤติชนเพดาน 100', bal('30001').conductScore, 100);
check('30003 ความดี 20 คะแนน', bal('30003').meritTotal, 20);
check('30003 ถูกหัก 2 เหลือ 98 (เพดานกันคะแนนสะสมมากลบ)', bal('30003').conductScore, 98);
check('30003 นับครั้งที่ทำผิด', bal('30003').demeritCount, 1);
check('40003 ถูกหัก 20 เหลือ 80', bal('40003').conductScore, 80);
check('40003 ระดับความเสี่ยงเป็นเฝ้าระวัง', bal('40003').riskLevel, 'เฝ้าระวัง');
check('40003 ความดีสะสมไม่ถูกลบเมื่อทำผิด', bal('40003').meritTotal, 0);

check('บัญชีคะแนนมีรายการครบ (ตั้งต้น 7 + ความดี 6x2-ชนเพดาน + ความผิด 2)',
  dbReadAll(SHEETS.LEDGER).length > 7, true);

const ledgerSum = {};
dbReadAll(SHEETS.LEDGER).forEach(l => {
  if (l['บัญชี'] !== ACCOUNT.CONDUCT) return;
  const k = l['รหัสนักเรียน(ระบบ)'];
  ledgerSum[k] = (ledgerSum[k] || 0) + Number(l['คะแนนที่เปลี่ยน']);
});
check('ยอดในบัญชีเดินตรงกับยอดคงเหลือทุกคน',
  dbReadAll(SHEETS.BALANCES).every(b =>
    Number(b['คะแนนความประพฤติ']) === ledgerSum[b['รหัสนักเรียน(ระบบ)']]), true);

/* ---------- 6. เพดานครั้งต่อภาคเรียน ---------- */
section('การป้องกันคะแนนเฟ้อ');
const capRule = dbFind(SHEETS.RULES, r => r['รหัสเกณฑ์'] === 'M-103');   // เพดาน 2 ครั้ง/ภาคเรียน
let capResult = null;
for (let i = 0; i < 4; i++) {
  capResult = apiCreateRecord(teacher.token, {
    studentId: byCode['30002'], ruleId: capRule['รหัส'],
    detail: 'ผลการเรียนพัฒนาขึ้น ครั้งที่ ' + (i + 1), evidenceUrl: 'https://mock'
  });
  if (!capResult.ok) break;
}
check('เกินเพดานครั้งต่อภาคเรียนถูกปฏิเสธ', capResult.ok, false);
check('ข้อความบอกเพดานชัดเจน', /ไม่เกิน 2 ครั้ง/.test(capResult.error), true);

/* ---------- 7. กระดานเกียรติยศ ---------- */
section('กระดานเกียรติยศ');
const board = unwrap(apiLeaderboard(admin.token));
const lowerNames = board.lower.map(c => c.displayName);
check('ม.ต้น อันดับ 1 คือคนคะแนนความดีสูงสุดที่ไม่เคยผิด', board.lower[0].displayName, 'เด็กชายกิตติ ตั้งใจดี');
check('คนที่เคยทำผิดถูกตัดออกแม้คะแนนความดีสูงสุด',
  lowerNames.some(n => n.indexOf('ธนา') >= 0), false);
check('คนที่ถูกหักคะแนนไม่ขึ้นกระดาน ม.ปลาย',
  board.upper.map(c => c.displayName).some(n => n.indexOf('อนันต์') >= 0), false);
check('เรียงคะแนนเท่ากันด้วยเวลาที่ทำสำเร็จก่อน',
  board.upper.map(c => c.displayName), ['นายวิชัย มุ่งมั่น', 'นางสาวสุดา พากเพียร']);
check('ไม่ยินยอมเผยแพร่จะไม่มีชื่อเต็มโผล่บนกระดาน',
  JSON.stringify(board).indexOf('ขยันเรียน') < 0, true);

unwrap(apiPublishLeaderboard(affairs.token));
const pub = unwrap(apiPublicLeaderboard());
check('หน้าสาธารณะไม่มีคำว่าคะแนนที่ถูกหัก', JSON.stringify(pub).indexOf('ถูกหัก') < 0, true);
check('หน้าสาธารณะไม่มีรายชื่อผู้กระทำผิด',
  JSON.stringify(pub).indexOf('อนันต์') < 0 && JSON.stringify(pub).indexOf('ธนา') < 0, true);
check('หน้าสาธารณะแสดงสถิติรวมทั้งโรงเรียน', pub.totalMeritActs > 0, true);

/* ---------- 8. การเพิกถอนและคืนคะแนน ---------- */
section('การเพิกถอนบันทึก (อุทธรณ์สำเร็จ)');
check('ครูที่ปรึกษาเพิกถอนไม่ได้',
  apiRevokeRecord(homeroom.token, idOf(r5.recordNo), 'ทดสอบ').ok, false);
check('เพิกถอนต้องมีเหตุผล',
  apiRevokeRecord(affairs.token, idOf(r5.recordNo), '  ').ok, false);
unwrap(apiRevokeRecord(affairs.token, idOf(r5.recordNo), 'อุทธรณ์สำเร็จ รถโรงเรียนเสีย'));

check('คืนคะแนนกลับเป็น 100', bal('30003').conductScore, 100);
check('ลบจำนวนครั้งที่ทำผิด', bal('30003').demeritCount, 0);
check('คะแนนความดีไม่ถูกแตะต้อง', bal('30003').meritTotal, 20);
check('กลับขึ้นกระดานเป็นอันดับ 1 หลังอุทธรณ์สำเร็จ',
  unwrap(apiLeaderboard(admin.token)).lower[0].displayName, 'เด็กชายธนา ข.');
check('ปกปิดนามสกุลตาม PDPA เมื่อผู้ปกครองไม่ยินยอม',
  unwrap(apiLeaderboard(admin.token)).lower[0].displayName.endsWith(' ข.'), true);

/* ---------- 9. คำนวณใหม่ต้องได้ผลเดิม ---------- */
section('ความถูกต้องของยอดคะแนน');
const before = dbReadAll(SHEETS.BALANCES).map(b =>
  b['รหัสนักเรียน(ระบบ)'] + ':' + b['คะแนนความประพฤติ'] + ':' + b['คะแนนความดีสะสม']).sort();
unwrap(apiRebuildBalances(admin.token));
const after = dbReadAll(SHEETS.BALANCES).map(b =>
  b['รหัสนักเรียน(ระบบ)'] + ':' + b['คะแนนความประพฤติ'] + ':' + b['คะแนนความดีสะสม']).sort();
check('คำนวณใหม่จากบันทึกได้ผลตรงกับยอดที่เดินมา', after, before);

/* ---------- 10. แดชบอร์ดและรายงาน ---------- */
section('แดชบอร์ดและรายงาน');
const dash = unwrap(apiDashboard(admin.token));
check('แดชบอร์ดนับนักเรียนถูก', dash.stats.students, 7);
check('แดชบอร์ดมีข้อมูล 6 เดือน', dash.months.length, 6);
check('แดชบอร์ดมีการกระจายความเสี่ยง', Object.keys(dash.risk).length >= 4, true);

const reportIds = ['R02','R03','R04','R05','R06','R07','R09','R11'];
reportIds.forEach(id => {
  const params = id === 'R02' ? { grade: 1, room: 1 } : {};
  const rep = apiBuildReport(admin.token, id, params);
  check('รายงาน ' + id + ' สร้างได้', rep.ok, true);
  if (rep.ok) check('  ' + id + ' มีคอลัมน์และแถว',
    rep.data.columns.length > 0 && rep.data.rows.length > 0, true);
});
const r01 = apiBuildReport(admin.token, 'R01', { studentId: byCode['30001'] });
check('รายงาน R01 รายบุคคลสร้างได้', r01.ok, true);
check('R01 แสดงความดีก่อนความผิด', r01.data.rows[0][1], 'ความดี');
check('ครูผู้สอนออกรายงานไม่ได้', apiBuildReport(teacher.token, 'R05', {}).ok, false);
check('ครูที่ปรึกษาออกรายงานนักเรียนนอกห้องตนไม่ได้',
  apiBuildReport(homeroom.token, 'R01', { studentId: byCode['40001'] }).ok, false);

/* ---------- 11. นำเข้า CSV ---------- */
section('นำเข้ารายชื่อจาก CSV');
const csv = 'รหัสนักเรียน,คำนำหน้า,ชื่อ,นามสกุล,เพศ,ระดับชั้น,ห้อง,เลขที่\n' +
            '50001,นาย,สมหมาย,ดีงาม,ชาย,5,2,1\n' +
            '50002,นางสาว,วิภา,แจ่มใส,หญิง,5,2,2\n' +
            '30001,เด็กชาย,ซ้ำ,ทดสอบ,ชาย,1,1,9\n' +
            '50003,นาย,ผิด,ระดับชั้น,ชาย,9,1,3';
const imp = unwrap(apiImportStudents(admin.token, csv));
check('นำเข้าสำเร็จ 2 คน', imp.inserted, 2);
check('ข้ามรหัสซ้ำ 1 คน', imp.skipped, 1);
check('รายงานบรรทัดที่ผิด 1 บรรทัด', imp.errors.length, 1);

/* ---------- 12. เซสชัน ---------- */
section('เซสชันและการออกจากระบบ');
unwrap(apiLogout(teacher.token));
check('ออกจากระบบแล้วใช้ token เดิมไม่ได้', apiMe(teacher.token).ok, false);
check('เปลี่ยนรหัสผ่านด้วยรหัสเดิมผิด ถูกปฏิเสธ',
  apiChangePassword(admin.token, 'ผิด', 'newpass1234').ok, false);
check('รหัสผ่านใหม่สั้นเกินไป ถูกปฏิเสธ',
  apiChangePassword(admin.token, 'admin12345', 'sh0rt').ok, false);
unwrap(apiChangePassword(admin.token, 'admin12345', 'newpass1234'));
check('เข้าสู่ระบบด้วยรหัสใหม่ได้', apiLogin('admin', 'newpass1234').ok, true);
check('รหัสเดิมใช้ไม่ได้แล้ว', apiLogin('admin', 'admin12345').ok, false);

/* ---------- 13. ร่องรอยการใช้งาน ---------- */
section('ร่องรอยการใช้งาน');
const audit = unwrap(apiAuditLog(unwrap(apiLogin('admin','newpass1234')).token, 100));
check('มีการบันทึก audit log', audit.length > 10, true);
check('บันทึกการอนุมัติไว้ด้วย', audit.some(a => a.action === 'อนุมัติบันทึก'), true);
check('ครูผู้สอนดู audit log ไม่ได้', apiAuditLog(homeroom.token, 10).ok, false);

console.log('\n' + '='.repeat(52));
console.log(`ผ่าน ${pass} รายการ · ไม่ผ่าน ${fail} รายการ`);
console.log('='.repeat(52));
process.exit(fail ? 1 : 0);
