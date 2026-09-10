-- =====================================================================
--  ระบบจัดเก็บข้อมูลความประพฤตินักเรียน โรงเรียนจุนวิทยาคม
--  Student Conduct Scoring System (SCSS) - Database Schema
--  PostgreSQL 14+
--
--  หลักการ:
--   1) แยกบัญชีคะแนนเป็น 2 ชุด  conduct (เพดาน 100) / merit (สะสมไม่มีเพดาน)
--   2) score_ledger เป็น append-only ตรวจสอบย้อนหลังได้ทุกรายการ
--   3) student_score_balances เป็นยอดสรุป (denormalized) สำหรับแสดงผลเร็ว
--      ปรับปรุงด้วย trigger จาก score_ledger เท่านั้น
-- =====================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =====================================================================
-- 1. ปีการศึกษา / ภาคเรียน / ค่าตั้งค่าระบบ
-- =====================================================================

CREATE TABLE academic_years (
    id          smallserial PRIMARY KEY,
    year_be     smallint    NOT NULL UNIQUE,      -- ปีการศึกษา พ.ศ. เช่น 2569
    start_date  date        NOT NULL,
    end_date    date        NOT NULL,
    is_current  boolean     NOT NULL DEFAULT false,
    CONSTRAINT academic_years_period_ck CHECK (end_date > start_date)
);
COMMENT ON TABLE academic_years IS 'ปีการศึกษา';
-- บังคับให้มีปีการศึกษาปัจจุบันได้เพียงปีเดียว
CREATE UNIQUE INDEX academic_years_single_current_idx
    ON academic_years (is_current) WHERE is_current;

CREATE TABLE terms (
    id                smallserial PRIMARY KEY,
    academic_year_id  smallint  NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
    term_no           smallint  NOT NULL CHECK (term_no IN (1, 2)),
    start_date        date      NOT NULL,
    end_date          date      NOT NULL,
    is_current        boolean   NOT NULL DEFAULT false,
    UNIQUE (academic_year_id, term_no)
);
COMMENT ON TABLE terms IS 'ภาคเรียน';

