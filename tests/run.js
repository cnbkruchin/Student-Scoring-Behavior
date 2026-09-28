/* โหลดไฟล์ .gs ทั้งหมดเข้า global scope เหมือนที่ Apps Script ทำ แล้วรันสถานการณ์ทดสอบ */
const fs = require('fs'), path = require('path'), vm = require('vm');
require('./mock.js');
console.error = function () {};

// รันด้วย --bundle เพื่อทดสอบไฟล์รวมใน dist/ แทนไฟล์ต้นฉบับ
// ใช้ยืนยันว่าไฟล์ที่เอาไปติดตั้งจริงทำงานเหมือนต้นฉบับทุกประการ
const useBundle = process.argv.indexOf('--bundle') >= 0;
if (useBundle) {
  const bundle = path.join(__dirname, '..', 'dist', 'Code.gs');
  if (!fs.existsSync(bundle)) throw new Error('ยังไม่มี dist/Code.gs กรุณารัน node build/bundle.js ก่อน');
  vm.runInThisContext(fs.readFileSync(bundle, 'utf8'), { filename: 'dist/Code.gs' });
  console.log('(ทดสอบไฟล์รวม dist/Code.gs)');
} else {
  const dir = path.join(__dirname, '..', 'apps-script');
  fs.readdirSync(dir).filter(f => f.endsWith('.gs')).sort()
    .forEach(f => vm.runInThisContext(fs.readFileSync(path.join(dir, f), 'utf8'), { filename: f }));
}

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
check('ใส่เกณฑ์ทำความดีของโรงเรียน 30 ข้อ',
  dbFilter(SHEETS.RULES, r => r['ประเภท'] === KIND.MERIT).length, 30);
check('ใส่เกณฑ์คะแนนไม่พึงประสงค์ของโรงเรียน 57 ข้อ',
  dbFilter(SHEETS.RULES, r => r['ประเภท'] === KIND.DEMERIT).length, 57);
check('รหัสเกณฑ์ของระบบไม่ซ้ำกันเลย',
  new Set(dbReadAll(SHEETS.RULES).map(r => r['รหัสเกณฑ์'])).size, 87);
check('เก็บรหัสเดิมของโรงเรียนไว้ครบ',
  dbFilter(SHEETS.RULES, r => r['ประเภท'] === KIND.DEMERIT && String(r['รหัสเดิม']) !== '').length, 57);
check('รหัสเดิมที่ซ้ำกันยังอยู่ครบ (54 มีสองข้อ)',
  dbFilter(SHEETS.RULES, r => String(r['รหัสเดิม']) === '54').length, 2);
check('ระดับความรุนแรงคำนวณจากคะแนนถูกต้อง',
  [severityFromPoints(3), severityFromPoints(10), severityFromPoints(30), severityFromPoints(50)], [1, 2, 3, 4]);
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
check('สิทธิ์ครูผู้สอน: จัดการหลักเกณฑ์ไม่ได้', teacher.permissions['rule.manage'], false);
check('token ปลอมถูกปฏิเสธ', apiDashboard('token-ปลอม').ok, false);

/* ---------- 3. นำเข้าข้อมูลนักเรียน ---------- */
section('นำเข้าข้อมูลนักเรียน');
const studentCsv =
  'รหัสนักเรียน,คำนำหน้า,ชื่อ,นามสกุล,เพศ,ระดับชั้น,ห้อง,เลขที่,ยินยอมเผยแพร่\n' +
  '30001,เด็กชาย,กิตติ,ตั้งใจดี,ชาย,1,1,1,ใช่\n' +
  '30002,เด็กหญิง,นภา,ศรีสุข,หญิง,1,1,2,ใช่\n' +
  '30003,เด็กชาย,ธนา,ขยันเรียน,ชาย,1,1,3,ไม่\n' +
  '30004,เด็กหญิง,ปรีดา,ใจงาม,หญิง,2,1,1,ใช่\n' +
  '40001,นาย,วิชัย,มุ่งมั่น,ชาย,4,1,1,ใช่\n' +
  '40002,นางสาว,สุดา,พากเพียร,หญิง,4,1,2,ใช่\n' +
  '40003,นาย,อนันต์,กล้าหาญ,ชาย,4,1,3,ใช่';

