/**
 * Regenerates data/case_001.json from the Principal Clinical Pharmacotherapist
 * dataset (Acute Non-Variceal UGIB, NSAID-induced duodenal ulcer, Forrest Ib).
 *
 * SPOILER POLICY applied throughout:
 *   - Raw clinical data is preserved in full (values, units, reference ranges,
 *     endoscopic findings). None of it is cut — the learner needs it to reason.
 *   - Interpretations of that data are NOT student-facing, because every one of
 *     them is the answer to a question the case then asks. The source document's
 *     "Pharmacotherapist's Note", "Clinical Summary", the lab "Diagnostic Flags
 *     & Insights" column, the vitals "การแปลผลทางคลินิก" column and the CPG
 *     "บทสรุปในเคสนี้ [CORRECT]/[INCORRECT]" column are therefore kept out of the
 *     player-visible content and preserved under `authoring_notes` instead.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const OUT = path.join('C:/Users/User/Desktop/edgeone-bundle', 'data', 'case_001.json');

// ── helpers ─────────────────────────────────────────────────────
const h = t => `<strong>${t}</strong>`;

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

/** Deterministic PRNG (mulberry32) seeded from the step id. */
function seeded(str) {
    let a = 1779033703;
    for (let i = 0; i < str.length; i++) {
        a = Math.imul(a ^ str.charCodeAt(i), 3432918353);
        a = (a << 13) | (a >>> 19);
    }
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Shuffles a step's options and re-letters them A–G.
 *
 * Authored in blueprint order, every step had option A correct, the correct
 * answers bunched at the top, and the fatal trap sitting at G. Three free hints:
 * a learner who spotted any of them could score without reading the clinical
 * content at all. The shuffle is seeded from the step id so the ordering is
 * stable across rebuilds (no spurious JSON diffs) but unguessable from position.
 */
function shuffleChoices(stepId, choices) {
    const rand = seeded(stepId);
    const out = choices.slice();
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out.map((c, i) => Object.assign({}, c, { id: LETTERS[i] }));
}

/**
 * Builds a 7-option multi-select step.
 * `correct` = ids scoring +point_per_correct; every other pick costs
 * point_penalty. There is no select_count: telling the learner how many
 * answers are right is the single largest hint in the whole UI.
 */
function step(question, patientState, choices, rationale, feedback) {
    return {
        type: 'mcq_multi',
        question,
        patient_state: patientState,
        point_per_correct: 100,
        point_penalty: 50,
        point_value: choices.filter(c => c.is_correct).length * 100,
        // `choices` / `correct_answers` are filled in by finalise() below, which
        // shuffles the options so their position carries no information.
        choices,
        correct_answers: null,
        clinical_rationale: rationale,
        feedback
    };
}
const ok  = (id, text) => ({ id, text, is_correct: true });
const no  = (id, text) => ({ id, text, is_correct: false });
const fat = (id, text, fatal_message) => ({ id, text, is_correct: false, is_fatal: true, fatal_message });

// ── SUBJECTIVE ──────────────────────────────────────────────────
// Every clinical term carries a Thai gloss in parentheses on first use, so a
// student is never blocked by vocabulary while reasoning about the case.
const subjective = [
    h('PATIENT PROFILE (ข้อมูลผู้ป่วย)'),
    'ชายไทย อายุ 55 ปี · อาชีพพนักงานขับรถบรรทุกส่งสินค้าทางไกล · รูปแบบงาน: ขับรถระยะทางไกล พักผ่อนไม่เป็นเวลา',
    'น้ำหนัก 68 kg · ส่วนสูง 168 cm · BMI 24.1 kg/m² <span class="ref">(เกณฑ์ปกติชาวเอเชีย 18.5–22.9)</span>',

    h('CHIEF COMPLAINT (อาการสำคัญที่มาพบแพทย์)'),
    '"ถ่ายอุจจาระเป็นสีดำเหนียวเหมือนยางมะตอยมา 2 วัน วันนี้เวียนหัวมาก อาเจียนออกมาเป็นเลือดสด 1 ครั้งก่อนมา รพ."',

    h('HISTORY OF PRESENT ILLNESS (ประวัติการเจ็บป่วยปัจจุบัน)'),
    '<u>14 วันก่อนมา รพ.</u> — ปวดยอกบริเวณคอและไหล่จากการขับรถ ซื้อยาแก้ปวด Ibuprofen (ไอบูโพรเฟน — ยาแก้ปวดกลุ่ม NSAIDs) 400 mg รับประทานเอง ครั้งละ 1 เม็ด หลังอาหาร 3 มื้อ (TID PC — วันละ 3 ครั้ง หลังอาหาร) สม่ำเสมอทุกวัน',
    '<u>5 วันก่อนมา รพ.</u> — เริ่มปวดแสบร้อนใต้ลิ้นปี่ (epigastric pain — ปวดบริเวณยอดอก/ใต้ลิ้นปี่) ปวดมากช่วงท้องว่างและหลังอาหาร 1–2 ชั่วโมง ซื้อยาขับลมและยาน้ำลดกรดทานเอง อาการไม่ดีขึ้น และยังคงรับประทาน Ibuprofen ต่อเนื่อง',
    '<u>2 วันก่อนมา รพ.</u> — ถ่ายอุจจาระดำเหนียว กลิ่นเหม็นคาวจัด วันละ 2–3 ครั้ง เริ่มอ่อนเพลีย วิงเวียนศีรษะเวลาลุกเดิน',
    '<u>3 ชั่วโมงก่อนมา รพ.</u> — หน้ามืด ใจสั่น เหงื่อออก ตัวเย็น อาเจียนเป็นเลือดสดปนลิ่มเลือด ปริมาณประมาณ 1 แก้วน้ำ (~200 mL)',

    h('PAST MEDICAL HISTORY (ประวัติการเจ็บป่วยในอดีต)'),
    'Hypertension (ความดันโลหิตสูง) — เป็นมา 5 ปี, ขาดยาบ้างเป็นบางครั้ง',
    'Dyslipidemia (ไขมันในเลือดผิดปกติ) — เป็นมา 5 ปี',
    'ปฏิเสธประวัติโรคตับแข็ง (cirrhosis) · ปฏิเสธประวัติแผลในทางเดินอาหาร (peptic ulcer) ในอดีต · ปฏิเสธประวัติการผ่าตัด',

    h('CURRENT MEDICATIONS (รายการยาที่ใช้อยู่)'),
    'Amlodipine (แอมโลดิพีน — ยาลดความดันกลุ่ม CCB) 10 mg — 1 เม็ด วันละครั้ง หลังอาหาร — ทานสม่ำเสมอ',
    'Simvastatin (ซิมวาสแตติน — ยาลดไขมัน) 20 mg — 1 เม็ด ก่อนนอน — ทานสม่ำเสมอ',
    'Ibuprofen (ไอบูโพรเฟน — NSAIDs) 400 mg — 1 เม็ด วันละ 3 ครั้ง หลังอาหาร — ซื้อทานเอง ต่อเนื่อง 14 วัน (รวม 1,200 mg/วัน)',
    'ยาขับลม / ยาน้ำลดกรด (antacid) — ทานเมื่อมีอาการ — เริ่มใช้เมื่อ 5 วันก่อน',

    h('ALLERGIES (ประวัติการแพ้ยา)'),
    'No Known Drug Allergy — NKDA (ไม่มีประวัติแพ้ยาที่ทราบ)',

    h('SOCIAL HISTORY (ประวัติส่วนตัวและพฤติกรรม)'),
    'สูบบุหรี่ 0.5 ซอง/วัน ต่อเนื่องมา 15 ปี',
    'ดื่มแอลกอฮอล์ — เบียร์ 2–3 ขวด/ครั้ง สัปดาห์ละ 2–3 วัน',
    'กาแฟกระป๋องวันละ 2–3 กระป๋อง',
    'ทานอาหารไม่ตรงเวลา ชอบอาหารรสจัด · พักผ่อนไม่เป็นเวลาจากการทำงาน'
];

// ── OBJECTIVE ───────────────────────────────────────────────────
// Every numeric result carries its reference range inline so the learner can
// judge normal-versus-abnormal without leaving the chart. The interpretation
// of those numbers is deliberately absent — that is the exercise.
const objective = [
    h('VITAL SIGNS (สัญญาณชีพ)'),
    'BP (ความดันโลหิต) 88/55 mmHg <span class="ref">(ปกติ 90/60–140/90)</span>',
    'HR (อัตราการเต้นหัวใจ) 115 ครั้ง/นาที <span class="ref">(ปกติ 60–100)</span>',
    'RR (อัตราการหายใจ) 22 ครั้ง/นาที <span class="ref">(ปกติ 12–20)</span>',
    'BT (อุณหภูมิร่างกาย) 36.8 °C <span class="ref">(ปกติ 36.5–37.5)</span>',
    'SpO₂ (ความอิ่มตัวออกซิเจนในเลือด) 96% ที่อากาศห้อง <span class="ref">(ปกติ ≥ 95)</span>',
    'GCS (ระดับความรู้สึกตัว) E4V5M6 = 15 <span class="ref">(เต็ม 15)</span>',

    h('PHYSICAL EXAMINATION (ผลตรวจร่างกาย)'),
    '<u>General (ลักษณะทั่วไป)</u> — ผู้ป่วยดูป่วยหนักและวิตกกังวล ซีด เหงื่อออกมาก (diaphoretic) ปลายมือปลายเท้าเย็น',
    '<u>HEENT (ศีรษะ ตา หู จมูก คอ)</u> — เยื่อบุตาขาวซีดมาก, ตาไม่เหลือง (anicteric sclera — ไม่มีภาวะดีซ่าน), เยื่อบุช่องปากแห้ง',
    '<u>Cardiovascular (ระบบหัวใจและหลอดเลือด)</u> — หัวใจเต้นเร็ว จังหวะสม่ำเสมอ ไม่มีเสียงฟู่ (no murmurs), ชีพจรส่วนปลายเบา',
    '<u>Abdomen (หน้าท้อง)</u> — หน้าท้องนุ่ม กดเจ็บเล็กน้อยถึงปานกลางบริเวณใต้ลิ้นปี่ ไม่พบ guarding (กล้ามเนื้อหน้าท้องเกร็ง) และไม่พบ rebound tenderness (เจ็บเมื่อปล่อยมือ)',
    '<u>Bowel sounds (เสียงการเคลื่อนไหวลำไส้)</u> — hyperactive (เร็วกว่าปกติ), 8 ครั้ง/นาที <span class="ref">(ปกติ 5–30 ครั้ง/นาที)</span>',
    '<u>Liver / Spleen (ตับและม้าม)</u> — ไม่พบตับหรือม้ามโต, ไม่พบ spider nevi (เส้นเลือดฝอยรูปใยแมงมุม), caput medusae (เส้นเลือดขอดรอบสะดือ) หรือ palmar erythema (ฝ่ามือแดง) ซึ่งเป็นอาการแสดงของโรคตับเรื้อรัง',
    '<u>Digital rectal exam (ตรวจทางทวารหนัก)</u> — พบอุจจาระดำเหนียว (melena) ติดถุงมือ กลิ่นเหม็นคาวจัด',

    h('LABORATORY — Complete Blood Count / CBC (ความสมบูรณ์ของเม็ดเลือด)'),
    'Hb (ฮีโมโกลบิน) 6.8 g/dL <span class="ref">(ปกติ 13–17)</span>',
    'Hct (ความเข้มข้นเลือด) 21% <span class="ref">(ปกติ 39–50)</span>',
    'WBC (เม็ดเลือดขาว) 11,200 /µL <span class="ref">(ปกติ 4,000–10,000)</span>',
    'Platelet (เกล็ดเลือด) 220,000 /µL <span class="ref">(ปกติ 150,000–400,000)</span>',

    h('LABORATORY — Renal Function (การทำงานของไต)'),
    'BUN (ยูเรียไนโตรเจนในเลือด) 35 mg/dL <span class="ref">(ปกติ 7–20)</span>',
    'Cr (ครีอะตินิน) 1.25 mg/dL <span class="ref">(ปกติ 0.7–1.2)</span>',
    'BUN/Cr ratio (อัตราส่วน BUN ต่อ Cr) = 28:1 <span class="ref">(ปกติ 10–20:1)</span>',

    h('LABORATORY — Electrolytes (เกลือแร่ในเลือด, mEq/L)'),
    'Na (โซเดียม) 138 <span class="ref">(ปกติ 135–145)</span> · K (โพแทสเซียม) 3.8 <span class="ref">(ปกติ 3.5–5.0)</span>',
    'Cl (คลอไรด์) 102 <span class="ref">(ปกติ 98–107)</span> · HCO₃ (ไบคาร์บอเนต) 20 <span class="ref">(ปกติ 22–28)</span>',

    h('LABORATORY — Liver Function & Coagulation (การทำงานของตับและการแข็งตัวของเลือด)'),
    'Albumin (อัลบูมิน) 3.8 g/dL <span class="ref">(ปกติ 3.5–5.0)</span>',
    'PT (เวลาการแข็งตัวของเลือด) 11.5 วินาที <span class="ref">(ปกติ 11–13.5)</span> · INR 1.0 <span class="ref">(ปกติ 0.8–1.2)</span>',

    h('URGENT ENDOSCOPY / EGD (ส่องกล้องทางเดินอาหารส่วนต้นแบบเร่งด่วน)'),
    'พบแผลเดี่ยวขนาด 2.0 ซม. ลักษณะ punch-out ulcer (แผลขอบชัดเหมือนถูกเจาะ) บริเวณ duodenal bulb (ลำไส้เล็กส่วนต้น)',
    'มีเลือดซึมออกจากแผลตลอดเวลา (active oozing — เลือดออกแบบซึมต่อเนื่อง)',
    'ไม่พบหลอดเลือดโป่งพองในหลอดอาหารหรือกระเพาะอาหาร (no varices)',
    'Forrest classification (การแบ่งระดับแผลเลือดออกจากการส่องกล้อง): Grade Ib'
];

// ── VITALS HUD ──────────────────────────────────────────────────
// Value + reference range only. The source document's "UI Status Flag"
// column (🚨 CRITICAL LOW / TACHYCARDIA) and its clinical interpretation are
// omitted: Step 1 asks the learner to identify shock and severe anaemia, and
// a red "CRITICAL"/"TACHYCARDIA" badge answers that question for them.
const vitals = [
    { label: 'BP',    value: '88/55', unit: 'mmHg',  ref: '90/60–140/90' },
    { label: 'HR',    value: '115',   unit: 'bpm',   ref: '60–100' },
    { label: 'RR',    value: '22',    unit: '/min',  ref: '12–20' },
    { label: 'Temp',  value: '36.8',  unit: '°C',    ref: '36.5–37.5' },
    { label: 'SpO₂',  value: '96%',   unit: 'RA',    ref: '≥ 95' },
    { label: 'Hb',    value: '6.8',   unit: 'g/dL',  ref: '13–17' },
    { label: 'GCS',   value: '15',    unit: 'E4V5M6', ref: '15' }
];

// ── REFERENCE (ข้อมูลอ้างอิง) ────────────────────────────────────
// Rendered as a collapsed accordion. This is where every deliberate aid to
// the learner lives — guideline criteria, abbreviations, scoring tools, drug
// notes — kept out of the patient chart so the chart stays raw data, and kept
// collapsed so consulting it is a decision rather than something the UI does
// for them. It never states the diagnosis for this patient.
const reference = {
    title: 'ข้อมูลอ้างอิง (Clinical Reference)',
    note: 'อ้างอิง ACG Guideline 2021, ACG H. pylori 2024, DiPiro และแนวทางเวชปฏิบัติของประเทศไทย พ.ศ. 2557',
    sections: [
        {
            id: 'abbrev',
            title: 'คำย่อและศัพท์ที่พบในเคสนี้',
            icon: '🔤',
            rows: [
                ['UGIB', 'Upper Gastrointestinal Bleeding — ภาวะเลือดออกในทางเดินอาหารส่วนต้น'],
                ['PUD', 'Peptic Ulcer Disease — โรคแผลในกระเพาะอาหารและลำไส้เล็กส่วนต้น'],
                ['NSAIDs', 'Non-Steroidal Anti-Inflammatory Drugs — ยาแก้ปวดลดอักเสบที่ไม่ใช่สเตียรอยด์'],
                ['PPI', 'Proton Pump Inhibitor — ยายับยั้งการหลั่งกรดในกระเพาะอาหาร'],
                ['H2RA', 'Histamine-2 Receptor Antagonist — ยาลดกรดกลุ่มต้านฮิสตามีนชนิดที่ 2'],
                ['EGD', 'Esophagogastroduodenoscopy — การส่องกล้องทางเดินอาหารส่วนต้น'],
                ['Melena', 'อุจจาระดำเหนียวคล้ายยางมะตอย จากเลือดที่ถูกย่อยในทางเดินอาหาร'],
                ['Hematemesis', 'การอาเจียนเป็นเลือด'],
                ['MAP', 'Mean Arterial Pressure — ความดันเลือดแดงเฉลี่ย'],
                ['PRBC', 'Packed Red Blood Cells — เม็ดเลือดแดงเข้มข้นสำหรับให้เลือด'],
                ['FFP', 'Fresh Frozen Plasma — พลาสมาแช่แข็งสด'],
                ['DTP', 'Drug Therapy Problem — ปัญหาจากการใช้ยา'],
                ['CrCl', 'Creatinine Clearance — ค่าการกำจัดครีอะตินิน ใช้ปรับขนาดยาตามการทำงานของไต'],
                ['NPO', 'Nil Per Os — งดน้ำและอาหารทางปาก']
            ]
        },
        {
            id: 'differential',
            title: 'การวินิจฉัยแยกโรค (Differential Diagnosis)',
            icon: '🧭',
            note: 'เกณฑ์สำหรับแยกแต่ละภาวะ — ไม่ได้ระบุว่าผู้ป่วยรายนี้เป็นภาวะใด',
            table: {
                columns: ['ภาวะ', 'ประวัติและอาการนำ', 'ผล Lab / ตรวจร่างกาย', 'ผลส่องกล้อง'],
                rows: [
                    ['Peptic Ulcer Bleeding (แผลในทางเดินอาหารมีเลือดออก)',
                     'ใช้ NSAIDs หรือแอสไพริน, ปวดใต้ลิ้นปี่, ถ่ายดำ',
                     'BUN/Cr > 20:1, Hb ต่ำ',
                     'พบแผล ulcer พร้อม Forrest stigmata'],
                    ['Variceal Bleeding (เลือดออกจากหลอดเลือดขอด)',
                     'ดื่มสุราเรื้อรัง, มีประวัติตับแข็ง',
                     'LFT ผิดปกติ, เกล็ดเลือดต่ำ, INR สูง, มีน้ำในช่องท้อง',
                     'พบ varices ในหลอดอาหาร'],
                    ['Mallory-Weiss Tear (แผลฉีกรอยต่อหลอดอาหาร)',
                     'อาเจียนรุนแรง (retching) นำมาก่อนอาเจียนเป็นเลือด',
                     'สัญญาณชีพมักคงที่',
                     'พบรอยฉีกที่รอยต่อหลอดอาหารกับกระเพาะ'],
                    ['Erosive Gastritis / Stress Ulcer (กระเพาะอักเสบจากภาวะเครียดวิกฤต)',
                     'ผู้ป่วยวิกฤตใน ICU, ติดเชื้อในกระแสเลือด, ใส่เครื่องช่วยหายใจ',
                     'มีอวัยวะล้มเหลวอื่นร่วม',
                     'พบแผลตื้นหลายจุดกระจาย']
                ]
            }
        },
        {
            id: 'risk',
            title: 'เกณฑ์แบ่งกลุ่มเสี่ยงและการให้เลือด',
            icon: '📊',
            rows: [
                ['BUN/Cr ratio', 'ค่ามากกว่า 20:1 เป็นตัวบ่งชี้ของเลือดออกในทางเดินอาหารส่วนต้น เกิดจากการย่อยและดูดซึมโปรตีนจากเลือดในลำไส้เล็ก ร่วมกับภาวะ prerenal azotaemia'],
                ['Glasgow-Blatchford Score', 'GBS > 1 = กลุ่มเสี่ยงสูง ต้องรับไว้ในโรงพยาบาลและส่องกล้องภายใน 24 ชม. · GBS = 0 = กลุ่มเสี่ยงต่ำ พิจารณาดูแลแบบผู้ป่วยนอกได้'],
                ['Forrest Ia / Ib', 'เลือดพุ่ง / เลือดซึม — กลุ่มเสี่ยงสูงต่อการเลือดออกซ้ำ ต้องได้ high-dose IV PPI ต่อเนื่อง 72 ชม.'],
                ['Forrest IIa / IIb / IIc', 'เห็นหลอดเลือดโผล่ / มีลิ่มเลือดเกาะ / มีจุดสีคล้ำ — ความเสี่ยงลดหลั่นลงมาตามลำดับ'],
                ['Forrest III', 'ก้นแผลสะอาด — ความเสี่ยงเลือดออกซ้ำต่ำที่สุด'],
                ['Restrictive transfusion', 'ให้ PRBC เมื่อ Hb < 7 g/dL เป้าหมายหลังให้ 7–9 g/dL — ลดอัตราการเสียชีวิตเมื่อเทียบกับการให้เลือดมากเกินจำเป็น'],
                ['Liberal transfusion', 'ให้เมื่อ Hb < 8 g/dL เฉพาะผู้ป่วยที่มีโรคหลอดเลือดหัวใจอยู่เดิม']
            ]
        },
        {
            id: 'pharm',
            title: 'ขนาดยาและแนวทางการรักษา',
            icon: '💊',
            rows: [
                ['High-dose IV PPI', 'Pantoprazole หรือ Omeprazole 80 mg IV bolus ตามด้วย 8 mg/ชม. หยดต่อเนื่อง 72 ชม. — เป้าหมายคือรักษา pH ในกระเพาะให้ ≥ 6.0 เพื่อไม่ให้ลิ่มเลือดสลาย'],
                ['Fluid resuscitation', 'Isotonic crystalloid (0.9% NSS หรือ Lactated Ringer\'s) 1–2 ลิตร IV bolus เป้าหมาย MAP ≥ 65 mmHg — D5W ไม่ใช้เพราะไม่เพิ่มปริมาตรในหลอดเลือด'],
                ['Pre-endoscopy prokinetic', 'Erythromycin 250 mg IV ก่อนส่องกล้อง 20–60 นาที เพื่อไล่เลือดค้างในกระเพาะและเพิ่มทัศนวิสัย'],
                ['Tranexamic acid', 'ปัจจุบัน "ไม่แนะนำ" ใน non-variceal UGIB — ไม่ลดอัตราการเสียชีวิตและเพิ่มความเสี่ยงลิ่มเลือดอุดตัน'],
                ['Somatostatin / Octreotide', 'ใช้สำหรับเลือดออกจากหลอดเลือดขอด (variceal) ไม่ใช่แผล peptic ulcer'],
                ['H. pylori eradication', 'Bismuth Quadruple Therapy 14 วัน = PPI (ขนาดมาตรฐาน วันละ 2 ครั้ง) + Bismuth subsalicylate + Metronidazole + Tetracycline'],
                ['การตรวจ H. pylori', 'UBT และ stool antigen ให้ผลลบปลอมได้ ต้องหยุด PPI ≥ 2 สัปดาห์ และหยุดยาปฏิชีวนะ ≥ 4 สัปดาห์ก่อนตรวจ · serology แยกไม่ได้ระหว่างติดเชื้อในอดีตกับปัจจุบัน'],
                ['การกลับมาใช้ NSAIDs', 'หยุดทันทีในระยะเลือดออก · หากจำเป็นต้องใช้ต่อ ให้เปลี่ยนเป็น COX-2 selective inhibitor ร่วมกับ PPI ทุกวัน'],
                ['ผลข้างเคียง PPI ระยะยาว', 'ภาวะแมกนีเซียมต่ำ, ขาดวิตามิน B12, เพิ่มความเสี่ยงติดเชื้อ C. difficile และปอดอักเสบ']
            ]
        },
        {
            id: 'dtp',
            title: 'ประเภทปัญหาจากการใช้ยา (DTP Categories)',
            icon: '🏷',
            note: 'กรอบการจำแนกตามหลัก Pharmaceutical Care Practice',
            rows: [
                ['1. Unnecessary Drug Therapy', 'ได้รับยาโดยไม่มีข้อบ่งชี้'],
                ['2. Needs Additional Drug Therapy', 'มีข้อบ่งชี้แต่ยังไม่ได้รับยา'],
                ['3. Ineffective Drug', 'ยาที่ได้รับไม่ได้ผลกับภาวะนั้น'],
                ['4. Dosage Too Low', 'ขนาดยาต่ำเกินกว่าจะได้ผล'],
                ['5. Adverse Drug Reaction', 'เกิดอาการไม่พึงประสงค์จากยา'],
                ['6. Dosage Too High', 'ขนาดยาสูงเกินไปจนเสี่ยงเป็นพิษ'],
                ['7. Non-adherence', 'ผู้ป่วยไม่ได้ใช้ยาตามที่สั่ง']
            ]
        }
    ]
};

// ── STAGES ──────────────────────────────────────────────────────
const stages = {
    stage_1_data: {
        title: 'DATA (รวบรวมข้อมูล)',
        steps: {
            step_1_subjective_data: { type: 'info', chart_tab: 'subjective', content: subjective },
            step_2_objective_data:  { type: 'info', chart_tab: 'objective',  content: objective }
        }
    },

    stage_2_emergency: {
        title: 'EMERGENCY RESPONSE & STABILIZATION',
        steps: {
            step_1_problem_list: step(
                'จากข้อมูลประวัติและการตรวจร่างกายเบื้องต้น จงระบุปัญหาสำคัญของผู้ป่วยรายนี้',
                'shock',
                [
                    ok('A', 'Acute Upper GI Bleeding'),
                    ok('B', 'Hemodynamic Instability (Shock)'),
                    ok('C', 'Severe Anemia'),
                    ok('D', 'NSAIDs Overuse (Ibuprofen 1,200 mg/day)'),
                    no('E', 'Chronic Liver Disease / Cirrhosis'),
                    no('F', 'Mallory-Weiss Tear'),
                    no('G', 'Acute Pancreatitis')
                ],
                'ผู้ป่วยมีสัญญาณชีพไม่คงที่ (BP < 90/60 mmHg) ร่วมกับมีเลือดออกชัดเจน จึงต้องระบุทั้งปัญหาเฉียบพลัน (bleeding/shock) และสาเหตุ (NSAIDs) เพื่อวางแผนการรักษา',
                {
                    correct: 'ถูกต้องทั้งหมด — ปัญหาที่ต้องจัดการคือ acute UGIB, ภาวะ shock, ภาวะซีดรุนแรง และการใช้ NSAIDs ขนาดสูงต่อเนื่องซึ่งเป็นสาเหตุ ส่วน cirrhosis ถูกคัดออกจาก LFT/albumin ปกติ, Mallory-Weiss ถูกคัดออกจากตำแหน่งแผลที่ duodenal bulb และไม่มีประวัติ retching',
                    partial: 'ตอบถูกบางส่วน — ทบทวนว่าปัญหาใดเป็นภาวะเฉียบพลันที่คุกคามชีวิต และปัญหาใดคือสาเหตุที่ทำให้เกิดแผล',
                    incorrect: 'ยังไม่ถูกต้อง — พิจารณาทั้งภาวะเลือดออก, ความไม่คงที่ของระบบไหลเวียน, ระดับ Hb และประวัติการใช้ยา'
                }),

            step_2_etiology: step(
                'ปัจจัยใดต่อไปนี้ "ส่งเสริม" ให้เกิดความรุนแรงของโรคในผู้ป่วยรายนี้',
                'pain',
                [
                    ok('A', 'การใช้ Ibuprofen ต่อเนื่องนาน 14 วัน'),
                    ok('B', 'พฤติกรรมการสูบบุหรี่'),
                    ok('C', 'การดื่มแอลกอฮอล์'),
                    ok('D', 'การทานอาหารไม่ตรงเวลาและรสจัด'),
                    ok('E', 'การดื่มกาแฟกระป๋องวันละ 2–3 กระป๋อง'),
                    no('F', 'ประวัติโรคเบาหวาน (Diabetes Mellitus)'),
                    no('G', 'การใช้ยา Amlodipine')
                ],
                'การรักษา PUD ให้ได้ผลดีต้องจัดการทั้งสาเหตุหลัก (NSAIDs) และปัจจัยกระตุ้นทาง lifestyle เพื่อป้องกันการกลับเป็นซ้ำ',
                {
                    correct: 'ถูกต้อง — Ibuprofen ทำลายเยื่อบุโดยตรงและยับยั้ง prostaglandin ส่วนบุหรี่ แอลกอฮอล์ คาเฟอีน และอาหารรสจัด/ไม่ตรงเวลา ล้วนเพิ่มการหลั่งกรดหรือชะลอการหายของแผล ผู้ป่วยไม่มีประวัติเบาหวาน และ amlodipine ไม่ใช่ปัจจัยเสี่ยงของ PUD',
                    partial: 'ตอบถูกบางส่วน — ทบทวน social history ของผู้ป่วยให้ครบทุกข้อ',
                    incorrect: 'ยังไม่ถูกต้อง — กลับไปอ่าน social history และ medication history อีกครั้ง'
                }),

            step_3_resuscitation: step(
                'ในขณะที่ BP 88/55 mmHg ท่านควรดำเนินการกู้สัญญาณชีพ (resuscitation) ด้วยวิธีใด',
                'shock',
                [
                    ok('A', 'ให้ 0.9% Normal Saline 1–2 ลิตร IV bolus'),
                    ok('B', "ให้ Lactated Ringer's IV bolus"),
                    ok('C', 'เปิดเส้นเลือดด้วยเข็มขนาดใหญ่ (large bore IV #16–18)'),
                    no('D', 'ให้ 5% Dextrose in Water (D5W) IV infusion'),
                    no('E', 'ให้ Dopamine drip เพื่อเพิ่มความดันทันที'),
                    ok('F', 'สั่งงดน้ำและอาหาร (NPO)'),
                    fat('G', 'ให้รับประทานยาเม็ดลดกรด PPI ทันที',
                        'ผู้ป่วยอยู่ในภาวะ shock และมี active bleeding ร่วมกับเพิ่งอาเจียนเป็นเลือด การให้ยาทางปากในจังหวะนี้เสี่ยงต่อการสำลักเข้าปอด และยารูปแบบรับประทานไม่สามารถควบคุมกรดได้ทันในภาวะเลือดออกเฉียบพลัน')
                ],
                'เป้าหมายแรกคือรักษาระดับ MAP ≥ 65 mmHg ด้วย isotonic crystalloids ก่อนดำเนินการรักษาอื่น D5W ไม่เพิ่ม intravascular volume และ vasopressor ต้องรอให้เติมสารน้ำเพียงพอก่อน',
                {
                    correct: 'ถูกต้อง — เปิดเส้นใหญ่, ให้ isotonic crystalloid bolus และงดน้ำงดอาหารเพื่อเตรียมส่องกล้อง',
                    partial: 'ตอบถูกบางส่วน — ทบทวนว่าสารน้ำชนิดใดเพิ่ม intravascular volume ได้จริง และลำดับก่อนหลังของ vasopressor',
                    incorrect: 'ยังไม่ถูกต้อง — เริ่มจากการเข้าถึงหลอดเลือดและชนิดของสารน้ำที่เหมาะสมกับภาวะ hypovolemia'
                }),

            step_4_ppi_acute: step(
                'ท่านควรสั่งใช้ยา Proton Pump Inhibitor ในรูปแบบใดสำหรับผู้ป่วยรายนี้',
                'stabilized',
                [
                    ok('A', 'Pantoprazole 80 mg IV bolus'),
                    ok('B', 'ตามด้วย Pantoprazole 8 mg/hr continuous IV infusion นาน 72 ชม.'),
                    ok('C', 'Omeprazole 80 mg IV bolus'),
                    ok('D', 'ตามด้วย Omeprazole 8 mg/hr continuous IV infusion นาน 72 ชม.'),
                    no('E', 'Omeprazole 40 mg IV ทุก 12 ชม.'),
                    no('F', 'Famotidine 20 mg IV ทุก 12 ชม.'),
                    fat('G', 'สั่ง Ibuprofen 400 mg PRN สำหรับอาการปวดท้อง',
                        'Ibuprofen คือสาเหตุของแผลและเลือดออกในผู้ป่วยรายนี้ การสั่งซ้ำในช่วง active bleeding จะยับยั้ง prostaglandin และการทำงานของเกล็ดเลือดต่อไป ทำให้เลือดออกไม่หยุดและผู้ป่วยเสียชีวิตได้')
                ],
                'High-dose IV PPI ช่วยรักษาระดับ intragastric pH > 6.0 ซึ่งจำเป็นต่อความคงตัวของลิ่มเลือดในแผล PUD ส่วน H2RA ไม่มีประสิทธิภาพเทียบเท่าใน UGIB',
                {
                    correct: 'ถูกต้อง — bolus ตามด้วย continuous infusion 72 ชม. คือสูตรมาตรฐานสำหรับแผลความเสี่ยงสูง',
                    partial: 'ตอบถูกบางส่วน — ทบทวนว่าเหตุใดสูตร intermittent จึงยังไม่เหมาะกับแผลกลุ่มความเสี่ยงสูง',
                    incorrect: 'ยังไม่ถูกต้อง — ทบทวนขนาดยา รูปแบบการบริหาร และระยะเวลาของ high-dose IV PPI'
                })
        }
    },

    stage_3_procedural: {
        title: 'PROCEDURAL OPTIMIZATION',
        steps: {
            step_5_pre_egd: step(
                'เพื่อเพิ่มทัศนวิสัยในการส่องกล้องและลดโอกาสต้องส่องกล้องซ้ำ ท่านควรพิจารณาสิ่งใด "ก่อน" ส่งผู้ป่วยทำ EGD',
                'pain',
                [
                    ok('A', 'Erythromycin 250 mg IV drip ใน 20–30 นาที'),
                    no('B', 'ให้ Metoclopramide 10 mg IV'),
                    ok('C', 'ล้างกระเพาะด้วย NSS ผ่านสาย NG tube'),
                    no('D', 'ให้ Tranexamic acid IV'),
                    ok('E', 'งดน้ำและอาหาร (NPO) อย่างน้อย 6–8 ชม.'),
                    no('F', 'ให้ Somatostatin 250 mcg IV bolus'),
                    fat('G', 'สั่งทำ EGD ทันทีโดยที่ BP ยังเป็น 88/55 mmHg',
                        'ห้ามส่งผู้ป่วยเข้าหัตถการขณะที่ระบบไหลเวียนยังไม่คงที่ การให้ยาระงับความรู้สึกในภาวะ hypovolemic shock เสี่ยงต่อภาวะหยุดหายใจหรือหัวใจหยุดเต้นระหว่างส่องกล้อง ต้องกู้สัญญาณชีพให้ได้ก่อนเสมอ')
                ],
                'Erythromycin เป็น motilin agonist ที่ช่วยลดเลือดค้างในกระเพาะ ทำให้เห็นตำแหน่งแผลชัดและลดการทำ second-look endoscopy ส่วน tranexamic acid ปัจจุบันไม่แนะนำใน non-variceal UGIB และ somatostatin ใช้ในกรณี variceal bleed',
                {
                    correct: 'ถูกต้อง — prokinetic ที่มีหลักฐานรองรับคือ erythromycin ร่วมกับการล้างกระเพาะและ NPO',
                    partial: 'ตอบถูกบางส่วน — ทบทวนว่ายาใดมีหลักฐานเฉพาะสำหรับการเพิ่มทัศนวิสัยใน UGIB',
                    incorrect: 'ยังไม่ถูกต้อง — แยกให้ออกระหว่างยาที่ใช้ใน variceal bleed กับ non-variceal bleed'
                }),

            step_6_transfusion: step(
                'จากผล Hb 6.8 g/dL และอาการทางคลินิก ท่านจะเลือกกลยุทธ์การให้เลือดอย่างไร',
                'shock',
                [
                    ok('A', 'ให้ PRBC เพื่อรักษาเป้าหมาย Hb ในช่วง 7–9 g/dL'),
                    no('B', 'ให้ PRBC จนกว่า Hb จะ > 10 g/dL'),
                    ok('C', 'เจาะ Hb/Hct ซ้ำทุก 4–6 ชม. หลังให้เลือด'),
                    ok('D', 'ให้เลือดเมื่อ Hb < 7 g/dL ในผู้ป่วยที่ไม่มีโรคหัวใจ'),
                    ok('E', 'พิจารณาเป้าหมาย Hb > 8 g/dL หากผู้ป่วยมีประวัติ ischemic heart disease'),
                    no('F', 'ให้เกล็ดเลือด (platelet) ทันทีเพราะเสียเลือดมาก'),
                    no('G', 'ให้ Fresh Frozen Plasma ทันทีเพื่อป้องกันการแข็งตัวของเลือดผิดปกติ')
                ],
                'Restrictive transfusion strategy (threshold Hb < 7 g/dL) ลดอัตราการเสียชีวิตและลดภาวะแทรกซ้อนจากการให้เลือดมากเกินไป ผู้ป่วยรายนี้มี platelet 220,000 /µL และ INR 1.0 จึงไม่มีข้อบ่งชี้ให้ platelet หรือ FFP',
                {
                    correct: 'ถูกต้อง — restrictive strategy พร้อมติดตาม Hb ซ้ำ และมีข้อยกเว้นเฉพาะผู้ที่มีโรคหัวใจ',
                    partial: 'ตอบถูกบางส่วน — ทบทวน threshold และเป้าหมายหลังให้เลือด รวมถึงข้อบ่งชี้ของ platelet และ FFP',
                    incorrect: 'ยังไม่ถูกต้อง — กลับไปดูค่า platelet และ INR ของผู้ป่วยก่อนตัดสินใจให้ส่วนประกอบของเลือด'
                }),

            step_7_post_egd: step(
                'หลังส่องกล้องพบ duodenal ulcer และหยุดเลือดด้วย adrenaline injection ร่วมกับ hemoclip สำเร็จแล้ว ท่านควรวางแผนการใช้ PPI ต่อไปอย่างไร',
                'stabilized',
                [
                    ok('A', 'ให้ high-dose PPI IV infusion ต่อเนื่องจนครบ 72 ชม.'),
                    no('B', 'เปลี่ยนเป็น PPI รูปแบบรับประทานทันทีหลังทำหัตถการเสร็จ'),
                    no('C', 'ปรับยาเป็น Pantoprazole 40 mg IV ทุก 12 ชม.'),
                    ok('D', 'รักษาระดับ intragastric pH > 6.0 อย่างต่อเนื่อง'),
                    ok('E', 'หลังครบ 72 ชม. เปลี่ยนเป็น oral PPI double dose (bid) นาน 6–8 สัปดาห์'),
                    no('F', 'ให้ Sucralfate suspension เสริมเพื่อเคลือบแผล'),
                    fat('G', 'เริ่มให้ Aspirin 300 mg ทันทีเพื่อป้องกันหลอดเลือดหัวใจอุดตัน',
                        'ผู้ป่วยเพิ่งหยุดเลือดจากแผล Forrest Ib ซึ่งเป็นกลุ่มเสี่ยงสูงต่อการเลือดออกซ้ำที่สุด การเริ่ม antiplatelet ภายใน 24 ชม. แรกโดยไม่มีข้อบ่งชี้เร่งด่วนทางหัวใจ ทำให้เลือดออกซ้ำรุนแรงจนเสียชีวิตได้')
                ],
                'แผลที่มี high-risk stigmata ต้องได้ high-dose PPI IV (bolus 80 mg + infusion 8 mg/hr) นาน 72 ชม. เพราะเป็นช่วงที่มีโอกาสเลือดออกซ้ำสูงที่สุด จากนั้นจึงเปลี่ยนเป็น oral เพื่อสมานแผล',
                {
                    correct: 'ถูกต้อง — คง IV infusion ครบ 72 ชม. ก่อน แล้วจึงต่อด้วย oral PPI เพื่อสมานแผล',
                    partial: 'ตอบถูกบางส่วน — ทบทวนว่าเมื่อใดจึงเปลี่ยนจาก IV เป็น oral ได้',
                    incorrect: 'ยังไม่ถูกต้อง — ทบทวนความสัมพันธ์ระหว่าง Forrest classification กับระยะเวลาของ IV PPI'
                }),

            step_8_monitoring: step(
                'ระหว่างที่ผู้ป่วยได้รับ PPI infusion ท่านต้องติดตามสิ่งใดที่บ่งชี้ว่า "การรักษาล้มเหลว" หรือเกิด re-bleeding',
                'stabilized',
                [
                    ok('A', 'ความดันโลหิตลดลงและชีพจรเร็วขึ้น'),
                    ok('B', 'อาเจียนออกมาเป็นเลือดสดอีกครั้ง'),
                    no('C', 'ถ่ายอุจจาระเป็นยางมะตอยต่อเนื่องหลายวัน'),
                    ok('D', 'ระดับ Hb/Hct ลดลงมากกว่า 10% จากค่าตั้งต้นหลังให้เลือด'),
                    ok('E', 'มีอาการเจ็บหน้าอกเฉียบพลัน'),
                    no('F', 'ติดตามระดับ Magnesium ในเลือดในระยะเฉียบพลันนี้'),
                    no('G', 'ระดับ BUN กลับมาเป็นปกติอย่างรวดเร็ว')
                ],
                'การติดตามสัญญาณชีพและระดับ Hb สำคัญที่สุดใน 72 ชม. แรก melena สามารถค้างอยู่ในลำไส้ได้หลายวันหลังเลือดหยุดแล้ว จึงไม่ใช่ตัวบ่งชี้ re-bleeding ที่ดีเท่า hematemesis ส่วน BUN ที่ลดลงคือสัญญาณที่ดี ไม่ใช่ความล้มเหลว',
                {
                    correct: 'ถูกต้อง — สัญญาณชีพ, hematemesis ซ้ำ, Hb ที่ลดลง และอาการเจ็บหน้าอกจากภาวะซีด คือสิ่งที่ต้องเฝ้าระวัง',
                    partial: 'ตอบถูกบางส่วน — ระวังตัวเลือกที่ดูเหมือนอาการแย่ลงแต่จริง ๆ แล้วเป็นสัญญาณที่ดีขึ้น',
                    incorrect: 'ยังไม่ถูกต้อง — แยกให้ออกระหว่างอาการที่บ่งชี้เลือดออกซ้ำ กับอาการที่ค้างจากเลือดออกครั้งเดิม'
                }),

            step_9_hpylori_testing: step(
                'ท่านควรตรวจหาการติดเชื้อ H. pylori ในผู้ป่วยรายนี้ในช่วงเวลาใดจึงจะได้ผลแม่นยำที่สุด',
                'stabilized',
                [
                    ok('A', 'ตรวจ Rapid Urease Test จากชิ้นเนื้อระหว่างส่องกล้อง'),
                    no('B', 'ตรวจ Urea Breath Test ขณะที่ยังได้รับ PPI infusion'),
                    no('C', 'เจาะเลือดตรวจ H. pylori antibody (serology)'),
                    ok('D', 'ตรวจ UBT หรือ stool antigen หลังหยุด PPI อย่างน้อย 2 สัปดาห์'),
                    ok('E', 'ตรวจ UBT หรือ stool antigen หลังหยุดยาปฏิชีวนะอย่างน้อย 4 สัปดาห์'),
                    ok('F', 'หากผล RUT ระหว่างส่องกล้องเป็นลบ ให้ตรวจซ้ำด้วยวิธีอื่นหลังพ้นระยะเฉียบพลัน'),
                    no('G', 'ไม่จำเป็นต้องตรวจเพราะมีประวัติใช้ NSAIDs ชัดเจนอยู่แล้ว')
                ],
                'ผู้ป่วย PUD ทุกรายต้องได้รับการตรวจ H. pylori แม้จะมีสาเหตุอื่นร่วมด้วย PPI และยาปฏิชีวนะทำให้เกิดผลลบปลอม ส่วน serology แยกไม่ได้ระหว่างการติดเชื้อในอดีตกับปัจจุบัน',
                {
                    correct: 'ถูกต้อง — ตรวจ RUT ระหว่างส่องกล้องก่อน และยืนยันซ้ำหลังหยุดยาตามระยะเวลาที่กำหนด',
                    partial: 'ตอบถูกบางส่วน — ทบทวนว่ายาชนิดใดรบกวนผลตรวจ และต้องหยุดนานเท่าใด',
                    incorrect: 'ยังไม่ถูกต้อง — ทบทวนข้อจำกัดของแต่ละวิธีตรวจในภาวะที่มีเลือดออกและกำลังได้รับ PPI'
                })
        }
    },

    stage_4_longterm: {
        title: 'LONG-TERM CARE & DISCHARGE',
        steps: {
            step_10_eradication: step(
                'หากผลตรวจยืนยันการติดเชื้อ H. pylori ท่านควรเลือกสูตรยาใดจึงเหมาะสมที่สุดตามแนวทางปัจจุบัน',
                'stabilized',
                [
                    ok('A', 'Optimized Bismuth Quadruple Therapy นาน 14 วัน'),
                    no('B', 'Clarithromycin Triple Therapy นาน 7–10 วัน'),
                    ok('C', 'PPI ขนาดมาตรฐาน รับประทานวันละ 2 ครั้ง (bid)'),
                    ok('D', 'Bismuth subsalicylate 300–524 mg วันละ 4 ครั้ง (qid)'),
                    no('E', 'Levofloxacin Triple Therapy นาน 14 วัน'),
                    ok('F', 'ย้ำเตือนให้ผู้ป่วยรับประทานยาให้ครบ 14 วันอย่างเคร่งครัด'),
                    fat('G', 'ให้ Ibuprofen ต่อเนื่องเพื่อลดอาการปวดที่อาจเกิดจากผลข้างเคียงของยาปฏิชีวนะ',
                        'การให้ NSAIDs ระหว่างกำจัดเชื้อในผู้ป่วยที่เพิ่งมีเลือดออกจากแผล จะทำให้แผลกำเริบและเกิดเลือดออกซ้ำรุนแรง — ยาตัวนี้คือสาเหตุเดิมของเคสนี้')
                ],
                'แนวทางปัจจุบันแนะนำ Bismuth Quadruple Therapy 14 วันเป็นทางเลือกแรก และให้หลีกเลี่ยงการใช้ clarithromycin หรือ levofloxacin แบบ empiric หากไม่มีข้อมูลความไวของเชื้อในพื้นที่',
                {
                    correct: 'ถูกต้อง — BQT 14 วัน พร้อมเน้นย้ำความร่วมมือในการใช้ยา',
                    partial: 'ตอบถูกบางส่วน — ทบทวนส่วนประกอบทั้งสี่ของสูตร quadruple therapy',
                    incorrect: 'ยังไม่ถูกต้อง — ทบทวนเหตุผลที่สูตร triple therapy ไม่ใช่ทางเลือกแรกอีกต่อไป'
                }),

            step_11_secondary_prevention: step(
                'ผู้ป่วยยังต้องจัดการอาการปวดเมื่อยจากการทำงานในอนาคต ท่านจะแนะนำการใช้ยาแก้ปวดอย่างไรเพื่อป้องกันการเกิดแผลซ้ำ',
                'stabilized',
                [
                    ok('A', 'ใช้ Paracetamol เป็นทางเลือกแรกสำหรับอาการปวดเล็กน้อยถึงปานกลาง'),
                    ok('B', 'หากจำเป็นต้องใช้ NSAIDs ให้เปลี่ยนเป็น selective COX-2 inhibitor'),
                    ok('C', 'ใช้ PPI ขนาดมาตรฐานควบคู่ทุกวันหากต้องใช้ NSAIDs ระยะยาว'),
                    no('D', 'กลับไปใช้ Ibuprofen ขนาดเดิมได้ทันทีหลังแผลหาย'),
                    ok('E', 'หลีกเลี่ยงการใช้ NSAIDs ร่วมกับ corticosteroids หรือ anticoagulants'),
                    no('F', 'รับประทานยาแก้ปวดหลังอาหารทันทีและดื่มน้ำตามมาก ๆ'),
                    fat('G', 'แนะนำให้ซื้อยาชุดแก้ปวดมาทานแทนยาแผนปัจจุบัน',
                        'ยาชุดมักผสม corticosteroids หรือ NSAIDs ขนาดสูงโดยไม่ระบุส่วนประกอบ ในผู้ป่วยที่เพิ่งมีเลือดออกจากแผลในทางเดินอาหาร คำแนะนำนี้ทำให้เกิดเลือดออกซ้ำรุนแรงและเสียชีวิตได้')
                ],
                'ในผู้ป่วยเสี่ยงสูงที่เคยมีแผลเลือดออก หากจำเป็นต้องใช้ NSAIDs แนวทางแนะนำ COX-2 selective inhibitor ร่วมกับ PPI เสมอ การทานหลังอาหารลดการระคายเคืองเฉพาะที่ได้บ้าง แต่ไม่ป้องกันการยับยั้ง prostaglandin ในระดับระบบ',
                {
                    correct: 'ถูกต้อง — paracetamol เป็นทางเลือกแรก และหากเลี่ยง NSAIDs ไม่ได้ต้องใช้ COX-2 selective ร่วมกับ PPI',
                    partial: 'ตอบถูกบางส่วน — ทบทวนว่ากลไกใดของ NSAIDs ที่การทานหลังอาหารไม่สามารถป้องกันได้',
                    incorrect: 'ยังไม่ถูกต้อง — ทบทวนลำดับขั้นของยาแก้ปวดในผู้ป่วยที่มีประวัติแผลเลือดออก'
                }),

            step_12_gastroprotection: step(
                'หลังหยุด PPI แบบฉีดแล้ว ท่านควรวางแผนการใช้ยาลดกรดต่อเนื่องอย่างไร',
                'stabilized',
                [
                    ok('A', 'ให้ oral PPI ต่อเนื่องนาน 4–8 สัปดาห์เพื่อให้แผลหายสมบูรณ์'),
                    ok('B', 'พิจารณาให้ PPI ต่อเนื่องระยะยาวหากยังมีความเสี่ยงที่เลี่ยงไม่ได้'),
                    no('C', 'เปลี่ยนเป็นยากลุ่ม H2RA ได้ทันทีหลังออกจากโรงพยาบาล'),
                    ok('D', 'แนะนำให้รับประทาน PPI ก่อนอาหารเช้า 30–60 นาที'),
                    no('E', 'หยุดยาลดกรดทันทีเมื่อไม่มีอาการปวดท้อง'),
                    ok('F', 'ติดตามภาวะขาดวิตามิน B12 หรือ magnesium หากใช้ยาต่อเนื่องนานกว่า 1 ปี'),
                    no('G', 'ให้รับประทานยาลดกรดเฉพาะเวลามีอาการ (on-demand) ตั้งแต่วันแรกที่กลับบ้าน')
                ],
                'Duodenal ulcer ที่มีเลือดออกต้องการการสมานแผลด้วย PPI นาน 4–8 สัปดาห์ และการบริหารยาก่อนอาหารเป็นสิ่งสำคัญต่อประสิทธิภาพ อาการปวดไม่สัมพันธ์กับการหายของแผลเสมอไป',
                {
                    correct: 'ถูกต้อง — ให้ต่อเนื่องจนครบกำหนด บริหารก่อนอาหาร และเฝ้าระวังผลข้างเคียงระยะยาว',
                    partial: 'ตอบถูกบางส่วน — ทบทวนว่าเหตุใดจึงหยุดยาตามอาการไม่ได้',
                    incorrect: 'ยังไม่ถูกต้อง — ทบทวนระยะเวลาการรักษาและวิธีบริหารยา PPI ที่ถูกต้อง'
                }),

            step_13_discharge: step(
                'ท่านควรให้คำแนะนำเพื่อปรับเปลี่ยนพฤติกรรมและการเฝ้าระวังอาการแก่ผู้ป่วยก่อนกลับบ้านอย่างไร',
                'recovered',
                [
                    ok('A', 'แนะนำให้เลิกสูบบุหรี่อย่างเด็ดขาด'),
                    ok('B', 'งดแอลกอฮอล์และเครื่องดื่มที่มีคาเฟอีนปริมาณมาก'),
                    ok('C', 'สอนให้สังเกตอาการเตือน เช่น ถ่ายดำ หรืออาเจียนเป็นเลือด'),
                    ok('D', 'แนะนำให้รับประทานอาหารตรงเวลาและเลี่ยงอาหารรสจัด'),
                    ok('E', 'อธิบายว่าอุจจาระสีดำจากยาธาตุเหล็กหรือ bismuth ไม่ใช่ภาวะเลือดออก'),
                    no('F', 'ไม่ต้องมาตรวจติดตามผลหากอาการปกติ'),
                    fat('G', 'บอกผู้ป่วยว่าโรคนี้หายขาดแล้ว กลับไปทำงานและทานยาแก้ปวดได้ตามปกติทุกอย่าง',
                        'การให้ความมั่นใจที่ผิดพลาด (false reassurance) ทำให้ผู้ป่วยกลับไปใช้ NSAIDs ซ้ำและละเลยอาการเตือน ผู้ป่วยกลับมาด้วยเลือดออกซ้ำและเสียชีวิต')
                ],
                'การปรับเปลี่ยนวิถีชีวิต โดยเฉพาะการหยุดบุหรี่และแอลกอฮอล์ ร่วมกับการรับรู้สัญญาณอันตราย เป็นหัวใจของการป้องกันการเจ็บป่วยซ้ำที่รุนแรง ผู้ป่วย PUD UGIB ทุกรายต้องมีนัดติดตามผล',
                {
                    correct: 'ถูกต้องทั้งหมด — ครอบคลุมทั้งการปรับพฤติกรรม การเฝ้าระวังอาการเตือน และการอธิบายผลข้างเคียงของยาที่อาจทำให้เข้าใจผิด',
                    partial: 'ตอบถูกบางส่วน — ทบทวน social history ของผู้ป่วยว่ามีพฤติกรรมใดบ้างที่ต้องแก้ไข',
                    incorrect: 'ยังไม่ถูกต้อง — คำแนะนำก่อนกลับบ้านต้องครอบคลุมทั้งพฤติกรรม อาการเตือน และการนัดติดตาม'
                })
        }
    }
};

// ── CASE ────────────────────────────────────────────────────────
const caseData = {
    case_id: 'case_001',
    // Bump whenever step ids change, so instructor analytics can tell that
    // older attempts measured a different set of questions.
    case_version: 2,
    map_title: 'ด่านที่ 1 · ห้องฉุกเฉิน',
    map_subtitle: 'ชายไทย 55 ปี มาด้วยถ่ายอุจจาระดำ 2 วัน และอาเจียนเป็นเลือดสด 1 ครั้ง',
    ward: 'Emergency Room',
    // Revealed on the end-of-case screen only.
    case_title: 'Acute Non-Variceal Upper GI Bleeding — NSAID-induced Duodenal Ulcer (Forrest Ib)',
    difficulty: 'Advanced',
    tags: ['Gastroenterology', 'Critical Care', 'Pharmacotherapy'],

    patient: {
        name: 'ผู้ป่วยชายไทย',
        age: 55,
        sex: 'M',
        occupation: 'พนักงานขับรถบรรทุกส่งสินค้าทางไกล',
        chief_complaint: 'ถ่ายอุจจาระดำเหนียว 2 วัน ร่วมกับอาเจียนเป็นเลือดสด 1 ครั้ง และเวียนศีรษะมาก'
        // `acuity` and `status_tags` are intentionally absent: labels such as
        // "HIGH ACUITY" / "Hypovolemic Shock" / "NSAID use" name the answers
        // to Step 1 and Step 2 before the learner has reasoned to them.
    },

    vitals,

    renal: {
        weight_kg: 68,
        height_cm: 168,
        scr_mg_dl: 1.25,
        bun_mg_dl: 35,
        // eGFR is deliberately not authored. Only Scr, BUN and weight are real
        // measurements here; CrCl is computed by the app from them.
        note: null
    },

    dtp: {
        // Attached to the etiology step, where the learner is already reasoning
        // about what the drug did to this patient.
        step_id: 'step_2_etiology',
        correct_ids: [5],
        rationale: 'Ibuprofen 1,200 mg/วัน ต่อเนื่อง 14 วัน ทำให้เกิดแผลและเลือดออกในทางเดินอาหาร ซึ่งเป็นอาการไม่พึงประสงค์จากยาที่เกิดขึ้นแล้ว (Adverse Drug Reaction)'
    },

    monitoring: {
        regimen: 'High-dose IV PPI (80 mg bolus → 8 mg/hr infusion 72 ชม.) + isotonic crystalloid resuscitation + PRBC transfusion ตาม restrictive strategy',
        efficacy: [
            { param: 'Hematemesis / melena', target: 'ไม่มีการอาเจียนเป็นเลือดซ้ำ อุจจาระกลับเป็นสีปกติ', when: 'ทุกครั้งที่ถ่ายและทุกเวร' },
            { param: 'Hb / Hct', target: 'คงที่ในช่วง 7–9 g/dL ไม่ลดต่อเนื่อง', when: 'ทุก 4–6 ชม. หลังให้เลือด' },
            { param: 'BP / HR', target: 'MAP ≥ 65 mmHg, HR < 100 bpm', when: 'ทุก 15–60 นาทีในช่วงแรก' },
            { param: 'Urine output', target: '≥ 0.5 mL/kg/hr', when: 'ทุกชั่วโมง' },
            { param: 'BUN / Cr', target: 'BUN ลดลงเข้าสู่เกณฑ์ปกติ', when: 'ทุก 24 ชม.' },
            { param: 'ผลกำจัดเชื้อ H. pylori', target: 'UBT หรือ stool antigen เป็นลบ', when: 'หลังหยุด PPI 2 สัปดาห์ / หยุดยาปฏิชีวนะ 4 สัปดาห์' }
        ],
        safety: [
            { param: 'อาการปวดท้องรุนแรง / ท้องแข็งเกร็ง', watch: 'สัญญาณของ perforation — รายงานแพทย์ทันที', when: 'ทุกเวร' },
            { param: 'เจ็บหน้าอก', watch: 'ภาวะหัวใจขาดเลือดจากภาวะซีดรุนแรง', when: 'ทุกเวร' },
            { param: 'Serum magnesium และวิตามิน B12', watch: 'ผลข้างเคียงของ PPI เมื่อใช้ต่อเนื่องนานกว่า 1 ปี', when: 'ทุก 6–12 เดือน' },
            { param: 'สัญญาณติดเชื้อทางเดินอาหารและปอด', watch: 'ความเสี่ยง C. difficile และปอดอักเสบเพิ่มขึ้นจาก PPI', when: 'ทุกวันขณะอยู่โรงพยาบาล' },
            { param: 'ปฏิกิริยาจากการให้เลือด', watch: 'ไข้ หนาวสั่น ผื่น หายใจลำบาก', when: 'ระหว่างและหลังให้เลือด' },
            { param: 'ผลข้างเคียงของ BQT', watch: 'คลื่นไส้ รสโลหะในปาก อุจจาระสีดำจาก bismuth (ไม่ใช่ melena)', when: 'ตลอด 14 วันที่ได้รับยา' }
        ]
    },

    reference,
    stages,

    // Not rendered anywhere in the player UI. Kept so the clinical reasoning
    // behind the case is not lost from the repository.
    authoring_notes: {
        subjective_summary: 'ผู้ป่วยมีความเสี่ยงสูงจากหลายปัจจัยร่วมกัน: Ibuprofen 1,200 mg/วัน นาน 14 วัน, สูบบุหรี่, ดื่มแอลกอฮอล์และกาแฟ, ทานอาหารไม่ตรงเวลา',
        objective_summary: 'ยืนยัน Acute Non-Variceal UGIB จาก duodenal ulcer ระยะ Forrest Ib ร่วมกับภาวะ shock จากการเสียเลือด ต้องกู้สัญญาณชีพและให้ high-dose IV PPI เร่งด่วน',
        vitals_interpretation: 'BP 88/55 = critical hypotension (shock); HR 115 = compensatory tachycardia; RR 22 = mild tachypnoea; Hb 6.8 = severe acute blood loss anaemia',
        lab_interpretation: 'BUN/Cr 28:1 (> 20:1) บ่งชี้ upper GI bleeding จากการย่อยโปรตีนในเลือดร่วมกับ prerenal azotaemia; albumin และ INR ปกติช่วยคัดภาวะตับแข็งและ coagulopathy ออก',
        forrest_interpretation: 'Forrest Ib = active oozing = กลุ่มเสี่ยงสูงมากต่อการเลือดออกซ้ำ จึงต้อง high-dose IV PPI infusion 72 ชม.',
        differential_verdicts: {
            peptic_ulcer_bleeding: 'CORRECT — ตรงตามประวัติ Ibuprofen และส่องกล้องไม่พบ varices',
            variceal_bleeding: 'INCORRECT — ไม่มีประวัติโรคตับ, LFT/INR ปกติ, ส่องกล้องไม่พบ varices',
            mallory_weiss: 'INCORRECT — ไม่มีประวัติ retching และแผลอยู่ที่ duodenal bulb',
            erosive_gastritis: 'INCORRECT — ผู้ป่วยไม่ได้อยู่ในภาวะวิกฤตแบบ ICU stress'
        },
        sources: ['ACG Clinical Guideline 2021 (Upper GI and Ulcer Bleeding)', 'ACG H. pylori Guideline 2024', 'DiPiro Pharmacotherapy', 'แนวทางเวชปฏิบัติการดูแลผู้ป่วยเลือดออกในทางเดินอาหารส่วนต้น ประเทศไทย พ.ศ. 2557']
    }
};

// ── finalise: shuffle every step's options ──────────────────────
for (const stage of Object.values(caseData.stages)) {
    for (const [stepId, s] of Object.entries(stage.steps)) {
        if (s.type !== 'mcq_multi') continue;
        s.choices = shuffleChoices(stepId, s.choices);
        s.correct_answers = s.choices.filter(c => c.is_correct).map(c => c.id);
    }
}

fs.writeFileSync(OUT, JSON.stringify(caseData, null, 2) + '\n');

// ── sanity report ───────────────────────────────────────────────
let total = 0, mcq = 0, fatals = 0;
for (const st of Object.values(caseData.stages)) {
    for (const [id, s] of Object.entries(st.steps)) {
        if (s.type !== 'mcq_multi') continue;
        mcq++;
        total += s.point_value;
        const f = s.choices.filter(c => c.is_fatal).length;
        fatals += f;
        if (s.choices.length !== 7) console.warn('!! not 7 options:', id, s.choices.length);
        if (s.correct_answers.length === 0) console.warn('!! no correct answer:', id);
    }
}
console.log(`case_001 written: ${mcq} MCQ steps, max score ${total}, ${fatals} fatal option(s)`);
