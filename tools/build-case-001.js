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
const subjective = [
    h('PATIENT PROFILE'),
    'ชายไทย อายุ 55 ปี · อาชีพพนักงานขับรถบรรทุกส่งสินค้าทางไกล · รูปแบบงาน: ขับรถระยะทางไกล พักผ่อนไม่เป็นเวลา',
    'น้ำหนัก 68 kg · ส่วนสูง 168 cm · BMI 24.1 kg/m²',

    h('CHIEF COMPLAINT'),
    '"ถ่ายอุจจาระเป็นสีดำเหนียวเหมือนยางมะตอยมา 2 วัน วันนี้เวียนหัวมาก อาเจียนออกมาเป็นเลือดสด 1 ครั้งก่อนมา รพ."',

    h('HISTORY OF PRESENT ILLNESS'),
    '<u>14 วันก่อนมา รพ.</u> — ปวดยอกบริเวณคอและไหล่จากการขับรถ ซื้อยาแก้ปวด Ibuprofen (400 mg) รับประทานเอง ครั้งละ 1 เม็ด หลังอาหาร 3 มื้อ (TID PC) สม่ำเสมอทุกวัน',
    '<u>5 วันก่อนมา รพ.</u> — เริ่มปวดแสบร้อนใต้ลิ้นปี่ (epigastric pain) ปวดมากช่วงท้องว่างและหลังอาหาร 1–2 ชั่วโมง ซื้อยาขับลมและยาน้ำลดกรดทานเอง อาการไม่ดีขึ้น และยังคงรับประทาน Ibuprofen ต่อเนื่อง',
    '<u>2 วันก่อนมา รพ.</u> — ถ่ายอุจจาระดำเหนียว กลิ่นเหม็นคาวจัด วันละ 2–3 ครั้ง เริ่มอ่อนเพลีย วิงเวียนศีรษะเวลาลุกเดิน',
    '<u>3 ชั่วโมงก่อนมา รพ.</u> — หน้ามืด ใจสั่น เหงื่อออก ตัวเย็น อาเจียนเป็นเลือดสดปนลิ่มเลือด ปริมาณประมาณ 1 แก้วน้ำ (~200 mL)',

    h('PAST MEDICAL HISTORY'),
    'Hypertension — เป็นมา 5 ปี, ขาดยาบ้างเป็นบางครั้ง',
    'Dyslipidemia — เป็นมา 5 ปี',
    'ปฏิเสธประวัติโรคตับแข็ง (cirrhosis) · ปฏิเสธประวัติ peptic ulcer ในอดีต · ปฏิเสธประวัติการผ่าตัด',

    h('CURRENT MEDICATIONS (Drug Reconciliation)'),
    'Amlodipine 10 mg — 1 tab po qd pc — ทานสม่ำเสมอ',
    'Simvastatin 20 mg — 1 tab po hs — ทานสม่ำเสมอ',
    'Ibuprofen 400 mg — 1 tab po tid pc — ซื้อทานเอง ต่อเนื่อง 14 วัน (รวม 1,200 mg/วัน)',
    'ยาขับลม / ยาน้ำลดกรด — ทานเมื่อมีอาการ — เริ่มใช้เมื่อ 5 วันก่อน',

    h('ALLERGIES'),
    'No Known Drug Allergy (NKDA)',

    h('SOCIAL HISTORY'),
    'สูบบุหรี่ 0.5 ซอง/วัน ต่อเนื่องมา 15 ปี',
    'ดื่มแอลกอฮอล์ — เบียร์ 2–3 ขวด/ครั้ง สัปดาห์ละ 2–3 วัน',
    'กาแฟกระป๋องวันละ 2–3 กระป๋อง',
    'ทานอาหารไม่ตรงเวลา ชอบอาหารรสจัด · พักผ่อนไม่เป็นเวลาจากการทำงาน'
];