check('ครูผู้สอนนำเข้าข้อมูลนักเรียนไม่ได้', apiImportPreview(teacher.token, 'students', studentCsv).ok, false);
const stuPreview = unwrap(apiImportPreview(admin.token, 'students', studentCsv), 'ตรวจสอบนักเรียน');
check('ตรวจสอบแล้วพบว่าเพิ่มใหม่ทั้ง 7 คน', stuPreview.summary.create, 7);
check('ยังไม่เขียนข้อมูลลงชีตตอนตรวจสอบ', dbReadAll(SHEETS.STUDENTS).length, 0);

const stuResult = unwrap(apiImportCommit(admin.token, 'students', studentCsv), 'นำเข้านักเรียน');
check('นำเข้านักเรียนสำเร็จ 7 คน', stuResult.created, 7);
check('ทุกคนได้คะแนนตั้งต้น 100',
  dbReadAll(SHEETS.BALANCES).every(b => Number(b['คะแนนความประพฤติ']) === 100), true);

// นำเข้าซ้ำโดยเปลี่ยนห้อง ต้องเป็นการอัปเดต ไม่ใช่สร้างซ้ำ
const moveCsv = 'รหัสนักเรียน,ชื่อ,นามสกุล,ระดับชั้น,ห้อง,เลขที่\n30004,ปรีดา,ใจงาม,2,3,5';
const movePreview = unwrap(apiImportPreview(admin.token, 'students', moveCsv));
check('นำเข้าซ้ำตรวจพบว่าเป็นการอัปเดต', movePreview.summary.update, 1);
unwrap(apiImportCommit(admin.token, 'students', moveCsv));
check('ไม่สร้างนักเรียนซ้ำ', dbReadAll(SHEETS.STUDENTS).length, 7);
check('อัปเดตห้องเรียนให้แล้ว',
  dbFind(SHEETS.STUDENTS, s => String(s['รหัสนักเรียน']) === '30004')['ห้อง'], 3);

const badCsv = 'รหัสนักเรียน,ชื่อ,นามสกุล,ระดับชั้น,ห้อง\n' +
  '50001,สมหมาย,ดีงาม,5,1\n,ไม่มีรหัส,ทดสอบ,5,1\n50003,ผิด,ระดับชั้น,9,1';
const badPreview = unwrap(apiImportPreview(admin.token, 'students', badCsv));
check('แถวที่ข้อมูลผิดถูกจับได้', badPreview.summary.error, 2);
check('แถวที่ถูกต้องยังนำเข้าได้', badPreview.summary.create, 1);
check('บอกสาเหตุที่ผิดชัดเจน',
  /ระดับชั้นต้องเป็นเลข 1 ถึง 6/.test(badPreview.preview.find(r => r.action === 'error' && r.display === '50003').message), true);
check('ไฟล์ที่ขาดคอลัมน์จำเป็นถูกปฏิเสธพร้อมบอกว่าขาดอะไร',
  /ขาดคอลัมน์ที่จำเป็น/.test(apiImportPreview(admin.token, 'students', 'ชื่อ,นามสกุล\nก,ข').error), true);

const sid = {};
dbReadAll(SHEETS.STUDENTS).forEach(s => { sid[String(s['รหัสนักเรียน'])] = s['รหัส']; });

/* ---------- 4. นำเข้าหลักเกณฑ์ ---------- */
section('นำเข้าและจัดการหลักเกณฑ์');
const ruleCsv = 'ลำดับ,สถานะการเข้าร่วมกิจกรรม,คะแนนลบ\n' +
  '60,ขับรถเร็วในบริเวณโรงเรียน,20\n' +
  '1,มาสาย,10';          // รหัสเดิม 1 มีอยู่แล้ว (5 คะแนน) ต้องเป็นการอัปเดต
const rulePreview = unwrap(apiImportPreview(admin.token, 'demerit_rules', ruleCsv), 'ตรวจเกณฑ์');
check('เกณฑ์ใหม่นับเป็นเพิ่มใหม่', rulePreview.summary.create, 1);
check('เกณฑ์ที่รหัสเดิมตรงกันนับเป็นอัปเดต', rulePreview.summary.update, 1);
check('บอกด้วยว่าคะแนนจะเปลี่ยนจากเท่าไรเป็นเท่าไร',
  /จาก 5 เป็น 10/.test(rulePreview.preview.find(r => r.action === 'update').message), true);

