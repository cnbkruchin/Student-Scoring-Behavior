-- =====================================================================
--  กระดานเกียรติยศหน้าหลัก
--  แสดงนักเรียนคะแนนความดีสูงสุด 10 คน แยกเป็น ม.ต้น และ ม.ปลาย
--
--  เงื่อนไขการขึ้นกระดาน:
--   1) เป็นนักเรียนสถานะปกติ และลงทะเบียนในปีการศึกษาปัจจุบัน
--   2) ไม่เคยมีบันทึกความผิดที่ได้รับอนุมัติ (ตามขอบเขตใน app_settings)
--   3) คะแนนความประพฤติเต็ม 100
--   4) มีคะแนนความดีสะสมอย่างน้อยตามที่กำหนด
--
--  ลำดับการจัดอันดับ (tie-break):
--   คะแนนความดีมาก > จำนวนครั้งมาก > ได้คะแนนล่าสุดเร็วกว่า > รหัสนักเรียนน้อยกว่า
-- =====================================================================

-- ---------------------------------------------------------------------
-- ฟังก์ชันช่วย: ชื่อที่แสดงต่อสาธารณะ (ปกปิดนามสกุลถ้าไม่มีความยินยอม PDPA)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public_display_name(
    p_prefix text, p_first text, p_last text, p_consent boolean
) RETURNS text LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE
        WHEN p_consent THEN COALESCE(p_prefix, '') || p_first || ' ' || p_last
        ELSE COALESCE(p_prefix, '') || p_first || ' ' || LEFT(p_last, 1) || '.'
    END;
$$;

-- ---------------------------------------------------------------------
-- ฟังก์ชันหลัก: ดึงอันดับสด
--   p_level_band : 'lower' (ม.1-3) | 'upper' (ม.4-6) | NULL = ทั้งสองระดับ
--   p_limit      : NULL = ใช้ค่าจาก app_settings (leaderboard.size)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_leaderboard(
    p_level_band text DEFAULT NULL,
    p_limit      integer DEFAULT NULL
)
RETURNS TABLE (
    level_band      text,
    rank            bigint,
    student_id      bigint,
    student_code    text,
    display_name    text,
    classroom_label text,
    merit_total     integer,
    merit_count     integer,
    conduct_score   smallint
)
LANGUAGE plpgsql STABLE AS $$
DECLARE
    v_limit       integer;
    v_min_merit   integer;
    v_clean_scope text;
    v_year_id     smallint;
BEGIN
    SELECT id INTO v_year_id FROM academic_years WHERE is_current;
    IF v_year_id IS NULL THEN
        RAISE EXCEPTION 'ยังไม่ได้กำหนดปีการศึกษาปัจจุบันใน academic_years';
    END IF;

    v_limit := COALESCE(p_limit,
        (SELECT (value #>> '{}')::int FROM app_settings WHERE key = 'leaderboard.size'), 10);
    v_min_merit := COALESCE(
        (SELECT (value #>> '{}')::int FROM app_settings WHERE key = 'leaderboard.min_merit'), 1);
    v_clean_scope := COALESCE(
        (SELECT value #>> '{}' FROM app_settings WHERE key = 'leaderboard.clean_scope'), 'since_admission');

    RETURN QUERY
    WITH eligible AS (
        SELECT
            v.level_band,
            v.student_id,
            v.student_code,
            public_display_name(v.prefix, v.first_name, v.last_name, v.publish_consent) AS display_name,
            v.classroom_label,
            v.merit_total,
            v.merit_count,
            v.conduct_score,
            v.last_merit_at
        FROM v_student_current v
        JOIN v_student_lifetime_conduct lc ON lc.student_id = v.student_id
        WHERE v.status = 'active'
          AND v.conduct_score = 100
          AND v.merit_total >= v_min_merit
          AND CASE
                WHEN v_clean_scope = 'current_year' THEN v.demerit_count = 0
                ELSE lc.lifetime_demerit_count = 0
              END
          AND (p_level_band IS NULL OR v.level_band = p_level_band)
    ), ranked AS (
        SELECT e.*,
               ROW_NUMBER() OVER (
                   PARTITION BY e.level_band
                   ORDER BY e.merit_total DESC,
                            e.merit_count DESC,
                            e.last_merit_at ASC NULLS LAST,
                            e.student_code ASC
               ) AS rn
        FROM eligible e
    )
    SELECT r.level_band, r.rn, r.student_id, r.student_code, r.display_name,
           r.classroom_label, r.merit_total, r.merit_count, r.conduct_score
    FROM ranked r
    WHERE r.rn <= v_limit
    ORDER BY r.level_band, r.rn;
END;
$$;

COMMENT ON FUNCTION fn_leaderboard IS 'อันดับนักเรียนคะแนนความดีสูงสุดแยกตามระดับชั้น สำหรับแสดงหน้าหลัก';

-- ---------------------------------------------------------------------
-- สร้างสแนปช็อตอันดับ เพื่อให้หน้าเว็บสาธารณะอ่านจากข้อมูลที่ "นิ่ง"
-- และย้อนกลับไปตรวจสอบได้ว่าวันที่ประกาศ อันดับเป็นอย่างไร
-- เรียกจาก cron ตามค่า leaderboard.refresh_cron
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_build_leaderboard_snapshot(
    p_period_type text DEFAULT 'monthly',
    p_period_key  text DEFAULT to_char(now(), 'YYYY-MM')
) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
    v_year_id  smallint;
    v_band     text;
    v_snap_id  bigint;
    v_total    integer := 0;
BEGIN
    SELECT id INTO v_year_id FROM academic_years WHERE is_current;

    FOREACH v_band IN ARRAY ARRAY['lower', 'upper'] LOOP
        INSERT INTO leaderboard_snapshots
               (academic_year_id, level_band, period_type, period_key, criteria)
        VALUES (v_year_id, v_band, p_period_type, p_period_key,
                (SELECT jsonb_object_agg(key, value) FROM app_settings
                  WHERE key LIKE 'leaderboard.%'))
        ON CONFLICT (academic_year_id, level_band, period_type, period_key)
        DO UPDATE SET generated_at = now(),
                      criteria = EXCLUDED.criteria
        RETURNING id INTO v_snap_id;

        DELETE FROM leaderboard_entries WHERE snapshot_id = v_snap_id;

        INSERT INTO leaderboard_entries
               (snapshot_id, rank, student_id, display_name, classroom_label, merit_total, conduct_score)
        SELECT v_snap_id, l.rank, l.student_id, l.display_name,
               l.classroom_label, l.merit_total, l.conduct_score
        FROM fn_leaderboard(v_band) l;

        GET DIAGNOSTICS v_total = ROW_COUNT;
    END LOOP;

    RETURN v_total;
END;
$$;

-- ---------------------------------------------------------------------
-- คิวรีที่หน้าเว็บสาธารณะเรียกใช้จริง (อ่านจากสแนปช็อตล่าสุดที่เผยแพร่แล้ว)
-- ---------------------------------------------------------------------
-- SELECT s.level_band, e.rank, e.display_name, e.classroom_label, e.merit_total
-- FROM leaderboard_snapshots s
-- JOIN leaderboard_entries  e ON e.snapshot_id = s.id
-- WHERE s.academic_year_id = (SELECT id FROM academic_years WHERE is_current)
--   AND s.published_at IS NOT NULL
--   AND s.period_type = 'monthly'
--   AND s.period_key  = to_char(now(), 'YYYY-MM')
-- ORDER BY s.level_band, e.rank;
