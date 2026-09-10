/* จำลองบริการของ Google Apps Script เพื่อทดสอบตรรกะฝั่งเซิร์ฟเวอร์ใน Node */
const crypto = require('crypto');

class MockRange {
  constructor(sheet, row, col, nr, nc) {
    Object.assign(this, { sheet, row, col, nr, nc });
  }
  getValues() {
    const out = [];
    for (let r = 0; r < this.nr; r++) {
      const row = [];
      for (let c = 0; c < this.nc; c++) {
        const rr = this.sheet.data[this.row - 1 + r] || [];
        row.push(rr[this.col - 1 + c] === undefined ? '' : rr[this.col - 1 + c]);
      }
      out.push(row);
    }
    return out;
  }
  setValues(values) {
    for (let r = 0; r < values.length; r++) {
      const target = this.row - 1 + r;
      while (this.sheet.data.length <= target) this.sheet.data.push([]);
      for (let c = 0; c < values[r].length; c++) {
        this.sheet.data[target][this.col - 1 + c] = values[r][c];
      }
    }
    return this;
  }
  setValue(v) { return this.setValues([[v]]); }
  clearContent() {
    for (let r = 0; r < this.nr; r++) {
      const target = this.row - 1 + r;
      if (!this.sheet.data[target]) continue;
      for (let c = 0; c < this.nc; c++) this.sheet.data[target][this.col - 1 + c] = '';
    }
    return this;
  }
  merge() { return this; }
  setFontWeight() { return this; } setBackground() { return this; } setFontColor() { return this; }
  setFontSize() { return this; } setHorizontalAlignment() { return this; }
  setVerticalAlignment() { return this; } setWrap() { return this; } setBorder() { return this; }
}

class MockSheet {
  constructor(name) { this.name = name; this.data = []; }
  getName() { return this.name; }
  setName(n) { this.name = n; return this; }
  getLastRow() {
    let last = 0;
    this.data.forEach((row, i) => { if (row && row.join('') !== '') last = i + 1; });
    return last;
  }
  getLastColumn() { return Math.max(0, ...this.data.map(r => (r ? r.length : 0))); }
  getMaxColumns() { return Math.max(1, this.getLastColumn()); }
  getMaxRows() { return Math.max(1, this.data.length); }
  getDataRange() { return new MockRange(this, 1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn())); }
  getRange(r, c, nr = 1, nc = 1) { return new MockRange(this, r, c, nr, nc); }
  appendRow(row) { this.data[this.getLastRow()] = row.slice(); return this; }
  deleteRow(r) { this.data.splice(r - 1, 1); return this; }
  deleteColumns() { return this; }
  setFrozenRows() { return this; }
  autoResizeColumn() { return this; } autoResizeColumns() { return this; }
  getColumnWidth() { return 100; } setColumnWidth() { return this; }
}

class MockSpreadsheet {
  constructor() { this.sheets = []; this.id = 'MOCK_SS_ID'; }
  getId() { return this.id; }
  getSheetByName(n) { return this.sheets.find(s => s.name === n) || null; }
  insertSheet(n) { const s = new MockSheet(n); this.sheets.push(s); return s; }
  getSheets() { return this.sheets; }
  deleteSheet(s) { this.sheets = this.sheets.filter(x => x !== s); }
}

const SS = new MockSpreadsheet();
const props = {};
const alerts = [];

global.SpreadsheetApp = {
  getActiveSpreadsheet: () => SS,
  openById: () => SS,
  create: () => SS,
  flush: () => {},
  BorderStyle: { SOLID: 'SOLID' },
  getUi: () => ({
    alert: (...a) => { alerts.push(a.join(' | ')); },
    prompt: () => ({ getSelectedButton: () => 'CANCEL', getResponseText: () => '' }),
    createMenu: () => { const m = { addItem: () => m, addSeparator: () => m, addToUi: () => m }; return m; },
    ButtonSet: { OK: 'OK', OK_CANCEL: 'OK_CANCEL', YES_NO: 'YES_NO' },
    Button: { OK: 'OK', YES: 'YES' }
  })
};

global.PropertiesService = {
  getScriptProperties: () => ({
    getProperty: k => (props[k] === undefined ? null : props[k]),
    setProperty: (k, v) => { props[k] = String(v); },
    deleteProperty: k => { delete props[k]; },
    getProperties: () => Object.assign({}, props)
  })
};

global.LockService = {
  getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} })
};

const TH = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
            'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];

global.Utilities = {
  DigestAlgorithm: { SHA_256: 'SHA_256' },
  Charset: { UTF_8: 'UTF_8' },
  getUuid: () => crypto.randomUUID(),
  computeDigest: (algo, value) => {
    const buf = crypto.createHash('sha256').update(String(value), 'utf8').digest();
    return Array.from(buf).map(b => (b > 127 ? b - 256 : b));   // Apps Script คืนเป็น signed byte
  },
  base64Encode: bytes => Buffer.from(bytes).toString('base64'),
  formatDate: (date, tz, fmt) => {
    const d = new Date(date);
    const p = n => String(n).padStart(2, '0');
    return fmt
      .replace('yyyy', d.getFullYear())
      .replace('MM', p(d.getMonth() + 1))
      .replace('dd', p(d.getDate()))
      .replace('HH', p(d.getHours()))
      .replace('mm', p(d.getMinutes()))
      .replace('ss', p(d.getSeconds()));
  },
  parseCsv: text => text.trim().split(/\r?\n/).map(line => {
    const out = []; let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') q = false;
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',') { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out;
  })
};

global.ScriptApp = { getOAuthToken: () => 'MOCK_TOKEN' };
global.UrlFetchApp = { fetch: () => ({ getResponseCode: () => 200, getBlob: () => ({ setName: n => ({ getName: () => n, getContentType: () => 'application/pdf', getBytes: () => [1,2,3] }) }) }) };
global.DriveApp = { getFileById: () => ({ setTrashed: () => {} }) };
global.HtmlService = {
  createTemplateFromFile: () => ({ evaluate: () => ({ setTitle: () => ({ setXFrameOptionsMode: () => ({ addMetaTag: () => ({ setFaviconUrl: () => ({}) }) }) }) }) }),
  createHtmlOutputFromFile: () => ({ getContent: () => '' }),
  XFrameOptionsMode: { ALLOWALL: 'ALLOWALL' }
};

module.exports = { SS, props, alerts, TH };