// ── OBJECTIVE ───────────────────────────────────────────────────
const objective = [
    h('VITAL SIGNS'),
    'BP 88/55 mmHg · HR 115 bpm · RR 22 /min · BT 36.8 °C · SpO₂ 96% (room air) · GCS E4V5M6 = 15',

    h('PHYSICAL EXAMINATION'),
    '<u>General</u> — ผู้ป่วยดูป่วยหนักและวิตกกังวล ซีด เหงื่อออกมาก ปลายมือปลายเท้าเย็น',
    '<u>HEENT</u> — เยื่อบุตาขาวซีดมาก, ตาไม่เหลือง (anicteric sclera), เยื่อบุช่องปากแห้ง',
    '<u>Cardiovascular</u> — หัวใจเต้นเร็ว จังหวะสม่ำเสมอ ไม่มีเสียงฟู่ (no murmurs), ชีพจรส่วนปลายเบา',
    '<u>Abdomen</u> — หน้าท้องนุ่ม กดเจ็บเล็กน้อยถึงปานกลางบริเวณใต้ลิ้นปี่ ไม่พบ guarding และไม่พบ rebound tenderness',
    '<u>Bowel sounds</u> — hyperactive, 8 ครั้ง/นาที',
    '<u>Liver / Spleen</u> — ไม่พบตับหรือม้ามโต, ไม่พบ spider nevi, caput medusae หรือ palmar erythema',
    '<u>Digital rectal exam</u> — พบอุจจาระดำเหนียวติดถุงมือ กลิ่นเหม็นคาวจัด',

    h('LABORATORY — Complete Blood Count'),
    'Hb 6.8 g/dL (ref 13–17) · Hct 21% (ref 39–50)',
    'WBC 11,200 /µL (ref 4,000–10,000) · Platelet 220,000 /µL (ref 150,000–400,000)',

    h('LABORATORY — Renal Function'),
    'BUN 35 mg/dL (ref 7–20) · Cr 1.25 mg/dL (ref 0.7–1.2) · BUN/Cr ratio = 28:1',

    h('LABORATORY — Electrolytes (mEq/L)'),
    'Na 138 · K 3.8 · Cl 102 · HCO₃ 20',

    h('LABORATORY — Liver Function & Coagulation'),
    'Albumin 3.8 g/dL (ref 3.5–5.0) · PT 11.5 s · INR 1.0 (ref ~1.0)',

    h('URGENT ESOPHAGOGASTRODUODENOSCOPY (EGD)'),
    'พบแผลเดี่ยวขนาด 2.0 ซม. ลักษณะ punch-out ulcer บริเวณ duodenal bulb',
    'มีเลือดซึมออกจากแผลตลอดเวลา (active oozing)',
    'ไม่พบหลอดเลือดโป่งพองในหลอดอาหารหรือกระเพาะอาหาร (no esophageal or gastric varices)',
    'Forrest classification: Grade Ib'
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

// ── CPG REFERENCE ───────────────────────────────────────────────
// Differential criteria are retained in full — a pharmacist has guidelines at
// the bedside. The source table's final column ("บทสรุปในเคสนี้" with
// [CORRECT]/[INCORRECT] verdicts per differential) is removed: it states the
// diagnosis and pre-answers Step 1's rule-outs.
const cpg = {
    title: 'CPG: Acute Non-Variceal Upper GI Bleeding',
    note: 'อ้างอิง ACG Guideline 2021, DiPiro และแนวทางเวชปฏิบัติของประเทศไทย พ.ศ. 2557',
    columns: ['ภาวะทางคลินิก', 'ประวัติและอาการนำ', 'ผล Lab และตรวจร่างกาย', 'ผลส่องกล้อง (EGD)'],
    rows: [
        { label: 'Differential 1', values: [
            'Peptic Ulcer Disease Bleeding',
            'ใช้ NSAIDs/ASA, ปวด epigastrium, melena',
            'BUN/Cr > 20:1, Hb ต่ำ',
            'พบ ulcer พร้อม Forrest stigmata' ] },
        { label: 'Differential 2', values: [
            'Variceal Bleeding',
            'ดื่มสุราเรื้อรัง, ประวัติ cirrhosis',
            'LFT ผิดปกติ, platelet ต่ำ, INR สูง, พบ ascites',
            'พบ variceal columns ในหลอดอาหาร' ] },
        { label: 'Differential 3', values: [
            'Mallory-Weiss Tear',
            'อาเจียนรุนแรง (retching) ก่อนอาเจียนเป็นเลือด',
            'vital signs มัก stable',
            'พบ mucosal tear ที่ GE junction' ] },
        { label: 'Differential 4', values: [
            'Erosive Gastritis / Stress Ulcer',
            'ผู้ป่วยวิกฤต (ICU), sepsis, ใส่เครื่องช่วยหายใจ',
            'มี organ failure อื่นร่วม',
            'พบ multiple superficial mucosal erosions' ] },
        { label: 'Risk stratification', values: [
            'Glasgow-Blatchford Score (GBS)',
            'GBS > 1 = high risk — admit และส่องกล้องภายใน 24 ชม.',
            'GBS = 0 = low risk — พิจารณาดูแลแบบผู้ป่วยนอกได้',
            '—' ] },
        { label: 'Transfusion threshold', values: [
            'Restrictive vs Liberal strategy',
            'Restrictive: ให้ PRBC เมื่อ Hb < 7 g/dL, เป้าหมาย 7–9 g/dL',
            'Liberal: Hb < 8 g/dL เฉพาะผู้ที่มี active cardiovascular disease',
            '—' ] },
        { label: 'Acute pharmacotherapy', values: [
            'High-dose IV PPI',
            'Pantoprazole/Omeprazole 80 mg IV bolus → 8 mg/hr infusion 72 ชม.',
            'เป้าหมาย intragastric pH ≥ 6.0 เพื่อคงตัวของ fibrin clot',
            '—' ] },
        { label: 'Resuscitation', values: [
            'Isotonic crystalloids',
            '0.9% NSS หรือ Lactated Ringer\'s 1–2 L IV bolus',
            'เป้าหมาย MAP ≥ 65 mmHg',
            '—' ] },
        { label: 'Pre-endoscopy', values: [
            'Prokinetic',
            'Erythromycin 250 mg IV 30–60 นาทีก่อนส่องกล้อง',
            'กระตุ้น gastric emptying เพื่อเพิ่มทัศนวิสัย',
            '—' ] },
        { label: 'Post-bleeding care', values: [
            'H. pylori eradication + NSAID rules',
            'Bismuth Quadruple Therapy 14 วัน (PPI bid + bismuth + metronidazole + tetracycline)',
            'หยุด NSAIDs ทันทีในระยะเลือดออก; หากจำเป็นให้ใช้ COX-2 selective ร่วมกับ PPI',
            'ส่องกล้องซ้ำในแผลเสี่ยงสูงหรือสงสัย malignancy' ] }
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

    cpg,
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
