-- =====================================================================
--  คิวรีรายงานหลักของระบบ
--  ทุกรายงานยึดปีการศึกษาปัจจุบันเป็นค่าตั้งต้น และเปลี่ยนพารามิเตอร์ได้
--  รายละเอียดผู้รับ/รอบการออกรายงาน ดูที่ docs/06-reports.md
-- =====================================================================

-- ---------------------------------------------------------------------
-- R01 ระเบียนความประพฤติรายบุคคล (สมุดพกความประพฤติ)
--     ใช้: ครูที่ปรึกษา / ผู้ปกครอง / แนบ ปพ.
-- ---------------------------------------------------------------------
SELECT
    r.occurred_at::date                                   AS วันที่,
    CASE r.kind WHEN 'merit' THEN 'ความดี' ELSE 'ความผิด' END AS ประเภท,
    br.code || ' ' || br.name_th                          AS หลักเกณฑ์,
    CASE r.kind WHEN 'merit' THEN r.points ELSE -r.points END AS คะแนน,
    r.detail                                              AS รายละเอียด,
    u.full_name                                           AS ผู้บันทึก,
    r.status                                              AS สถานะ
FROM behavior_records r
JOIN behavior_rules br ON br.id = r.rule_id
JOIN users u           ON u.id = r.reported_by
WHERE r.student_id = $1
  AND r.academic_year_id = COALESCE($2, (SELECT id FROM academic_years WHERE is_current))
  AND r.status IN ('approved', 'appealed')
ORDER BY r.occurred_at DESC;

-- ---------------------------------------------------------------------
-- R02 สรุปคะแนนรายห้อง (สำหรับครูที่ปรึกษา)
-- ---------------------------------------------------------------------
SELECT
    v.seat_no            AS เลขที่,
    v.student_code       AS รหัส,
    v.full_name          AS ชื่อ_สกุล,
    v.conduct_score      AS คะแนนความประพฤติ,
    v.merit_total        AS คะแนนความดีสะสม,
    v.demerit_total      AS คะแนนที่ถูกหัก,
    v.demerit_count      AS จำนวนครั้งที่ทำผิด,
    v.risk_level         AS ระดับความเสี่ยง
FROM v_student_current v
WHERE v.grade_level = $1 AND v.room_no = $2
ORDER BY v.seat_no;

-- ---------------------------------------------------------------------
-- R03 รายงานนักเรียนกลุ่มเสี่ยง (คะแนนต่ำกว่าเกณฑ์ + สถานะการช่วยเหลือ)
--     ใช้: ฝ่ายกิจการนักเรียน / ระบบดูแลช่วยเหลือนักเรียน
-- ---------------------------------------------------------------------
SELECT
    v.classroom_label                      AS ห้อง,
    v.student_code                         AS รหัส,
    v.full_name                            AS ชื่อ_สกุล,
    v.conduct_score                        AS คะแนนคงเหลือ,
    th.risk_level                          AS ระดับ,
    th.action_required                     AS การดำเนินการที่ต้องทำ,
    v.demerit_count                        AS ครั้งที่ทำผิด,
    (SELECT string_agg(DISTINCT t.first_name || ' ' || t.last_name, ', ')
       FROM classroom_advisors ca
       JOIN teachers t ON t.id = ca.teacher_id
       JOIN enrollments e2 ON e2.classroom_id = ca.classroom_id
      WHERE e2.student_id = v.student_id
        AND e2.academic_year_id = v.academic_year_id) AS ครูที่ปรึกษา,
    (SELECT count(*) FROM improvement_plans ip
      WHERE ip.student_id = v.student_id
        AND ip.status IN ('assigned','in_progress'))  AS แผนแก้ไขที่ดำเนินอยู่,
    (SELECT max(da.ordered_at)::date FROM disciplinary_actions da
      WHERE da.student_id = v.student_id)             AS ลงโทษล่าสุด
FROM v_student_current v
JOIN score_thresholds th
      ON v.conduct_score BETWEEN th.min_score AND th.max_score
WHERE v.conduct_score <= COALESCE($1, 70)
ORDER BY v.conduct_score ASC, v.classroom_label;