-- ค่าตั้งค่าระบบทั้งหมดเก็บที่นี่ ไม่ hard-code ในโปรแกรม
-- เช่น คะแนนตั้งต้น เพดานคะแนน จำนวนอันดับที่แสดง ขอบเขต "ไม่เคยกระทำผิด"
CREATE TABLE app_settings (
    key         text        PRIMARY KEY,
    value       jsonb       NOT NULL,
    description text,
    updated_by  bigint,
    updated_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE app_settings IS 'ค่าตั้งค่าระบบ (คะแนนตั้งต้น เพดานคะแนน กติกาหน้าหลัก ฯลฯ)';

-- =====================================================================
-- 2. ผู้ใช้งานและสิทธิ์
-- =====================================================================

CREATE TABLE users (
    id             bigserial   PRIMARY KEY,
    username       text        NOT NULL UNIQUE,
    password_hash  text,                         -- NULL ได้ถ้าใช้ SSO/Google Workspace
    full_name      text        NOT NULL,
    email          text,
    phone          text,
    line_user_id   text UNIQUE,                  -- สำหรับแจ้งเตือนผ่าน LINE
    is_active      boolean     NOT NULL DEFAULT true,
    must_change_pw boolean     NOT NULL DEFAULT false,
    last_login_at  timestamptz,
    created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE roles (
    code        text PRIMARY KEY,   -- admin, student_affairs, level_head, homeroom,
    name_th     text NOT NULL,      -- teacher, executive, student, guardian
    description text
);

CREATE TABLE user_roles (
    user_id   bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_code text   NOT NULL REFERENCES roles(code) ON DELETE CASCADE,
    -- ขอบเขตสิทธิ์ เช่น {"classroom_ids":[12,13]} หรือ {"grade_levels":[1,2,3]}
    scope     jsonb,
    granted_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, role_code)
);

CREATE TABLE teachers (
    id           bigserial PRIMARY KEY,
    user_id      bigint UNIQUE REFERENCES users(id) ON DELETE SET NULL,
    teacher_code text   UNIQUE,
    prefix       text,
    first_name   text   NOT NULL,
    last_name    text   NOT NULL,
    department   text,                            -- กลุ่มสาระ/ฝ่าย
    position     text,
    is_active    boolean NOT NULL DEFAULT true
);
COMMENT ON TABLE teachers IS 'ข้อมูลครูและบุคลากร';

-- =====================================================================
-- 3. นักเรียน ห้องเรียน การลงทะเบียนรายปี
-- =====================================================================

CREATE TABLE students (
    id                 bigserial   PRIMARY KEY,
    student_code       text        NOT NULL UNIQUE,   -- รหัสประจำตัวนักเรียน
    citizen_id_enc     bytea,                         -- เลขบัตรประชาชน (เข้ารหัสด้วย pgp_sym_encrypt)
    prefix             text,
    first_name         text        NOT NULL,
    last_name          text        NOT NULL,
    nickname           text,
    gender             text        CHECK (gender IN ('ชาย', 'หญิง', 'ไม่ระบุ')),
    birthdate          date,
    photo_path         text,

    entry_year_id      smallint    NOT NULL REFERENCES academic_years(id),
    entry_grade        smallint    NOT NULL CHECK (entry_grade BETWEEN 1 AND 6),
    -- new = เข้าใหม่ ม.1/ม.4 (ได้คะแนนตั้งต้น 100)
    -- transfer_in = ย้ายเข้าระหว่างชั้น (นโยบายคะแนนตั้งต้นดู app_settings)
    admission_type     text        NOT NULL DEFAULT 'new'
                                   CHECK (admission_type IN ('new', 'transfer_in')),
    admitted_on        date,

    status             text        NOT NULL DEFAULT 'active'
                                   CHECK (status IN ('active','graduated','transferred_out','on_leave','dropped')),
    status_changed_on  date,

    -- PDPA: ความยินยอมให้เผยแพร่ชื่อ-ภาพบนหน้าเว็บสาธารณะ (กระดานเกียรติยศ)
    publish_consent    boolean     NOT NULL DEFAULT false,
    publish_consent_at timestamptz,
    publish_consent_by text,                          -- ผู้ให้ความยินยอม (ผู้ปกครอง)

    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN students.publish_consent IS
    'ความยินยอมตาม PDPA ให้เผยแพร่ชื่อ-สกุล/ภาพ ต่อสาธารณะ ถ้า false ระบบจะปกปิดชื่อบางส่วน';
CREATE INDEX students_name_idx ON students (last_name, first_name);
CREATE INDEX students_status_idx ON students (status) WHERE status = 'active';

CREATE TABLE classrooms (
    id               bigserial PRIMARY KEY,
    academic_year_id smallint NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
    grade_level      smallint NOT NULL CHECK (grade_level BETWEEN 1 AND 6),
    room_no          smallint NOT NULL CHECK (room_no > 0),
    program          text,                       -- แผนการเรียน เช่น วิทย์-คณิต
    UNIQUE (academic_year_id, grade_level, room_no)
);
COMMENT ON TABLE classrooms IS 'ห้องเรียนรายปีการศึกษา';

-- ระดับ (ต้น/ปลาย) คำนวณจาก grade_level - ใช้ทั่วระบบ ไม่เก็บซ้ำ
CREATE OR REPLACE FUNCTION level_band(p_grade smallint)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE WHEN p_grade BETWEEN 1 AND 3 THEN 'lower' ELSE 'upper' END;
$$;
COMMENT ON FUNCTION level_band IS 'lower = มัธยมศึกษาตอนต้น (ม.1-3), upper = ตอนปลาย (ม.4-6)';

CREATE TABLE classroom_advisors (
    classroom_id bigint NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
    teacher_id   bigint NOT NULL REFERENCES teachers(id)   ON DELETE CASCADE,
    PRIMARY KEY (classroom_id, teacher_id)
);
COMMENT ON TABLE classroom_advisors IS 'ครูที่ปรึกษาประจำห้อง (มีได้มากกว่า 1 คน)';

CREATE TABLE enrollments (
    id               bigserial PRIMARY KEY,
    student_id       bigint   NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    academic_year_id smallint NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
    classroom_id     bigint   NOT NULL REFERENCES classrooms(id),
    seat_no          smallint,                   -- เลขที่ในห้อง
    enrolled_on      date     NOT NULL DEFAULT CURRENT_DATE,
    UNIQUE (student_id, academic_year_id),
    UNIQUE (classroom_id, seat_no)
);
COMMENT ON TABLE enrollments IS 'การลงทะเบียนเรียนรายปี (นักเรียน 1 คน ต่อ 1 ห้อง ต่อปีการศึกษา)';
CREATE INDEX enrollments_classroom_idx ON enrollments (classroom_id);

CREATE TABLE guardians (
    id           bigserial PRIMARY KEY,
    user_id      bigint REFERENCES users(id) ON DELETE SET NULL,
    full_name    text NOT NULL,
    phone        text,
    email        text,
    line_user_id text,
    address      text
);

CREATE TABLE student_guardians (
    student_id  bigint NOT NULL REFERENCES students(id)  ON DELETE CASCADE,
    guardian_id bigint NOT NULL REFERENCES guardians(id) ON DELETE CASCADE,
    relation    text,                            -- บิดา/มารดา/ผู้ปกครอง
    is_primary  boolean NOT NULL DEFAULT false,
    PRIMARY KEY (student_id, guardian_id)
);

-- =====================================================================
-- 4. หลักเกณฑ์คะแนน (กติกาของโรงเรียน)
-- =====================================================================

CREATE TABLE rule_categories (
    code       text PRIMARY KEY,                 -- เช่น DRESS, LATE, VOLUNTEER
    name_th    text NOT NULL,
    kind       text NOT NULL CHECK (kind IN ('merit', 'demerit')),
    sort_order smallint NOT NULL DEFAULT 0
);
COMMENT ON TABLE rule_categories IS 'หมวดหมู่หลักเกณฑ์';

-- เก็บเป็น "เวอร์ชัน" เพราะระเบียบโรงเรียนแก้ไขได้ทุกปี
-- แต่บันทึกเก่าต้องอ้างอิงเกณฑ์ที่ใช้ ณ วันนั้นเสมอ
CREATE TABLE behavior_rules (
    id                bigserial PRIMARY KEY,
    code              text     NOT NULL,         -- M-101 (ความดี) / D-201 (ความผิด)
    version           smallint NOT NULL DEFAULT 1,
    category_code     text     NOT NULL REFERENCES rule_categories(code),
    kind              text     NOT NULL CHECK (kind IN ('merit', 'demerit')),
    name_th           text     NOT NULL,
    description       text,
    points            smallint NOT NULL CHECK (points > 0),  -- เป็นบวกเสมอ ทิศทางดูจาก kind
    severity          smallint CHECK (severity BETWEEN 1 AND 4), -- 1 เบา .. 4 ร้ายแรงมาก
    -- คุณลักษณะอันพึงประสงค์ 8 ประการ (ใช้ส่งต่อรายงาน ปพ. และ SAR)
    desired_trait     text,
    legal_ref         text,                      -- อ้างอิงระเบียบ/ประกาศ
    requires_evidence boolean  NOT NULL DEFAULT false,
    requires_approval boolean  NOT NULL DEFAULT true,
    max_per_term      smallint,                  -- เพดานจำนวนครั้งต่อภาคเรียน (กันคะแนนเฟ้อ)
    effective_from    date     NOT NULL DEFAULT CURRENT_DATE,
    effective_to      date,
    is_active         boolean  NOT NULL DEFAULT true,
    created_at        timestamptz NOT NULL DEFAULT now(),
    UNIQUE (code, version),
    CONSTRAINT behavior_rules_severity_ck
        CHECK ((kind = 'demerit' AND severity IS NOT NULL) OR kind = 'merit')
);
COMMENT ON TABLE behavior_rules IS 'หลักเกณฑ์การเพิ่ม/หักคะแนน (เก็บเป็นเวอร์ชัน)';
CREATE INDEX behavior_rules_active_idx ON behavior_rules (kind, is_active);

-- เกณฑ์คะแนนคงเหลือ -> ระดับความเสี่ยง -> การดำเนินการที่ต้องทำ
CREATE TABLE score_thresholds (
    id              smallserial PRIMARY KEY,
    min_score       smallint NOT NULL,
    max_score       smallint NOT NULL,
    risk_level      text     NOT NULL,           -- ปกติ/เฝ้าระวัง/เสี่ยง/วิกฤต
    action_required text     NOT NULL,
    notify_roles    text[]   NOT NULL DEFAULT '{}',
    color_hex       text,
    CONSTRAINT score_thresholds_range_ck CHECK (max_score >= min_score)
);
COMMENT ON TABLE score_thresholds IS 'เกณฑ์คะแนนคงเหลือและการดำเนินการตามระดับ';

-- =====================================================================
-- 5. บันทึกพฤติกรรม (ตารางแกนกลางของระบบ)
-- =====================================================================

CREATE TABLE behavior_records (
    id                   bigserial   PRIMARY KEY,
    record_no            text        UNIQUE,     -- เลขที่บันทึก เช่น BR-2569-000123
    student_id           bigint      NOT NULL REFERENCES students(id),
    academic_year_id     smallint    NOT NULL REFERENCES academic_years(id),
    term_id              smallint    REFERENCES terms(id),
    classroom_id         bigint      REFERENCES classrooms(id),  -- ห้อง ณ เวลาที่บันทึก
    rule_id              bigint      NOT NULL REFERENCES behavior_rules(id),

    kind                 text        NOT NULL CHECK (kind IN ('merit', 'demerit')),
    points               smallint    NOT NULL CHECK (points > 0),  -- snapshot จากกติกา
    occurred_at          timestamptz NOT NULL,
    location             text,
    detail               text        NOT NULL,
    witness              text,

    reported_by          bigint      NOT NULL REFERENCES users(id),
    reported_at          timestamptz NOT NULL DEFAULT now(),

    status               text        NOT NULL DEFAULT 'submitted'
        CHECK (status IN ('draft','submitted','approved','rejected','appealed','revoked')),
    reviewed_by          bigint      REFERENCES users(id),
    reviewed_at          timestamptz,
    review_note          text,

    guardian_notified_at timestamptz,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT behavior_records_reviewed_ck
        CHECK (status NOT IN ('approved','rejected') OR reviewed_by IS NOT NULL)
);
COMMENT ON TABLE behavior_records IS 'บันทึกเหตุการณ์พฤติกรรมนักเรียน (ทั้งความดีและความผิด)';
CREATE INDEX behavior_records_student_idx  ON behavior_records (student_id, occurred_at DESC);
CREATE INDEX behavior_records_year_idx     ON behavior_records (academic_year_id, kind, status);
CREATE INDEX behavior_records_pending_idx  ON behavior_records (status) WHERE status = 'submitted';
CREATE INDEX behavior_records_reporter_idx ON behavior_records (reported_by, reported_at DESC);

CREATE TABLE attachments (
    id                 bigserial PRIMARY KEY,
    behavior_record_id bigint  NOT NULL REFERENCES behavior_records(id) ON DELETE CASCADE,
    file_path          text    NOT NULL,
    file_name          text    NOT NULL,
    mime_type          text,
    file_size          integer,
    sha256             text,                     -- ตรวจความถูกต้องของไฟล์หลักฐาน
    uploaded_by        bigint  REFERENCES users(id),
    uploaded_at        timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE attachments IS 'ไฟล์หลักฐานประกอบบันทึก (ต้องจำกัดสิทธิ์การเข้าถึงอย่างเข้มงวด)';

-- =====================================================================
-- 6. บัญชีคะแนน (Ledger) และยอดสรุป
-- =====================================================================

-- ตารางนี้เป็น APPEND-ONLY: ห้าม UPDATE/DELETE (บังคับด้วย trigger ด้านล่าง)
-- การแก้ไขที่ผิดพลาดให้บันทึกรายการกลับรายการ (entry_type = 'adjust') แทน
CREATE TABLE score_ledger (
    id                 bigserial   PRIMARY KEY,
    student_id         bigint      NOT NULL REFERENCES students(id),
    academic_year_id   smallint    NOT NULL REFERENCES academic_years(id),
    -- conduct = คะแนนความประพฤติ (เพดาน 100 ใช้ตัดสินทางวินัย)
    -- merit   = คะแนนความดีสะสม (ไม่มีเพดาน ใช้จัดอันดับ)
    account            text        NOT NULL CHECK (account IN ('conduct', 'merit')),
    entry_type         text        NOT NULL
        CHECK (entry_type IN ('initial','merit','demerit','restore','adjust','carry_over')),
    points_delta       smallint    NOT NULL CHECK (points_delta <> 0),
    balance_after      smallint    NOT NULL,
    behavior_record_id bigint      REFERENCES behavior_records(id),
    reason             text        NOT NULL,
    effective_at       timestamptz NOT NULL DEFAULT now(),
    created_by         bigint      REFERENCES users(id),
    created_at         timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE score_ledger IS 'บัญชีเดินคะแนน แบบ append-only ตรวจสอบย้อนหลังได้ทุกรายการ';
CREATE INDEX score_ledger_student_idx ON score_ledger (student_id, account, effective_at DESC);
-- กันการลงคะแนนซ้ำจากบันทึกเดียวกันในบัญชีเดียวกัน
CREATE UNIQUE INDEX score_ledger_no_double_post_idx
    ON score_ledger (behavior_record_id, account, entry_type)
    WHERE behavior_record_id IS NOT NULL;

CREATE OR REPLACE FUNCTION trg_score_ledger_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'score_ledger เป็น append-only ห้ามแก้ไขหรือลบ (ให้บันทึกรายการปรับปรุงแทน)';
END;
$$;

CREATE TRIGGER score_ledger_immutable
    BEFORE UPDATE OR DELETE ON score_ledger
    FOR EACH ROW EXECUTE FUNCTION trg_score_ledger_immutable();

-- ยอดสรุปรายปีการศึกษา (denormalized เพื่อความเร็วในการแสดงผลและจัดอันดับ)
CREATE TABLE student_score_balances (
    student_id       bigint      NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    academic_year_id smallint    NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
    conduct_score    smallint    NOT NULL DEFAULT 100,   -- 0-100
    merit_total      integer     NOT NULL DEFAULT 0,     -- คะแนนความดีสะสมปีนี้
    demerit_total    integer     NOT NULL DEFAULT 0,     -- คะแนนที่ถูกหักรวมปีนี้
    restored_total   integer     NOT NULL DEFAULT 0,     -- คะแนนที่กู้คืนได้ปีนี้
    merit_count      integer     NOT NULL DEFAULT 0,
    demerit_count    integer     NOT NULL DEFAULT 0,
    last_merit_at    timestamptz,
    last_demerit_at  timestamptz,
    risk_level       text        NOT NULL DEFAULT 'ปกติ',
    updated_at       timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (student_id, academic_year_id),
    CONSTRAINT ssb_conduct_range_ck CHECK (conduct_score BETWEEN 0 AND 100)
);
COMMENT ON TABLE student_score_balances IS 'ยอดคะแนนคงเหลือรายปี (สร้างจาก score_ledger เท่านั้น)';
CREATE INDEX ssb_rank_idx ON student_score_balances (academic_year_id, merit_total DESC);
CREATE INDEX ssb_risk_idx ON student_score_balances (academic_year_id, conduct_score);

-- =====================================================================
-- 6.1 กลไกลงบัญชีคะแนน (หัวใจของระบบ)
--     กฎ:
--      - บันทึกจะมีผลต่อคะแนนก็ต่อเมื่อ status = 'approved' เท่านั้น
--      - ความดี: บวกเข้าบัญชี merit เต็มจำนวนเสมอ (ไม่มีเพดาน)
--                และบวกเข้าบัญชี conduct เท่าที่ยังไม่ชนเพดาน 100
--      - ความผิด: หักบัญชี conduct (ไม่ต่ำกว่า 0) แต่ "ไม่" ลบบัญชี merit
--                  เพราะความดีที่ทำไปแล้วไม่ควรถูกลบทิ้ง
--      - การเพิกถอนบันทึก (revoked/อุทธรณ์สำเร็จ) ลงรายการกลับ entry_type = 'adjust'
-- =====================================================================

-- สร้างยอดตั้งต้น 100 คะแนนให้นักเรียน ณ ปีการศึกษาที่ระบุ (idempotent)
CREATE OR REPLACE FUNCTION fn_ensure_balance(p_student_id bigint, p_year_id smallint)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
    v_initial smallint;
BEGIN
    IF EXISTS (SELECT 1 FROM student_score_balances
                WHERE student_id = p_student_id AND academic_year_id = p_year_id) THEN
        RETURN;
    END IF;

    v_initial := COALESCE(
        (SELECT (value #>> '{}')::smallint FROM app_settings WHERE key = 'score.initial'), 100);

    INSERT INTO student_score_balances (student_id, academic_year_id, conduct_score)
    VALUES (p_student_id, p_year_id, v_initial);

    INSERT INTO score_ledger (student_id, academic_year_id, account, entry_type,
                              points_delta, balance_after, reason)
    VALUES (p_student_id, p_year_id, 'conduct', 'initial',
            v_initial, v_initial, 'คะแนนความประพฤติตั้งต้นเมื่อแรกเข้า');
END;
$$;

-- ปรับระดับความเสี่ยงตามตาราง score_thresholds
CREATE OR REPLACE FUNCTION fn_refresh_risk_level(p_student_id bigint, p_year_id smallint)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    UPDATE student_score_balances b
       SET risk_level = COALESCE(
             (SELECT th.risk_level FROM score_thresholds th
               WHERE b.conduct_score BETWEEN th.min_score AND th.max_score
               ORDER BY th.min_score DESC LIMIT 1), 'ปกติ'),
           updated_at = now()
     WHERE b.student_id = p_student_id AND b.academic_year_id = p_year_id;
END;
$$;

-- ลงบัญชีคะแนนจากบันทึกที่ได้รับอนุมัติ
CREATE OR REPLACE FUNCTION fn_post_behavior_record(p_record_id bigint)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
    r              behavior_records%ROWTYPE;
    v_conduct_old  smallint;
    v_conduct_new  smallint;
    v_merit_old    integer;
    v_max          smallint;
    v_min          smallint;
BEGIN
    SELECT * INTO r FROM behavior_records WHERE id = p_record_id;
    IF NOT FOUND OR r.status <> 'approved' THEN
        RETURN;
    END IF;

    PERFORM fn_ensure_balance(r.student_id, r.academic_year_id);

    v_max := COALESCE((SELECT (value #>> '{}')::smallint FROM app_settings
                        WHERE key = 'score.conduct_max'), 100);
    v_min := COALESCE((SELECT (value #>> '{}')::smallint FROM app_settings
                        WHERE key = 'score.conduct_min'), 0);

    SELECT conduct_score, merit_total INTO v_conduct_old, v_merit_old
      FROM student_score_balances
     WHERE student_id = r.student_id AND academic_year_id = r.academic_year_id
       FOR UPDATE;

    IF r.kind = 'merit' THEN
        -- บัญชีความดีสะสม: บวกเต็มจำนวน ไม่มีเพดาน
        INSERT INTO score_ledger (student_id, academic_year_id, account, entry_type,
                                  points_delta, balance_after, behavior_record_id,
                                  reason, effective_at, created_by)
        VALUES (r.student_id, r.academic_year_id, 'merit', 'merit',
                r.points, v_merit_old + r.points, r.id,
                'คะแนนความดีตามบันทึก ' || COALESCE(r.record_no, r.id::text),
                r.occurred_at, r.reviewed_by);

        -- บัญชีความประพฤติ: บวกเท่าที่ยังไม่ชนเพดาน
        v_conduct_new := LEAST(v_max, v_conduct_old + r.points);
        IF v_conduct_new <> v_conduct_old THEN
            INSERT INTO score_ledger (student_id, academic_year_id, account, entry_type,
                                      points_delta, balance_after, behavior_record_id,
                                      reason, effective_at, created_by)
            VALUES (r.student_id, r.academic_year_id, 'conduct', 'merit',
                    v_conduct_new - v_conduct_old, v_conduct_new, r.id,
                    'คืนคะแนนความประพฤติจากการทำความดี', r.occurred_at, r.reviewed_by);
        END IF;

        UPDATE student_score_balances
           SET conduct_score = v_conduct_new,
               merit_total   = merit_total + r.points,
               merit_count   = merit_count + 1,
               last_merit_at = GREATEST(COALESCE(last_merit_at, r.occurred_at), r.occurred_at),
               updated_at    = now()
         WHERE student_id = r.student_id AND academic_year_id = r.academic_year_id;

    ELSE  -- demerit
        v_conduct_new := GREATEST(v_min, v_conduct_old - r.points);
        INSERT INTO score_ledger (student_id, academic_year_id, account, entry_type,
                                  points_delta, balance_after, behavior_record_id,
                                  reason, effective_at, created_by)
        VALUES (r.student_id, r.academic_year_id, 'conduct', 'demerit',
                v_conduct_new - v_conduct_old, v_conduct_new, r.id,
                'หักคะแนนตามบันทึก ' || COALESCE(r.record_no, r.id::text),
                r.occurred_at, r.reviewed_by);

        UPDATE student_score_balances
           SET conduct_score   = v_conduct_new,
               demerit_total   = demerit_total + r.points,
               demerit_count   = demerit_count + 1,
               last_demerit_at = GREATEST(COALESCE(last_demerit_at, r.occurred_at), r.occurred_at),
               updated_at      = now()
         WHERE student_id = r.student_id AND academic_year_id = r.academic_year_id;
    END IF;

    PERFORM fn_refresh_risk_level(r.student_id, r.academic_year_id);
END;
$$;

-- กลับรายการเมื่อบันทึกถูกเพิกถอนหรืออุทธรณ์สำเร็จ
CREATE OR REPLACE FUNCTION fn_reverse_behavior_record(p_record_id bigint, p_reason text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
    r         behavior_records%ROWTYPE;
    l         score_ledger%ROWTYPE;
    v_balance integer;
BEGIN
    SELECT * INTO r FROM behavior_records WHERE id = p_record_id;
    IF NOT FOUND THEN RETURN; END IF;

    FOR l IN SELECT * FROM score_ledger
              WHERE behavior_record_id = p_record_id AND entry_type <> 'adjust'
              ORDER BY id DESC
    LOOP
        SELECT CASE l.account WHEN 'conduct' THEN conduct_score ELSE merit_total END
          INTO v_balance
          FROM student_score_balances
         WHERE student_id = r.student_id AND academic_year_id = r.academic_year_id
           FOR UPDATE;

        INSERT INTO score_ledger (student_id, academic_year_id, account, entry_type,
                                  points_delta, balance_after, behavior_record_id, reason, created_by)
        VALUES (l.student_id, l.academic_year_id, l.account, 'adjust',
                -l.points_delta, v_balance - l.points_delta, p_record_id,
                COALESCE(p_reason, 'กลับรายการบันทึกที่ถูกเพิกถอน'), r.reviewed_by);

        IF l.account = 'conduct' THEN
            UPDATE student_score_balances
               SET conduct_score = conduct_score - l.points_delta, updated_at = now()
             WHERE student_id = r.student_id AND academic_year_id = r.academic_year_id;
        ELSE
            UPDATE student_score_balances
               SET merit_total = merit_total - l.points_delta, updated_at = now()
             WHERE student_id = r.student_id AND academic_year_id = r.academic_year_id;
        END IF;
    END LOOP;

    UPDATE student_score_balances
       SET merit_count   = merit_count   - (CASE WHEN r.kind = 'merit'   THEN 1 ELSE 0 END),
           demerit_count = demerit_count - (CASE WHEN r.kind = 'demerit' THEN 1 ELSE 0 END),
           merit_total   = merit_total,
           demerit_total = demerit_total - (CASE WHEN r.kind = 'demerit' THEN r.points ELSE 0 END),
           updated_at    = now()
     WHERE student_id = r.student_id AND academic_year_id = r.academic_year_id;

    PERFORM fn_refresh_risk_level(r.student_id, r.academic_year_id);
END;
$$;

-- ลงบัญชี/กลับรายการอัตโนมัติเมื่อสถานะบันทึกเปลี่ยน
CREATE OR REPLACE FUNCTION trg_behavior_record_status()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status = 'approved' AND COALESCE(OLD.status, '') <> 'approved' THEN
        PERFORM fn_post_behavior_record(NEW.id);
    ELSIF OLD.status = 'approved' AND NEW.status = 'revoked' THEN
        PERFORM fn_reverse_behavior_record(NEW.id, NEW.review_note);
    END IF;
    RETURN NULL;
END;
$$;

CREATE TRIGGER behavior_record_status_change
    AFTER INSERT OR UPDATE OF status ON behavior_records
    FOR EACH ROW EXECUTE FUNCTION trg_behavior_record_status();

-- =====================================================================
-- 7. การลงโทษ การแก้ไขพฤติกรรม และการอุทธรณ์
-- =====================================================================

-- ประเภทการลงโทษตามระเบียบกระทรวงศึกษาธิการ ว่าด้วยการลงโทษนักเรียนและนักศึกษา พ.ศ. 2548
CREATE TABLE disciplinary_actions (
    id                 bigserial   PRIMARY KEY,
    student_id         bigint      NOT NULL REFERENCES students(id),
    behavior_record_id bigint      REFERENCES behavior_records(id),
    action_type        text        NOT NULL CHECK (action_type IN (
                           'ว่ากล่าวตักเตือน',
                           'ทำทัณฑ์บน',
                           'ตัดคะแนนความประพฤติ',
                           'ทำกิจกรรมเพื่อให้ปรับเปลี่ยนพฤติกรรม')),
    detail             text        NOT NULL,
    ordered_by         bigint      NOT NULL REFERENCES users(id),
    ordered_at         timestamptz NOT NULL DEFAULT now(),
    start_date         date,
    end_date           date,
    guardian_ack_at    timestamptz,              -- ผู้ปกครองรับทราบเมื่อใด
    guardian_ack_by    text,
    status             text        NOT NULL DEFAULT 'active'
                                   CHECK (status IN ('active','completed','cancelled'))
);
COMMENT ON TABLE disciplinary_actions IS 'การลงโทษตามระเบียบ ศธ. ว่าด้วยการลงโทษนักเรียนฯ พ.ศ. 2548';

-- แผนแก้ไขพฤติกรรม / กิจกรรมกู้คืนคะแนน
CREATE TABLE improvement_plans (
    id              bigserial   PRIMARY KEY,
    student_id      bigint      NOT NULL REFERENCES students(id),
    academic_year_id smallint   NOT NULL REFERENCES academic_years(id),
    title           text        NOT NULL,
    activity_detail text        NOT NULL,
    target_hours    numeric(5,1),
    restore_points  smallint    CHECK (restore_points > 0),  -- คะแนนที่จะได้คืนเมื่อสำเร็จ
    assigned_by     bigint      NOT NULL REFERENCES users(id),
    supervisor_id   bigint      REFERENCES teachers(id),
    start_date      date,
    due_date        date,
    completed_at    timestamptz,
    verified_by     bigint      REFERENCES users(id),
    status          text        NOT NULL DEFAULT 'assigned'
                                CHECK (status IN ('assigned','in_progress','completed','verified','failed','cancelled'))
);
COMMENT ON TABLE improvement_plans IS 'แผนปรับเปลี่ยนพฤติกรรมและการกู้คืนคะแนน';

CREATE TABLE appeals (
    id                 bigserial   PRIMARY KEY,
    behavior_record_id bigint      NOT NULL REFERENCES behavior_records(id) ON DELETE CASCADE,
    filed_by           bigint      NOT NULL REFERENCES users(id),
    filed_at           timestamptz NOT NULL DEFAULT now(),
    reason             text        NOT NULL,
    decision           text        CHECK (decision IN ('upheld','reduced','revoked')),
    decision_note      text,
    decided_by         bigint      REFERENCES users(id),
    decided_at         timestamptz,
    status             text        NOT NULL DEFAULT 'open'
                                   CHECK (status IN ('open','under_review','closed'))
);
COMMENT ON TABLE appeals IS 'การอุทธรณ์ผลการหักคะแนน (สิทธิของนักเรียน/ผู้ปกครอง)';

-- =====================================================================
-- 8. การแจ้งเตือน
-- =====================================================================

CREATE TABLE notifications (
    id           bigserial   PRIMARY KEY,
    recipient_type text      NOT NULL CHECK (recipient_type IN ('user','guardian')),
    recipient_id text        NOT NULL,
    channel      text        NOT NULL CHECK (channel IN ('in_app','line','email','sms')),
    template_code text,
    subject      text,
    body         text        NOT NULL,
    ref_table    text,
    ref_id       bigint,
    status       text        NOT NULL DEFAULT 'queued'
                             CHECK (status IN ('queued','sent','failed','read')),
    error_detail text,
    scheduled_at timestamptz NOT NULL DEFAULT now(),
    sent_at      timestamptz,
    read_at      timestamptz
);
CREATE INDEX notifications_queue_idx ON notifications (status, scheduled_at)
    WHERE status = 'queued';

-- =====================================================================
-- 9. กระดานเกียรติยศ (สแนปช็อตอันดับ) และการยกย่อง
-- =====================================================================

-- เก็บสแนปช็อตเพื่อให้อันดับที่ประกาศไปแล้ว "นิ่ง" ตรวจสอบย้อนหลังได้
-- และหน้าเว็บสาธารณะอ่านจากตารางนี้ ไม่ต้องคิวรีตารางคะแนนสดตลอดเวลา
CREATE TABLE leaderboard_snapshots (
    id               bigserial   PRIMARY KEY,
    academic_year_id smallint    NOT NULL REFERENCES academic_years(id),
    level_band       text        NOT NULL CHECK (level_band IN ('lower','upper')),
    period_type      text        NOT NULL CHECK (period_type IN ('weekly','monthly','term','year')),
    period_key       text        NOT NULL,       -- เช่น 2569-08 หรือ 2569-T1
    criteria         jsonb       NOT NULL,       -- บันทึกกติกาที่ใช้ ณ ตอนนั้น
    generated_at     timestamptz NOT NULL DEFAULT now(),
    published_at     timestamptz,
    UNIQUE (academic_year_id, level_band, period_type, period_key)
);

CREATE TABLE leaderboard_entries (
    snapshot_id     bigint   NOT NULL REFERENCES leaderboard_snapshots(id) ON DELETE CASCADE,
    rank            smallint NOT NULL CHECK (rank > 0),
    student_id      bigint   NOT NULL REFERENCES students(id),
    display_name    text     NOT NULL,           -- ชื่อที่แสดง (ปกปิดแล้วถ้าไม่ยินยอม)
    classroom_label text,
    merit_total     integer  NOT NULL,
    conduct_score   smallint NOT NULL,
    PRIMARY KEY (snapshot_id, rank),
    UNIQUE (snapshot_id, student_id)
);

CREATE TABLE honor_awards (
    id               bigserial PRIMARY KEY,
    student_id       bigint   NOT NULL REFERENCES students(id),
    academic_year_id smallint NOT NULL REFERENCES academic_years(id),
    award_type       text     NOT NULL,          -- เกียรติบัตร/โล่/ประกาศเกียรติคุณ
    title            text     NOT NULL,
    awarded_on       date     NOT NULL,
    certificate_no   text,
    issued_by        bigint   REFERENCES users(id)
);
COMMENT ON TABLE honor_awards IS 'การยกย่องเชิดชูเกียรตินักเรียน';

-- =====================================================================
-- 10. ร่องรอยการตรวจสอบ (Audit)
-- =====================================================================

CREATE TABLE audit_logs (
    id          bigserial   PRIMARY KEY,
    actor_id    bigint      REFERENCES users(id),
    actor_role  text,
    action      text        NOT NULL,            -- create/update/delete/approve/export/login
    table_name  text        NOT NULL,
    record_id   text,
    old_value   jsonb,
    new_value   jsonb,
    ip_address  inet,
    user_agent  text,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_lookup_idx ON audit_logs (table_name, record_id, created_at DESC);
CREATE INDEX audit_logs_actor_idx  ON audit_logs (actor_id, created_at DESC);

-- =====================================================================
-- 11. VIEW สำหรับใช้งานทั่วไป
-- =====================================================================

-- นักเรียนพร้อมห้องเรียนและคะแนนในปีการศึกษาปัจจุบัน
CREATE OR REPLACE VIEW v_student_current AS
SELECT
    s.id                AS student_id,
    s.student_code,
    s.prefix,
    s.first_name,
    s.last_name,
    s.prefix || s.first_name || ' ' || s.last_name AS full_name,
    s.status,
    s.publish_consent,
    ay.id               AS academic_year_id,
    ay.year_be,
    c.grade_level,
    c.room_no,
    'ม.' || c.grade_level || '/' || c.room_no AS classroom_label,
    level_band(c.grade_level) AS level_band,
    e.seat_no,
    COALESCE(b.conduct_score, 100)::smallint AS conduct_score,
    COALESCE(b.merit_total, 0)::integer      AS merit_total,
    COALESCE(b.demerit_total, 0)::integer    AS demerit_total,
    COALESCE(b.merit_count, 0)::integer      AS merit_count,
    COALESCE(b.demerit_count, 0)::integer    AS demerit_count,
    b.last_merit_at,
    COALESCE(b.risk_level, 'ปกติ') AS risk_level
FROM students s
JOIN academic_years ay ON ay.is_current
JOIN enrollments e     ON e.student_id = s.id AND e.academic_year_id = ay.id
JOIN classrooms c      ON c.id = e.classroom_id
LEFT JOIN student_score_balances b
       ON b.student_id = s.id AND b.academic_year_id = ay.id;

-- ประวัติการกระทำผิดสะสมตลอดชีวิตการเป็นนักเรียน (ใช้คัดกรองกระดานเกียรติยศ)
CREATE OR REPLACE VIEW v_student_lifetime_conduct AS
SELECT
    s.id AS student_id,
    COUNT(*) FILTER (WHERE r.kind = 'demerit' AND r.status = 'approved') AS lifetime_demerit_count,
    COALESCE(SUM(r.points) FILTER (WHERE r.kind = 'demerit' AND r.status = 'approved'), 0)
                                                                        AS lifetime_demerit_points,
    COUNT(*) FILTER (WHERE r.kind = 'merit'   AND r.status = 'approved') AS lifetime_merit_count,
    COALESCE(SUM(r.points) FILTER (WHERE r.kind = 'merit' AND r.status = 'approved'), 0)
                                                                        AS lifetime_merit_points,
    MAX(r.occurred_at) FILTER (WHERE r.kind = 'demerit' AND r.status = 'approved')
                                                                        AS last_demerit_at
FROM students s
LEFT JOIN behavior_records r ON r.student_id = s.id
GROUP BY s.id;

COMMIT;