unwrap(apiImportCommit(admin.token, 'demerit_rules', ruleCsv));
check('เกณฑ์ความผิดเพิ่มเป็น 58 ข้อ',
  dbFilter(SHEETS.RULES, r => r['ประเภท'] === KIND.DEMERIT).length, 58);
check('คะแนน "มาสาย" อัปเดตเป็น 10',
  Number(dbFind(SHEETS.RULES, r => r['รหัสเกณฑ์'] === 'ผ-01')['คะแนน']), 10);
check('ระดับความรุนแรงปรับตามคะแนนใหม่ให้เอง',
  Number(dbFind(SHEETS.RULES, r => r['รหัสเกณฑ์'] === 'ผ-01')['ระดับความรุนแรง']), 2);
check('เกณฑ์ใหม่ได้รหัสระบบที่ไม่ซ้ำ',
  !!dbFind(SHEETS.RULES, r => r['ชื่อเกณฑ์'] === 'ขับรถเร็วในบริเวณโรงเรียน')['รหัสเกณฑ์'], true);

// เพิ่มเกณฑ์ความดีที่มีเพดานครั้ง เพื่อทดสอบการกันคะแนนเฟ้อ
const capRule = unwrap(apiSaveRule(admin.token, {
  kind: KIND.MERIT, name: 'ช่วยงานห้องสมุดประจำสัปดาห์', points: 5,
  category: 'จิตอาสาและบำเพ็ญประโยชน์', maxPerTerm: 2, oldCode: '31'
}), 'เพิ่มเกณฑ์');
check('ผู้ดูแลระบบเพิ่มเกณฑ์ได้', capRule.code, 'ด-31');
check('ครูผู้สอนเพิ่มเกณฑ์ไม่ได้',
  apiSaveRule(teacher.token, { kind: KIND.MERIT, name: 'ทดสอบ', points: 5 }).ok, false);
check('คะแนนติดลบถูกปฏิเสธ',
  apiSaveRule(admin.token, { kind: KIND.MERIT, name: 'ทดสอบ', points: -5 }).ok, false);
check('ลบเกณฑ์ที่ยังไม่มีใครใช้ได้จริง', unwrap(apiDeleteRule(admin.token, capRule.id)).deleted, true);

const capRule2 = unwrap(apiSaveRule(admin.token, {
  kind: KIND.MERIT, name: 'ช่วยงานห้องสมุดประจำสัปดาห์', points: 5,
  category: 'จิตอาสาและบำเพ็ญประโยชน์', maxPerTerm: 2
}));

const rid = {};
dbReadAll(SHEETS.RULES).forEach(r => { rid[r['รหัสเกณฑ์']] = r['รหัส']; });

/* ---------- 5. บันทึกและอนุมัติ ---------- */
section('บันทึกพฤติกรรมและการอนุมัติ');
function rec(token, code, ruleCode, detail, when) {
  return apiCreateRecord(token, {
    studentId: sid[code], ruleId: rid[ruleCode], detail: detail, location: 'โรงเรียน',
    occurredAt: when || '2026-06-10 09:00:00', evidenceUrl: 'https://drive.google.com/mock'
  });
}
check('บันทึกโดยไม่มีรายละเอียด ถูกปฏิเสธ', apiCreateRecord(teacher.token, {
  studentId: sid['30001'], ruleId: rid['ด-01'], detail: '  ' }).ok, false);
check('เกณฑ์ที่ต้องมีหลักฐาน ถ้าไม่แนบถูกปฏิเสธ', apiCreateRecord(teacher.token, {
  studentId: sid['30001'], ruleId: rid['ด-28'], detail: 'บริจาคโลหิต' }).ok, false);