-- ---------------------------------------------------------------------
-- R04 พฤติกรรมที่พบบ่อย (Top violations) แยกตามหมวด/สถานที่/ช่วงเวลา
--     ใช้: วางแผนป้องกันเชิงรุก จัดเวรครู
-- ---------------------------------------------------------------------
SELECT
    rc.name_th                                        AS หมวด,
    br.code || ' ' || br.name_th                      AS พฤติกรรม,
    count(*)                                          AS จำนวนครั้ง,
    count(DISTINCT r.student_id)                      AS จำนวนนักเรียน,
    sum(r.points)                                     AS คะแนนที่หักรวม,
    mode() WITHIN GROUP (ORDER BY r.location)         AS สถานที่ที่พบบ่อย,
    mode() WITHIN GROUP (ORDER BY extract(hour FROM r.occurred_at)) AS ชั่วโมงที่พบบ่อย,
    round(100.0 * count(*) / NULLIF(sum(count(*)) OVER (), 0), 1)   AS ร้อยละ
FROM behavior_records r
JOIN behavior_rules br  ON br.id = r.rule_id
JOIN rule_categories rc ON rc.code = br.category_code
WHERE r.kind = 'demerit'
  AND r.status = 'approved'
  AND r.academic_year_id = COALESCE($1, (SELECT id FROM academic_years WHERE is_current))
GROUP BY rc.name_th, br.code, br.name_th
ORDER BY จำนวนครั้ง DESC
LIMIT 20;

-- ---------------------------------------------------------------------
-- R05 สรุปภาพรวมรายระดับชั้น (สำหรับผู้บริหาร)
-- ---------------------------------------------------------------------
SELECT
    'ม.' || v.grade_level                                          AS ระดับชั้น,
    count(*)                                                       AS นักเรียนทั้งหมด,
    round(avg(v.conduct_score), 2)                                 AS คะแนนเฉลี่ย,
    min(v.conduct_score)                                           AS คะแนนต่ำสุด,
    count(*) FILTER (WHERE v.conduct_score = 100)                  AS คะแนนเต็ม,
    count(*) FILTER (WHERE v.conduct_score BETWEEN 61 AND 99)      AS เฝ้าระวัง,
    count(*) FILTER (WHERE v.conduct_score <= 60)                  AS ต้องช่วยเหลือ,
    sum(v.merit_count)                                             AS ครั้งที่ทำความดี,
    sum(v.demerit_count)                                           AS ครั้งที่ทำผิด,
    round(100.0 * count(*) FILTER (WHERE v.demerit_count = 0) / count(*), 1)
                                                                   AS ร้อยละไม่มีประวัติผิด
FROM v_student_current v
GROUP BY v.grade_level
ORDER BY v.grade_level;

-- ---------------------------------------------------------------------
-- R06 รายงานการทำความดี (สรุปคะแนนความดีรายหมวด + ชั่วโมงจิตอาสา)
--     ใช้: งานส่งเสริมคุณธรรม / ประกอบการมอบเกียรติบัตร
-- ---------------------------------------------------------------------
SELECT
    rc.name_th                                   AS หมวดความดี,
    count(*)                                     AS จำนวนครั้ง,
    count(DISTINCT r.student_id)                 AS จำนวนนักเรียนที่มีส่วนร่วม,
    sum(r.points)                                AS คะแนนรวม,
    round(avg(r.points), 1)                      AS คะแนนเฉลี่ยต่อครั้ง
FROM behavior_records r
JOIN behavior_rules br  ON br.id = r.rule_id
JOIN rule_categories rc ON rc.code = br.category_code
WHERE r.kind = 'merit'
  AND r.status = 'approved'
  AND r.academic_year_id = COALESCE($1, (SELECT id FROM academic_years WHERE is_current))
GROUP BY rc.name_th, rc.sort_order
ORDER BY rc.sort_order;

-- ---------------------------------------------------------------------
-- R07 รายงานการบันทึกของครู (ตรวจสอบความเป็นธรรมและความสม่ำเสมอ)
--     ใช้: ผู้บริหาร ตรวจว่ามีครูบางคนบันทึกมากผิดปกติหรือไม่มีเลย
-- ---------------------------------------------------------------------
SELECT
    u.full_name                                          AS ครู,
    count(*)                                             AS บันทึกทั้งหมด,
    count(*) FILTER (WHERE r.kind = 'merit')             AS ให้คะแนนความดี,
    count(*) FILTER (WHERE r.kind = 'demerit')           AS หักคะแนน,
    count(*) FILTER (WHERE r.status = 'rejected')        AS ถูกปฏิเสธ,
    count(*) FILTER (WHERE r.status = 'revoked')         AS ถูกเพิกถอน,
    round(100.0 * count(*) FILTER (WHERE r.kind = 'merit') / count(*), 1) AS ร้อยละความดี,
    max(r.reported_at)::date                             AS บันทึกล่าสุด
