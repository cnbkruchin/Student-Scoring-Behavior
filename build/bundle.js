#!/usr/bin/env node
/**
 * build/bundle.js — รวมไฟล์ต้นฉบับให้เหลือ 2 ไฟล์ สำหรับติดตั้งลง Google Apps Script
 *
 *   apps-script/*.gs    (10 ไฟล์)  ->  dist/Code.gs
 *   apps-script/*.html  (5 ไฟล์)   ->  dist/Index.html
 *
 * Apps Script รวมไฟล์ .gs ทุกไฟล์ไว้ใน scope เดียวกันอยู่แล้ว การนำมาต่อกัน
 * จึงได้ผลเหมือนเดิมทุกประการ ส่วนไฟล์ HTML ใช้การแทนที่ include() ด้วยเนื้อหาจริง
 *
 * ใช้: node build/bundle.js
 */

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'apps-script');
const OUT = path.join(__dirname, '..', 'dist');

function banner(title, files) {
  return [
    '/* ' + '='.repeat(74),
    ' * ' + title,
    ' * โรงเรียนจุนวิทยาคม',
    ' *',
    ' * ไฟล์นี้สร้างอัตโนมัติจาก  node build/bundle.js  — อย่าแก้ไขไฟล์นี้โดยตรง',
    ' * ถ้าต้องการแก้ไขระบบ ให้แก้ที่ apps-script/ แล้วสร้างใหม่ เพื่อให้ยังรันชุดทดสอบได้',
    ' *',
    ' * รวมจาก: ' + files.join(', '),
    ' * ' + '='.repeat(74) + ' */',
    ''
  ].join('\n');
}

function bundleCode() {
  const files = fs.readdirSync(SRC).filter(f => f.endsWith('.gs')).sort();
  const parts = files.map(f => {
    const body = fs.readFileSync(path.join(SRC, f), 'utf8').trim();
    return '\n\n/* ' + '-'.repeat(70) + '\n * ' + f + '\n * ' + '-'.repeat(70) + ' */\n\n' + body;
  });
  const out = banner('ระบบคะแนนความประพฤตินักเรียน — โค้ดฝั่งเซิร์ฟเวอร์ทั้งหมด', files) + parts.join('\n');
  fs.writeFileSync(path.join(OUT, 'Code.gs'), out + '\n');
  return { files, lines: out.split('\n').length };
}

function bundleHtml() {
  const used = [];
  let html = fs.readFileSync(path.join(SRC, 'Index.html'), 'utf8');

  // แทนที่ <?!= include('X'); ?> ด้วยเนื้อหาของไฟล์ X.html จริง ๆ
  html = html.replace(/[ \t]*<\?!=\s*include\('([A-Za-z]+)'\);?\s*\?>/g, (_, name) => {
    used.push(name + '.html');
    const body = fs.readFileSync(path.join(SRC, name + '.html'), 'utf8').trim();
    return '\n<!-- ' + '='.repeat(66) + ' -->\n' +
           '<!-- ' + name + '.html -->\n' +
           '<!-- ' + '='.repeat(66) + ' -->\n' + body;
  });

  const header = '<!-- ' + '='.repeat(72) + '\n' +
    '     ระบบคะแนนความประพฤตินักเรียน โรงเรียนจุนวิทยาคม — หน้าเว็บทั้งหมด\n' +
    '     ไฟล์นี้สร้างอัตโนมัติจาก  node build/bundle.js  — อย่าแก้ไขไฟล์นี้โดยตรง\n' +
    '     รวมจาก: Index.html, ' + used.join(', ') + '\n' +
    '     ' + '='.repeat(72) + ' -->\n';

  fs.writeFileSync(path.join(OUT, 'Index.html'), header + html);
  return { files: ['Index.html'].concat(used), lines: html.split('\n').length };
}

fs.mkdirSync(OUT, { recursive: true });
fs.copyFileSync(path.join(SRC, 'appsscript.json'), path.join(OUT, 'appsscript.json'));

const code = bundleCode();
const html = bundleHtml();

console.log('สร้างไฟล์สำหรับติดตั้งเรียบร้อย ที่โฟลเดอร์ dist/\n');
console.log('  Code.gs           ' + String(code.lines).padStart(5) + ' บรรทัด   (รวม ' + code.files.length + ' ไฟล์)');
console.log('  Index.html        ' + String(html.lines).padStart(5) + ' บรรทัด   (รวม ' + html.files.length + ' ไฟล์)');
console.log('  appsscript.json                 (ไฟล์ตั้งค่าโครงการ)');
console.log('\nนำ 3 ไฟล์นี้ไปวางใน Apps Script ได้เลย ดูขั้นตอนที่ dist/README.md');