const R = {};
[['30001', 'ด-06', 'เก็บกระเป๋าเงินได้ส่งคืนเจ้าของ', '2026-06-10 09:00:00'],
 ['30001', 'ด-25', 'จิตอาสาพัฒนาโรงเรียน', '2026-06-20 13:00:00'],
 ['30002', 'ด-25', 'จิตอาสาปลูกต้นไม้', '2026-06-15 13:00:00'],
 ['30003', 'ด-19', 'ได้รางวัลแข่งขันระดับเขตพื้นที่ฯ', '2026-07-05 09:00:00'],
 ['30003', 'ผ-01', 'มาโรงเรียนสาย 20 นาที', '2026-07-10 08:20:00'],
 ['40001', 'ด-12', 'ชนะเลิศการแข่งขันระดับโรงเรียน', '2026-06-25 09:00:00'],
 ['40002', 'ด-12', 'ชนะเลิศการแข่งขันระดับโรงเรียน', '2026-07-15 09:00:00'],
 ['40003', 'ด-25', 'จิตอาสาทำความสะอาดโรงอาหาร', '2026-07-01 13:00:00'],
 ['40003', 'ผ-19', 'สูบบุหรี่ไฟฟ้าในห้องน้ำ', '2026-07-20 12:30:00']
].forEach((x, i) => { R[i] = unwrap(rec(teacher.token, x[0], x[1], x[2], x[3]), 'บันทึก ' + x[1]); });

check('บันทึกเข้าสถานะรออนุมัติ', R[0].status, 'รออนุมัติ');
check('คะแนนยังไม่เปลี่ยนก่อนอนุมัติ',
  unwrap(apiGetStudent(admin.token, sid['30001'])).balance.conductScore, 100);
check('ครูที่ปรึกษาเห็นเฉพาะห้อง 1/1',
  unwrap(apiPendingRecords(homeroom.token)).every(p => p.classLabel === 'ม.1/1'), true);
check('ครูผู้สอนเข้าหน้าอนุมัติไม่ได้', apiPendingRecords(teacher.token).ok, false);

function idOf(recordNo) { return dbFind(SHEETS.RECORDS, r => r['เลขที่บันทึก'] === recordNo)['รหัส']; }
const severeId = idOf(R[8].recordNo);
check('ครูที่ปรึกษาอนุมัติความผิดร้ายแรง (สูบบุหรี่) ไม่ได้',
  apiReviewRecord(homeroom.token, severeId, 'approve', '').ok, false);

Object.keys(R).forEach(k => unwrap(apiReviewRecord(affairs.token, idOf(R[k].recordNo), 'approve', ''), 'อนุมัติ'));

/* ---------- 6. กลไกคะแนน ---------- */
section('กลไกคะแนน');
function bal(code) { return unwrap(apiGetStudent(admin.token, sid[code])).balance; }

check('30001 ความดี 10+10 = 20', bal('30001').meritTotal, 20);
check('30001 ความประพฤติชนเพดาน 100', bal('30001').conductScore, 100);
check('30003 ความดี 50 คะแนน', bal('30003').meritTotal, 50);
check('30003 ถูกหัก 10 เหลือ 90 (คะแนนสะสมมากก็กลบความผิดไม่ได้)', bal('30003').conductScore, 90);
check('40003 ถูกหัก 20 เหลือ 80', bal('40003').conductScore, 80);
check('40003 ระดับความเสี่ยงเป็นเฝ้าระวัง', bal('40003').riskLevel, 'เฝ้าระวัง');
check('40003 ความดีสะสมไม่ถูกลบเมื่อทำผิด', bal('40003').meritTotal, 10);

const ledgerSum = {};
dbReadAll(SHEETS.LEDGER).forEach(l => {
  if (l['บัญชี'] !== ACCOUNT.CONDUCT) return;
  const k = l['รหัสนักเรียน(ระบบ)'];
  ledgerSum[k] = (ledgerSum[k] || 0) + Number(l['คะแนนที่เปลี่ยน']);
});
check('ยอดในบัญชีเดินตรงกับยอดคงเหลือทุกคน',
  dbReadAll(SHEETS.BALANCES).every(b =>
    Number(b['คะแนนความประพฤติ']) === ledgerSum[b['รหัสนักเรียน(ระบบ)']]), true);