FROM behavior_records r
JOIN users u ON u.id = r.reported_by
WHERE r.academic_year_id = COALESCE($1, (SELECT id FROM academic_years WHERE is_current))
GROUP BY u.full_name
ORDER BY บันทึกทั้งหมด DESC;

-- ---------------------------------------------------------------------
-- R08 รายงานการลงโทษตามระเบียบ ศธ. พ.ศ. 2548
--     ใช้: เอกสารราชการ / รายงาน สพม.
-- ---------------------------------------------------------------------
SELECT
    da.action_type                          AS ประเภทการลงโทษ,
    count(*)                                AS จำนวนครั้ง,
    count(DISTINCT da.student_id)           AS จำนวนนักเรียน,
    count(*) FILTER (WHERE da.guardian_ack_at IS NOT NULL) AS ผู้ปกครองรับทราบแล้ว,
    count(*) FILTER (WHERE da.status = 'completed')        AS ดำเนินการเสร็จสิ้น
FROM disciplinary_actions da
JOIN behavior_records r ON r.id = da.behavior_record_id
WHERE r.academic_year_id = COALESCE($1, (SELECT id FROM academic_years WHERE is_current))
GROUP BY da.action_type
ORDER BY จำนวนครั้ง DESC;

-- ---------------------------------------------------------------------
-- R09 แนวโน้มรายเดือน (เปรียบเทียบความดี vs ความผิด)
--     ใช้: แดชบอร์ดผู้บริหาร / ประเมินผลมาตรการ
-- ---------------------------------------------------------------------
SELECT
    to_char(r.occurred_at, 'YYYY-MM')                        AS เดือน,
    count(*) FILTER (WHERE r.kind = 'merit')                 AS ครั้งความดี,
    count(*) FILTER (WHERE r.kind = 'demerit')               AS ครั้งความผิด,
    sum(r.points) FILTER (WHERE r.kind = 'merit')            AS คะแนนความดี,
    sum(r.points) FILTER (WHERE r.kind = 'demerit')          AS คะแนนที่หัก,
    round(
        count(*) FILTER (WHERE r.kind = 'merit')::numeric
        / NULLIF(count(*) FILTER (WHERE r.kind = 'demerit'), 0), 2
    )                                                        AS อัตราส่วนดีต่อผิด
FROM behavior_records r
WHERE r.status = 'approved'
  AND r.academic_year_id = COALESCE($1, (SELECT id FROM academic_years WHERE is_current))
GROUP BY 1
ORDER BY 1;

-- ---------------------------------------------------------------------
-- R10 รายงานคุณลักษณะอันพึงประสงค์ 8 ประการ (ส่งต่องานวัดผล / SAR)
--     สรุปว่านักเรียนแต่ละคนมีหลักฐานเชิงประจักษ์ในคุณลักษณะใดบ้าง
-- ---------------------------------------------------------------------
SELECT
    v.classroom_label                                     AS ห้อง,
    v.student_code                                        AS รหัส,
    v.full_name                                           AS ชื่อ_สกุล,
    br.desired_trait                                      AS คุณลักษณะ,
    count(*)                                              AS จำนวนหลักฐาน,
    sum(r.points)                                         AS คะแนนรวม
FROM behavior_records r
JOIN behavior_rules br     ON br.id = r.rule_id
JOIN v_student_current v   ON v.student_id = r.student_id
WHERE r.kind = 'merit'
  AND r.status = 'approved'
  AND br.desired_trait IS NOT NULL
  AND r.academic_year_id = COALESCE($1, (SELECT id FROM academic_years WHERE is_current))
GROUP BY v.classroom_label, v.student_code, v.full_name, br.desired_trait
ORDER BY v.classroom_label, v.student_code, br.desired_trait;
