-- =====================================================================
--  ข้อมูลตัวอย่างสำหรับทดสอบระบบ (ไม่ใช่ข้อมูลจริง)
--  ใช้ตรวจสอบว่ากลไกคะแนนและกระดานเกียรติยศทำงานถูกต้อง
-- =====================================================================
BEGIN;

INSERT INTO academic_years (year_be, start_date, end_date, is_current)
VALUES (2569, '2569-05-16', '2570-03-31', true);

INSERT INTO terms (academic_year_id, term_no, start_date, end_date, is_current)
VALUES (1, 1, '2569-05-16', '2569-10-10', true),
       (1, 2, '2569-11-01', '2570-03-31', false);

INSERT INTO users (username, full_name) VALUES
 ('admin',    'ผู้ดูแลระบบ'),
 ('kru.somchai', 'นายสมชาย ใจดี'),
 ('kru.malee',   'นางมาลี รักเรียน'),
 ('affairs',  'หัวหน้างานกิจการนักเรียน');
INSERT INTO user_roles (user_id, role_code) VALUES
 (1,'admin'), (2,'teacher'), (2,'homeroom'), (3,'teacher'), (4,'student_affairs');

INSERT INTO teachers (user_id, teacher_code, prefix, first_name, last_name, department) VALUES
 (2, 'T001', 'นาย', 'สมชาย', 'ใจดี', 'วิทยาศาสตร์'),
 (3, 'T002', 'นาง', 'มาลี', 'รักเรียน', 'ภาษาไทย');

INSERT INTO classrooms (academic_year_id, grade_level, room_no, program) VALUES
 (1, 1, 1, 'ทั่วไป'), (1, 2, 1, 'ทั่วไป'), (1, 3, 1, 'ทั่วไป'),
 (1, 4, 1, 'วิทย์-คณิต'), (1, 5, 1, 'วิทย์-คณิต'), (1, 6, 1, 'ศิลป์-ภาษา');
INSERT INTO classroom_advisors (classroom_id, teacher_id) VALUES (1, 1), (4, 2);

-- นักเรียนตัวอย่าง 8 คน (ม.ต้น 4 / ม.ปลาย 4)
INSERT INTO students (student_code, prefix, first_name, last_name, gender, entry_year_id,
                      entry_grade, admission_type, publish_consent) VALUES
 ('30001','เด็กชาย','กิตติ','ตั้งใจดี','ชาย',1,1,'new', true),
 ('30002','เด็กหญิง','นภา','ศรีสุข','หญิง',1,1,'new', true),
 ('30003','เด็กชาย','ธนา','ขยันเรียน','ชาย',1,1,'new', false),
 ('30004','เด็กหญิง','ปรีดา','ใจงาม','หญิง',1,1,'new', true),
 ('30005','นาย','วิชัย','มุ่งมั่น','ชาย',1,4,'new', true),
 ('30006','นางสาว','สุดา','พากเพียร','หญิง',1,4,'new', true),
 ('30007','นาย','อนันต์','กล้าหาญ','ชาย',1,4,'new', true),
 ('30008','นางสาว','เกศรา','อ่อนน้อม','หญิง',1,4,'new', false);

INSERT INTO enrollments (student_id, academic_year_id, classroom_id, seat_no) VALUES
 (1,1,1,1), (2,1,1,2), (3,1,1,3), (4,1,1,4),
 (5,1,4,1), (6,1,4,2), (7,1,4,3), (8,1,4,4);

-- ยอดคะแนนตั้งต้น 100 คะแนนของทุกคน
SELECT fn_ensure_balance(s.id, 1::smallint) FROM students s;

-- บันทึกพฤติกรรมตัวอย่าง (บันทึกเป็น submitted แล้วอนุมัติ เพื่อให้ trigger ลงบัญชี)
INSERT INTO behavior_records
 (record_no, student_id, academic_year_id, term_id, classroom_id, rule_id, kind, points,
  occurred_at, detail, reported_by, status)
SELECT 'BR-2569-' || lpad(x.n::text, 6, '0'), x.student_id, 1, 1, x.classroom_id,
       br.id, br.kind, br.points, x.occurred_at, x.detail, 2, 'submitted'
FROM (VALUES
   (1, 1, 1, 'M-302', '2569-06-10 09:00+07'::timestamptz, 'เก็บกระเป๋าเงินได้ส่งคืนเจ้าของ'),
   (2, 1, 1, 'M-201', '2569-06-20 13:00+07'::timestamptz, 'จิตอาสาพัฒนาโรงเรียน 3 ชั่วโมง'),
   (3, 1, 1, 'M-401', '2569-06-30 08:00+07'::timestamptz, 'มาเรียนตรงเวลาตลอดเดือนมิถุนายน'),
   (4, 2, 1, 'M-201', '2569-06-15 13:00+07'::timestamptz, 'จิตอาสาปลูกต้นไม้'),
   (5, 2, 1, 'M-101', '2569-06-30 16:00+07'::timestamptz, 'ส่งงานครบทุกรายวิชา'),
   (6, 3, 1, 'M-503', '2569-07-05 09:00+07'::timestamptz, 'รางวัลระดับภาค การแข่งขันตอบปัญหา'),
   (7, 3, 1, 'D-201', '2569-07-10 08:20+07'::timestamptz, 'มาโรงเรียนสาย 20 นาที'),
   (8, 4, 1, 'M-202', '2569-07-12 15:00+07'::timestamptz, 'ช่วยจัดห้องสมุดนอกเวลา'),
   (9, 5, 4, 'M-502', '2569-06-25 09:00+07'::timestamptz, 'รางวัลระดับเขตพื้นที่ฯ'),
   (10,5, 4, 'M-203', '2569-07-02 09:00+07'::timestamptz, 'บำเพ็ญประโยชน์วัดในชุมชน'),
   (11,6, 4, 'M-602', '2569-06-28 10:00+07'::timestamptz, 'ช่วยเหลือเพื่อนที่เป็นลมหน้าเสาธง'),
   (12,6, 4, 'M-504', '2569-07-15 09:00+07'::timestamptz, 'ปฏิบัติหน้าที่สภานักเรียนดีเด่น'),
   (13,7, 4, 'M-201', '2569-07-01 13:00+07'::timestamptz, 'จิตอาสาทำความสะอาดโรงอาหาร'),
   (14,7, 4, 'D-501', '2569-07-20 12:30+07'::timestamptz, 'สูบบุหรี่ไฟฟ้าในห้องน้ำ'),
   (15,8, 4, 'M-601', '2569-07-08 09:00+07'::timestamptz, 'มารยาทดีเด่นได้รับการเสนอชื่อจากครู')
 ) AS x(n, student_id, classroom_id, rule_code, occurred_at, detail)
JOIN behavior_rules br ON br.code = x.rule_code;

-- อนุมัติทุกบันทึก -> trigger ลงบัญชีคะแนนอัตโนมัติ
UPDATE behavior_records
   SET status = 'approved', reviewed_by = 4, reviewed_at = now()
 WHERE status = 'submitted';

COMMIT;