/* ---------- 7. เพดานครั้งต่อภาคเรียน ---------- */
section('การป้องกันคะแนนเฟ้อ');
let capResult = null;
for (let i = 0; i < 4; i++) {
  capResult = apiCreateRecord(teacher.token, {
    studentId: sid['30002'], ruleId: capRule2.id,
    detail: 'ช่วยงานห้องสมุด ครั้งที่ ' + (i + 1), occurredAt: '2026-07-0' + (i + 1) + ' 09:00:00'
  });
  if (!capResult.ok) break;
}
check('เกินเพดานครั้งต่อภาคเรียนถูกปฏิเสธ', capResult.ok, false);
check('ข้อความบอกเพดานชัดเจน', /ไม่เกิน 2 ครั้ง/.test(capResult.error), true);

/* ---------- 8. นำเข้าบันทึกย้อนหลัง ---------- */
section('นำเข้าบันทึกการทำความดีและการถูกตัดคะแนน');
const meritCsv =
  'รหัสนักเรียน,เกณฑ์,วันที่,รายละเอียด\n' +
  '30002,ด-05,15/06/2569,ช่วยจัดสถานที่งานกีฬาสี\n' +
  '30004,เข้าร่วมกิจกรรมของโรงเรียน,20/06/2569,เข้าร่วมกิจกรรมวันไหว้ครู\n' +
  '99999,ด-05,20/06/2569,นักเรียนไม่มีในระบบ\n' +
  '40001,ด-05,วันที่ผิดรูปแบบ,ทดสอบวันที่ผิด';

const meritPrev = unwrap(apiImportPreview(admin.token, 'merit_records', meritCsv), 'ตรวจบันทึกความดี');
check('อ่านวันที่แบบ พ.ศ. (15/06/2569) ได้', meritPrev.summary.create, 2);
check('จับได้ว่านักเรียนไม่มีในระบบ',
  /ไม่พบนักเรียนรหัส "99999"/.test(meritPrev.preview.find(r => r.display === '99999').message), true);
check('จับได้ว่าวันที่ผิดรูปแบบ', meritPrev.summary.error, 2);
check('อ้างอิงเกณฑ์ด้วยชื่อเต็มก็ได้',
  meritPrev.preview.filter(r => r.action === 'create').length, 2);

unwrap(apiImportCommit(admin.token, 'merit_records', meritCsv));
// ด-25 ที่อนุมัติแล้ว 10 + ด-05 ที่เพิ่งนำเข้า 10 = 20
// ส่วนรายการทดสอบเพดานครั้งยังเป็น "รออนุมัติ" อยู่ จึงยังไม่นับเข้าคะแนน
check('30002 ได้คะแนนจากบันทึกที่นำเข้า', bal('30002').meritTotal, 20);
check('บันทึกที่ยังรออนุมัติไม่มีผลต่อคะแนน', bal('30002').meritCount, 2);
check('บันทึกที่นำเข้าถูกบันทึกเป็นอนุมัติแล้ว',
  dbFilter(SHEETS.RECORDS, r => r['ผู้พิจารณา'] === '(นำเข้าข้อมูล)').length, 2);
check('นำเข้าไฟล์เดิมซ้ำจะข้ามทั้งหมด ไม่เพิ่มคะแนนซ้ำ',
  unwrap(apiImportPreview(admin.token, 'merit_records', meritCsv)).summary.skip, 2);

check('รหัสเดิมที่ซ้ำกันถูกปฏิเสธพร้อมบอกวิธีแก้',
  /ตรงกับเกณฑ์มากกว่าหนึ่งข้อ/.test(unwrap(apiImportPreview(admin.token, 'demerit_records',
    'รหัสนักเรียน,เกณฑ์,วันที่\n30001,54,10/07/2569')).preview[0].message), true);

/* ---------- 9. การคำนวณตามลำดับเวลา ---------- */
section('การคำนวณคะแนนตามลำดับเวลาจริง');
// 40003 ตอนนี้เหลือ 80 (ถูกหัก 20 เมื่อ 20 ก.ค.)
// นำเข้าความดี +30 ย้อนหลังไปวันที่ 1 มิ.ย. ซึ่งตอนนั้นคะแนนยังเต็ม 100 อยู่
// ผลที่ถูกต้องคือคะแนนต้องยังเป็น 80 เพราะความดีชนเพดานไปแล้ว ไม่ใช่ 100
check('ก่อนนำเข้าย้อนหลัง 40003 มี 80 คะแนน', bal('40003').conductScore, 80);
unwrap(apiImportCommit(admin.token, 'merit_records',
  'รหัสนักเรียน,เกณฑ์,วันที่,รายละเอียด\n40003,ด-12,01/06/2569,ชนะเลิศการแข่งขันระดับโรงเรียน'));
