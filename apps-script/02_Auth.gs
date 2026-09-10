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
