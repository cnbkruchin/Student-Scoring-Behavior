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