check('ความดีที่เกิดก่อนตอนคะแนนเต็มแล้ว ไม่ทำให้คะแนนเพิ่มย้อนหลัง', bal('40003').conductScore, 80);
check('แต่คะแนนความดีสะสมเพิ่มขึ้นตามจริง', bal('40003').meritTotal, 10 + 30);

/* ---------- 10. กระดานเกียรติยศ ---------- */
section('กระดานเกียรติยศ');
const board = unwrap(apiLeaderboard(admin.token));
check('ม.ต้น อันดับ 1 คือคนคะแนนความดีสูงสุดที่ไม่เคยผิด', board.lower[0].displayName, 'เด็กหญิงนภา ศรีสุข');
check('คนที่เคยทำผิดถูกตัดออกแม้คะแนนความดีสูงสุด',
  board.lower.map(c => c.displayName).some(n => n.indexOf('ธนา') >= 0), false);
check('คนที่ถูกหักคะแนนไม่ขึ้นกระดาน ม.ปลาย',
  board.upper.map(c => c.displayName).some(n => n.indexOf('อนันต์') >= 0), false);
check('เรียงคะแนนเท่ากันด้วยเวลาที่ทำสำเร็จก่อน',
  board.upper.map(c => c.displayName), ['นายวิชัย มุ่งมั่น', 'นางสาวสุดา พากเพียร']);

unwrap(apiPublishLeaderboard(affairs.token));
const pub = unwrap(apiPublicLeaderboard());
check('หน้าสาธารณะไม่มีรายชื่อผู้กระทำผิด',
  JSON.stringify(pub).indexOf('อนันต์') < 0 && JSON.stringify(pub).indexOf('ธนา') < 0, true);
check('หน้าสาธารณะแสดงสถิติรวมทั้งโรงเรียน', pub.totalMeritActs > 0, true);

/* ---------- 11. การเพิกถอนและคืนคะแนน ---------- */
section('การเพิกถอนบันทึก (อุทธรณ์สำเร็จ)');
check('ครูที่ปรึกษาเพิกถอนไม่ได้',
  apiRevokeRecord(homeroom.token, idOf(R[4].recordNo), 'ทดสอบ').ok, false);
check('เพิกถอนต้องมีเหตุผล', apiRevokeRecord(affairs.token, idOf(R[4].recordNo), '  ').ok, false);
unwrap(apiRevokeRecord(affairs.token, idOf(R[4].recordNo), 'อุทธรณ์สำเร็จ รถโรงเรียนเสีย'));

check('คืนคะแนนกลับเป็น 100', bal('30003').conductScore, 100);
check('ลบจำนวนครั้งที่ทำผิด', bal('30003').demeritCount, 0);
check('คะแนนความดีไม่ถูกแตะต้อง', bal('30003').meritTotal, 50);
check('กลับขึ้นกระดานเป็นอันดับ 1 หลังอุทธรณ์สำเร็จ',
  unwrap(apiLeaderboard(admin.token)).lower[0].displayName, 'เด็กชายธนา ข.');
check('ปกปิดนามสกุลตาม PDPA เมื่อผู้ปกครองไม่ยินยอม',
  unwrap(apiLeaderboard(admin.token)).lower[0].displayName.endsWith(' ข.'), true);

/* ---------- 12. ความถูกต้องของยอดคะแนน ---------- */
section('ความถูกต้องของยอดคะแนน');
const before = dbReadAll(SHEETS.BALANCES).map(b =>
  b['รหัสนักเรียน(ระบบ)'] + ':' + b['คะแนนความประพฤติ'] + ':' + b['คะแนนความดีสะสม']).sort();
unwrap(apiRebuildBalances(admin.token));
const after = dbReadAll(SHEETS.BALANCES).map(b =>
  b['รหัสนักเรียน(ระบบ)'] + ':' + b['คะแนนความประพฤติ'] + ':' + b['คะแนนความดีสะสม']).sort();
check('คำนวณใหม่ทั้งระบบได้ผลตรงกับยอดที่เดินมา', after, before);

/* ---------- 13. แดชบอร์ดและรายงาน ---------- */
section('แดชบอร์ดและรายงาน');
const dash = unwrap(apiDashboard(admin.token));
check('แดชบอร์ดนับนักเรียนถูก', dash.stats.students, 7);
check('แดชบอร์ดมีข้อมูล 6 เดือน', dash.months.length, 6);

['R02', 'R03', 'R04', 'R05', 'R06', 'R07', 'R09', 'R11'].forEach(id => {
  const rep = apiBuildReport(admin.token, id, id === 'R02' ? { grade: 1, room: 1 } : {});
  check('รายงาน ' + id + ' สร้างได้', rep.ok && rep.data.rows.length > 0, true);
});
const r01 = apiBuildReport(admin.token, 'R01', { studentId: sid['30001'] });
check('รายงาน R01 รายบุคคลสร้างได้', r01.ok, true);
check('R01 แสดงความดีก่อนความผิด', r01.data.rows[0][1], 'ความดี');
check('ครูผู้สอนออกรายงานไม่ได้', apiBuildReport(teacher.token, 'R05', {}).ok, false);
check('ครูที่ปรึกษาออกรายงานนักเรียนนอกห้องตนไม่ได้',
  apiBuildReport(homeroom.token, 'R01', { studentId: sid['40001'] }).ok, false);

/* ---------- 14. แบบฟอร์มนำเข้า ---------- */
section('แบบฟอร์มและประเภทข้อมูลที่นำเข้าได้');
check('ผู้ดูแลระบบนำเข้าได้ทั้ง 5 ประเภท', unwrap(apiImportTypes(admin.token)).length, 5);
check('ครูผู้สอนนำเข้าข้อมูลไม่ได้เลย', unwrap(apiImportTypes(teacher.token)).length, 0);
Object.keys(IMPORT_TYPES).forEach(t => {
  const tpl = unwrap(apiImportTemplate(admin.token, t));
  const lines = tpl.csv.split('\n');
  check('แบบฟอร์ม ' + t + ' มีหัวตารางและตัวอย่าง',
    lines.length === 2 && lines[0].split(',').length === lines[1].split(',').length, true);
  check('  ' + t + ' นำแบบฟอร์มกลับเข้าระบบได้ทันที',
    apiImportPreview(admin.token, t, tpl.csv).ok, true);
});

/* ---------- 15. เซสชันและร่องรอยการใช้งาน ---------- */
section('เซสชันและร่องรอยการใช้งาน');
unwrap(apiLogout(teacher.token));
check('ออกจากระบบแล้วใช้ token เดิมไม่ได้', apiMe(teacher.token).ok, false);
check('เปลี่ยนรหัสผ่านด้วยรหัสเดิมผิด ถูกปฏิเสธ',
  apiChangePassword(admin.token, 'ผิด', 'newpass1234').ok, false);
unwrap(apiChangePassword(admin.token, 'admin12345', 'newpass1234'));
check('เข้าสู่ระบบด้วยรหัสใหม่ได้', apiLogin('admin', 'newpass1234').ok, true);
check('รหัสเดิมใช้ไม่ได้แล้ว', apiLogin('admin', 'admin12345').ok, false);

const audit = unwrap(apiAuditLog(unwrap(apiLogin('admin', 'newpass1234')).token, 200));
check('บันทึกการนำเข้าข้อมูลไว้ใน audit log', audit.some(a => a.action === 'นำเข้าข้อมูล'), true);
check('บันทึกการแก้ไขหลักเกณฑ์ไว้ด้วย', audit.some(a => a.action === 'เพิ่มหลักเกณฑ์'), true);
check('ครูที่ปรึกษาดู audit log ไม่ได้', apiAuditLog(homeroom.token, 10).ok, false);

console.log('\n' + '='.repeat(52));
console.log(`ผ่าน ${pass} รายการ · ไม่ผ่าน ${fail} รายการ`);
console.log('='.repeat(52));
process.exit(fail ? 1 : 0);
