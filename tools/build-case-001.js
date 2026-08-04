/**
 * Regenerates data/case_001.json from the Clinical Content Specialist dataset
 * (นายวิชัย, 62M — Acute UGIB from gastric antral ulcer, Forrest Ib, H. pylori +).
 *
 * SPOILER POLICY applied throughout:
 *   - Raw clinical data is preserved in full (values, units, reference ranges,
 *     endoscopic findings). None of it is cut — the learner needs it to reason.
 *   - Interpretations of that data are NOT student-facing, because every one of
 *     them is the answer to a question the case then asks. The source dataset's
 *     "[ต่ำ/Hypotension]" / "[สูง/Tachycardia]" vital-sign flags, the lab Status
 *     column (Low/High/Normal), the "ความสอดคล้องทางคลินิก" line, the note that
 *     NSAIDs are the main cause, the significance of each negative finding, and
 *     the Clinical Summary are therefore kept out of player-visible content and
 *     preserved under `authoring_notes` instead. Steps 1, 3, 4 and 5 ask the
 *     learner to derive exactly those conclusions.
 *
 * MISSING DATA is rendered as "ไม่มีข้อมูล" rather than invented. The dataset
 * marks occupation, body weight, allergy history and smoking history as absent;
 * body weight in particular is why the Cockcroft-Gault badge shows "—" for CrCl.
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
 * Authored in blueprint order the correct answer clusters near the top and the
 * fatal trap sits at a fixed letter — free hints a learner could score from
 * without reading the clinical content. The shuffle is seeded from the step id
 * so ordering is stable across rebuilds (no spurious JSON diffs) but carries no
 * information.
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
 * Builds a multi-select step.
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
    'นายวิชัย · เพศชาย · อายุ 62 ปี',
    'อาชีพ · น้ำหนัก · ส่วนสูง · BMI — <span class="ref">ไม่มีข้อมูลในเอกสารอ้างอิง</span>',

    h('CHIEF COMPLAINT (อาการสำคัญที่มาพบแพทย์)'),
    '"อาเจียนเป็นเลือดสีแดงสด และถ่ายอุจจาระเป็นสีดำเหลว 2 ชั่วโมงก่อนมาโรงพยาบาล"',

    h('HISTORY OF PRESENT ILLNESS (ประวัติการเจ็บป่วยปัจจุบัน)'),
    '<u>3 วันก่อนมา รพ.</u> — เริ่มปวดท้องแสบแน่นบริเวณลิ้นปี่ (epigastric pain — ปวดใต้ลิ้นปี่) อาการมักสัมพันธ์กับการรับประทานอาหาร',
    '<u>1 วันก่อนมา รพ.</u> — สังเกตเห็นอุจจาระมีสีดำคล้ำและเหนียวคล้ายยางมะตอย (melena — อุจจาระดำจากเลือดที่ถูกย่อย)',
    '<u>2 ชั่วโมงก่อนมา รพ.</u> — คลื่นไส้รุนแรง และอาเจียนออกมาเป็นเลือดสด (hematemesis — อาเจียนเป็นเลือด) 2 ครั้ง ปริมาณรวมประมาณ 2 ชามแกง',

    h('SYMPTOM PROFILE (ลักษณะของอาการ)'),
    '<u>Onset (การเริ่มต้น)</u> — เกิดขึ้นเฉียบพลัน',
    '<u>Location (ตำแหน่ง)</u> — ปวดบริเวณใต้ลิ้นปี่ (epigastrium)',
    '<u>Characteristics (ลักษณะอาการ)</u> — ปวดแสบ (burning pain) และแน่นท้อง',
    '<u>Aggravating factors (ปัจจัยกระตุ้น)</u> — อาการปวดสัมพันธ์กับการรับประทานอาหาร',
    '<u>Severity (ความรุนแรง)</u> — pain score 7/10 <span class="ref">(ระดับ 0–10)</span> · มีอาการหน้ามืดขณะเปลี่ยนท่า (syncope / orthostasis — หน้ามืดเป็นลมจากการเปลี่ยนท่า)',

    h('ASSOCIATED SYMPTOMS (อาการร่วม)'),
    'ใจสั่น กระวนกระวาย และกระหายน้ำมาก (thirsty)',
    'เวียนศีรษะและหน้ามืด',

    h('PAST MEDICAL HISTORY (ประวัติการเจ็บป่วยในอดีต)'),
    'มีประวัติเป็นโรคแผลในกระเพาะอาหาร (Peptic Ulcer Disease — PUD) มาก่อน',
    'ประวัติการผ่าตัดใหญ่ในช่องท้อง — <span class="ref">ไม่มีข้อมูลในเอกสารอ้างอิง</span>',

    h('CURRENT MEDICATIONS (ประวัติการใช้ยา)'),
    'Ibuprofen (ไอบูโพรเฟน — ยาแก้ปวดกลุ่ม NSAIDs) 400 mg — 1 เม็ด หลังอาหาร 3 มื้อ เมื่อมีอาการปวดข้อ',
    'ระยะเวลา — รับประทานต่อเนื่องมาประมาณ 2 สัปดาห์ เนื่องจากปวดข้อเข่า',
    'Adherence (ความร่วมมือในการใช้ยา) — รับประทานยาตามสั่ง แต่ไม่ได้รับประทานยาลดกรดควบคู่ด้วย',

    h('ALLERGIES (ประวัติการแพ้ยาและอาหาร)'),
    '<span class="ref">ไม่มีข้อมูลในเอกสารอ้างอิง</span>',

    h('SOCIAL HISTORY (ประวัติส่วนตัวและพฤติกรรม)'),
    'ดื่มสุรา — มีประวัติดื่มเป็นประจำ (chronic alcohol abuse — การดื่มสุราเรื้อรัง)',
    'สูบบุหรี่ — <span class="ref">ไม่มีข้อมูลในเอกสารอ้างอิง</span>',
    'อาชีพและลักษณะงาน — <span class="ref">ไม่มีข้อมูลในเอกสารอ้างอิง</span>'
];

// ── OBJECTIVE ───────────────────────────────────────────────────
// Every numeric result carries its reference range inline so the learner can
// judge normal-versus-abnormal without leaving the chart. The dataset's Status
// column (Low / High / Normal) and its "[ต่ำ/Hypotension]"-style flags are not
// reproduced — grading each value is the exercise, and Steps 1 and 5 ask for it.
const objective = [
    h('VITAL SIGNS (สัญญาณชีพ)'),
    'BP (ความดันโลหิต) 90/60 mmHg <span class="ref">(ปกติ 90/60–140/90)</span>',
    'HR (อัตราการเต้นหัวใจ) 115 ครั้ง/นาที <span class="ref">(ปกติ 60–100)</span>',
    'RR (อัตราการหายใจ) 22 ครั้ง/นาที <span class="ref">(ปกติ 12–20)</span>',
    'Temp (อุณหภูมิร่างกาย) 36.5 °C <span class="ref">(ปกติ 36.5–37.5)</span>',
    'SpO₂ (ความอิ่มตัวออกซิเจนในเลือด) 96% ที่อากาศห้อง (room air) <span class="ref">(ปกติ ≥ 95)</span>',

    h('PHYSICAL EXAMINATION (ผลตรวจร่างกาย)'),
    '<u>General appearance (ลักษณะทั่วไป)</u> — ผู้ป่วยชายดูอ่อนเพลียมาก (lethargic — ซึมอ่อนแรง) สีหน้าวิตกกังวล กระวนกระวาย ซีดอย่างเห็นได้ชัด (marked pallor) ผิวหนังเย็นและมีเหงื่อซึม (cold clammy skin)',
    '<u>Abdomen (หน้าท้อง)</u> — ท้องนุ่ม (soft) กดเจ็บเล็กน้อยบริเวณใต้ลิ้นปี่ (mild epigastric tenderness) ไม่พบท้องอืด',
    '<u>Bowel sounds (เสียงการเคลื่อนไหวลำไส้)</u> — hyperactive bowel sounds (เสียงลำไส้เคลื่อนไหวมากกว่าปกติ)',
    '<u>Rectal examination (ตรวจทางทวารหนัก)</u> — พบอุจจาระสีดำเหนียวคล้ายยางมะตอย (melena) ติดถุงมือ',
    '<u>Negative findings (สิ่งที่ตรวจไม่พบ)</u> — ไม่พบตัวตาเหลือง (no jaundice — ไม่มีภาวะดีซ่าน) · ไม่พบท้องมาน (no ascites — ไม่มีน้ำในช่องท้อง)',
    'ไม่พบจุดเลือดออกตามตัว (no petechiae / ecchymosis — จ้ำเลือดใต้ผิวหนัง)',
    'ไม่พบหน้าท้องแข็งเกร็ง (no guarding — กล้ามเนื้อหน้าท้องเกร็ง) และไม่พบ rebound tenderness (เจ็บเมื่อปล่อยมือ)',

    h('LABORATORY — Complete Blood Count / CBC (ความสมบูรณ์ของเม็ดเลือด)'),
    'Hb (ฮีโมโกลบิน) 8.5 g/dL <span class="ref">(ปกติ 13.0–18.0 ในเพศชาย)</span>',
    'Hct (ความเข้มข้นเลือด) 26% <span class="ref">(ปกติ 40–54)</span>',
    'WBC (เม็ดเลือดขาว) 12,500 cells/mm³ <span class="ref">(ปกติ 4,000–11,000)</span>',
    'Platelet count (เกล็ดเลือด) 250,000 cells/mm³ <span class="ref">(ปกติ 150,000–450,000)</span>',

    h('LABORATORY — Renal Function (การทำงานของไต)'),
    'BUN (ยูเรียไนโตรเจนในเลือด) 35 mg/dL <span class="ref">(ปกติ 7–20)</span>',
    'Cr (ครีอะตินิน) 1.0 mg/dL <span class="ref">(ปกติ 0.6–1.2)</span>',

    h('LABORATORY — Coagulation & Liver Function (การแข็งตัวของเลือดและการทำงานของตับ)'),
    'PT / INR (ค่าการแข็งตัวของเลือด) 1.1 <span class="ref">(ปกติ 0.8–1.2)</span>',
    'AST / ALT (เอนไซม์ตับ) 28 / 32 U/L <span class="ref">(ปกติ < 40)</span>',

    h('DIAGNOSTIC INVESTIGATION — EGD (การส่องกล้องทางเดินอาหารส่วนต้น)'),
    'Esophagogastroduodenoscopy (EGD) — ส่องกล้องด่วนภายใน 24 ชั่วโมง หลังได้รับสารน้ำทดแทนจนสัญญาณชีพเริ่มคงที่',
    '<u>Finding (สิ่งที่ตรวจพบ)</u> — แผลเดี่ยว (solitary ulcer) บริเวณ gastric antrum (ส่วนปลายของกระเพาะอาหาร) ขนาดเส้นผ่านศูนย์กลางประมาณ 1.5 ซม.',
    '<u>Stigmata of hemorrhage (ลักษณะเลือดออกที่ก้นแผล)</u> — Forrest Class Ib (active oozing bleeding — เลือดค่อย ๆ ซึมออกจากฐานแผล)',
    '<u>Sakita classification (ระยะของแผลตามการส่องกล้อง)</u> — Active Stage (A1) ขอบแผลบวมแดงชัดเจน ฐานแผลมีลิ่มเลือดปกคลุมบางส่วน',
    '<u>H. pylori test</u> — Rapid Urease Test (RUT — การตรวจหาเชื้อจากชิ้นเนื้อ) ให้ผล Positive'
];

// ── VITALS HUD ──────────────────────────────────────────────────
// Value + reference range only. The dataset's status flags (Hypotension /
// Tachycardia / Tachypnea) are omitted: Step 1 asks the learner to identify
// shock and severe anaemia, and a red "TACHYCARDIA" badge answers that.
const vitals = [
    { label: 'BP',   value: '90/60',  unit: 'mmHg',      ref: '90/60–140/90' },
    { label: 'HR',   value: '115',    unit: 'bpm',       ref: '60–100' },
    { label: 'RR',   value: '22',     unit: '/min',      ref: '12–20' },
    { label: 'Temp', value: '36.5',   unit: '°C',        ref: '36.5–37.5' },
    { label: 'SpO₂', value: '96%',    unit: 'RA',        ref: '≥ 95' },
    { label: 'Hb',   value: '8.5',    unit: 'g/dL',      ref: '13.0–18.0' },
    { label: 'Hct',  value: '26',     unit: '%',         ref: '40–54' }
];

// ── REFERENCE (ข้อมูลอ้างอิง) ────────────────────────────────────
// Rendered as a collapsed accordion. This is where every deliberate aid to
// the learner lives — guideline criteria, abbreviations, scoring tools, drug
// notes — kept out of the patient chart so the chart stays raw data, and kept
// collapsed so consulting it is a decision rather than something the UI does
// for them. It never states the diagnosis for this patient.
const reference = {
    title: 'ข้อมูลอ้างอิง (Clinical Reference)',
    note: 'อ้างอิงแนวทางเวชปฏิบัติภาวะเลือดออกในทางเดินอาหารส่วนต้นของประเทศไทย พ.ศ. 2557, GI Emergencies, Peptic Ulcer Disease Guideline (Froedtert) และ 2024 ACG Clinical Guideline: Treatment of H. pylori Infection',
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
                ['RUT', 'Rapid Urease Test — การตรวจหาเชื้อ H. pylori จากชิ้นเนื้อขณะส่องกล้อง'],
                ['GBS', 'Glasgow-Blatchford Score — คะแนนประเมินความจำเป็นในการรักษาแบบเร่งด่วน'],
                ['Melena', 'อุจจาระดำเหนียวคล้ายยางมะตอย จากเลือดที่ถูกย่อยในทางเดินอาหาร'],
                ['Hematemesis', 'การอาเจียนเป็นเลือด'],
                ['Antrum', 'ส่วนปลายของกระเพาะอาหารก่อนต่อกับลำไส้เล็กส่วนต้น'],
                ['Crystalloid', 'สารน้ำที่ให้ทางหลอดเลือดดำ เช่น NSS หรือ Lactated Ringer\'s'],
                ['DTP', 'Drug Therapy Problem — ปัญหาจากการใช้ยา'],
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
                     'BUN สูงขึ้นโดยที่ Cr ปกติ, Hb ต่ำ',
                     'พบแผล ulcer พร้อม Forrest stigmata'],
                    ['Variceal Bleeding (เลือดออกจากหลอดเลือดขอด)',
                     'ดื่มสุราเรื้อรัง, มีประวัติตับแข็ง',
                     'AST/ALT ผิดปกติ, เกล็ดเลือดต่ำ, INR สูง, ตัวตาเหลือง, ท้องมาน',
                     'พบ varices ในหลอดอาหาร'],
                    ['Mallory-Weiss Tear (แผลฉีกรอยต่อหลอดอาหาร)',
                     'อาเจียนรุนแรง (retching) นำมาก่อนอาเจียนเป็นเลือด',
                     'สัญญาณชีพมักคงที่',
                     'พบรอยฉีกที่รอยต่อหลอดอาหารกับกระเพาะ'],
                    ['Gastric Perforation (แผลทะลุ)',
                     'ปวดท้องรุนแรงเฉียบพลัน',
                     'หน้าท้องแข็งเกร็ง (guarding) และ rebound tenderness',
                     'พบลมรั่วในช่องท้องจากภาพรังสี']
                ]
            }
        },
        {
            id: 'resuscitation',
            title: 'การกู้ชีพและเป้าหมายการรักษาระยะแรก',
            icon: '🚑',
            rows: [
                ['ลำดับแรกสุด', 'Initial assessment and resuscitation — ประเมินและกู้ชีพก่อนเสมอ เมื่อผู้ป่วยมาด้วย hematemesis หรือ melena'],
                ['Airway', 'ดูแลระบบทางเดินหายใจเพื่อป้องกันการสำลักเลือดเข้าปอด (aspiration)'],
                ['สารน้ำที่ใช้', 'Isotonic crystalloid เช่น 0.9% NSS หรือ Lactated Ringer\'s ทางหลอดเลือดดำ'],
                ['เป้าหมายความดัน', 'Systolic BP ≥ 100 mmHg'],
                ['เป้าหมายระดับ Hb', 'รักษาให้อยู่ในช่วง 9–10 g/dL ในกรณีเลือดออกรุนแรง'],
                ['ก่อนทำหัตถการ', 'ต้องทำ risk stratification เพื่อแยกระดับความเร่งด่วนในการส่องกล้อง']
            ]
        },
        {
            id: 'risk',
            title: 'เกณฑ์ประเมินความรุนแรง (Risk Stratification)',
            icon: '📊',
            rows: [
                ['Glasgow-Blatchford Score (GBS)', 'ใช้ตัดสินว่าผู้ป่วยจำเป็นต้องได้รับการรักษา (intervention) เช่น ส่องกล้องด่วนหรือให้เลือดหรือไม่ · GBS > 0 ถือว่ามีความเสี่ยงและต้องการการจัดการทางการแพทย์'],
                ['องค์ประกอบที่ทำให้ GBS สูง', 'BUN สูง, Hb < 13.0 g/dL (เพศชาย), Systolic BP < 110 mmHg, Pulse ≥ 100 ครั้ง/นาที, melena, syncope, ภาวะตับหรือหัวใจล้มเหลว'],
                ['การให้คะแนน GBS (โดยย่อ)', 'BUN > 25 = 6 คะแนน · Hb < 10 g/dL = 6 คะแนน · SBP 90–99 = 2 คะแนน · Pulse ≥ 100 = 1 คะแนน · melena = 1 คะแนน · syncope = 2 คะแนน'],
                ['Forrest Ia / Ib', 'เลือดพุ่ง / เลือดซึม — กลุ่มเสี่ยงสูงต่อการเลือดออกซ้ำ ต้องทำ endoscopic hemostasis ทันที'],
                ['Forrest IIa / IIb / IIc', 'เห็นหลอดเลือดโผล่ / มีลิ่มเลือดเกาะ / มีจุดสีคล้ำ — ความเสี่ยงลดหลั่นลงตามลำดับ · Forrest Ia ถึง IIa จัดเป็นกลุ่มที่ต้องห้ามเลือดผ่านกล้อง'],
                ['Forrest III', 'ก้นแผลสะอาด — ความเสี่ยงเลือดออกซ้ำต่ำที่สุด'],
                ['อายุ', 'อายุ ≥ 60 ปี จัดเป็นปัจจัยเสี่ยงสูงต่อการเลือดออกซ้ำและการเสียชีวิต']
            ]
        },
        {
            id: 'pharm',
            title: 'ขนาดยาและแนวทางการรักษาด้วยยา',
            icon: '💊',
            rows: [
                ['IV PPI — ชื่อยา', 'Omeprazole หรือ Pantoprazole — เป็นยาหลักสำหรับ non-variceal bleeding'],
                ['IV PPI — loading dose', '80 mg IV bolus (สำหรับ Omeprazole)'],
                ['IV PPI — continuous infusion', 'หยดต่อเนื่อง 8 mg/ชั่วโมง นาน 72 ชั่วโมง หลังห้ามเลือดผ่านกล้องสำเร็จ'],
                ['IV PPI — ทางเลือกอื่น', 'PPI แบบรับประทานขนาด double dose (เช่น 40 mg วันละ 2 ครั้ง) พิจารณาในรายที่ความเสี่ยงต่ำ'],
                ['PPI — อาการไม่พึงประสงค์', 'ที่พบบ่อยคือ ปวดศีรษะ (headache) และท้องเสีย (diarrhea)'],
                ['Octreotide / Somatostatin', 'ใช้สำหรับเลือดออกจากหลอดเลือดโป่งพอง (variceal bleeding) เท่านั้น ไม่ใช่แผล peptic ulcer'],
                ['H. pylori — first-line', 'Standard Triple Therapy: PPI ขนาดมาตรฐาน + Amoxicillin 1 g + Clarithromycin 500 mg รับประทานวันละ 2 ครั้ง'],
                ['H. pylori — ระยะเวลา', 'ให้ยานาน 14 วัน เพื่อผลการกำจัดเชื้อที่ดีที่สุด'],
                ['NSAIDs', 'ต้องหยุดยาที่เป็นสาเหตุ (offending agent) ทันทีในระยะที่มีเลือดออก']
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
// The 13 blueprint steps mapped onto the four-stage BLAZE arc.
const stages = {
    stage_1_data: {
        title: 'DATA (รวบรวมข้อมูล)',
        steps: {
            step_1_subjective_data: { type: 'info', chart_tab: 'subjective', content: subjective },
            step_2_objective_data:  { type: 'info', chart_tab: 'objective',  content: objective }
        }
    },

    stage_2_assessment: {
        title: 'ASSESSMENT (วิเคราะห์ปัญหา)',
        steps: {
            step_1_problem_list: step(
                'จากข้อมูลประวัติ (S) และผลตรวจร่างกาย/Lab (O) จงระบุรายการปัญหา (Problem List) ของผู้ป่วยรายนี้ในระดับการวินิจฉัย',
                'shock',
                [
                    ok('A', 'Hypovolemic Shock (ภาวะช็อกจากการเสียเลือด)'),
                    ok('B', 'Acute Upper GI Bleeding (เลือดออกในทางเดินอาหารส่วนต้นเฉียบพลัน)'),
                    ok('C', 'NSAID-induced Peptic Ulcer Disease (แผลในกระเพาะจากยากลุ่ม NSAIDs)'),
                    ok('D', 'H. pylori infection (การติดเชื้อเอชไพโลไร)'),
                    no('E', 'ปวดเข่าเรื้อรังเป็นปัญหาลำดับแรกที่ต้องจัดการ'),
                    no('F', 'Hematemesis และ Melena คือรายการปัญหาที่สมบูรณ์แล้ว'),
                    no('G', 'อายุ 62 ปี และค่า BUN สูง คือรายการปัญหาหลัก')
                ],
                'ปัญหาที่คุกคามชีวิตที่สุดคือ hypovolemic shock (BP 90/60, HR 115) ซึ่งมีสาเหตุจาก acute UGIB โดยมีพยาธิสภาพคือ PUD ที่สัมพันธ์กับการใช้ Ibuprofen ร่วมกับการติดเชื้อ H. pylori (RUT positive)',
                {
                    correct: 'ถูกต้อง — problem list ที่ดีต้องเรียงจากภาวะที่คุกคามชีวิตลงมาหาสาเหตุ: shock → acute UGIB → NSAID-induced PUD → H. pylori infection',
                    partial: 'ตอบถูกบางส่วน — ทบทวนว่าข้อใดคือ "อาการแสดง" และข้อใดคือ "การวินิจฉัย" ที่ต้องนำมาเขียนใน problem list',
                    incorrect: 'ยังไม่ถูกต้อง — Hematemesis และ Melena เป็นเพียงอาการและอาการแสดง ไม่ใช่การสรุปปัญหาในระดับการวินิจฉัย'
                }),

            step_2_drps: step(
                'เมื่อวิเคราะห์การใช้ยา Ibuprofen 400 mg วันละ 3 ครั้งของผู้ป่วยรายนี้ ข้อใดคือปัญหาจากการใช้ยา (DRPs) ที่ส่งผลโดยตรงต่อการเข้าโรงพยาบาลครั้งนี้',
                'pain',
                [
                    ok('A', 'Safety — ผู้ป่วยเกิดอาการไม่พึงประสงค์จากยา (Adverse Drug Reaction) นำไปสู่ภาวะเลือดออก'),
                    no('B', 'Indication — ผู้ป่วยใช้ยาโดยไม่มีข้อบ่งชี้ทางการแพทย์ที่ชัดเจน'),
                    no('C', 'Effectiveness — ขนาดของ Ibuprofen ต่ำเกินไปทำให้คุมปวดไม่ได้'),
                    no('D', 'Adherence — ผู้ป่วยลืมรับประทานยาทำให้เกิดแผลในกระเพาะอาหาร'),
                    no('E', 'Dosage Too High — ขนาดยาสูงเกินขนาดสูงสุดต่อวันของ Ibuprofen'),
                    no('F', 'Unnecessary Drug Therapy — ยานี้ไม่จำเป็นเลยตั้งแต่ต้น'),
                    no('G', 'Drug Interaction — เกิดอันตรกิริยากับยาลดกรดที่ผู้ป่วยใช้อยู่')
                ],
                'NSAIDs (Ibuprofen) ยับยั้งการสร้าง prostaglandin ซึ่งทำหน้าที่ปกป้องเยื่อบุทางเดินอาหาร ทำให้เกิดแผลและเลือดออกได้ ขนาด 1,200 mg/วัน ถือเป็นขนาดปกติ แต่ผลเสียต่อเยื่อบุทางเดินอาหารไม่ได้ลดลงตามประสิทธิภาพการแก้ปวด',
                {
                    correct: 'ถูกต้อง — นี่คือ DRP ด้านความปลอดภัย: ผู้ป่วยมีข้อบ่งชี้ในการใช้ยาจริง ใช้ยาถูกขนาด แต่เกิดอาการไม่พึงประสงค์จนต้องเข้าโรงพยาบาล',
                    partial: 'ตอบถูกบางส่วน — ทบทวนว่าผู้ป่วยมีข้อบ่งชี้ในการใช้ยาหรือไม่ และใช้ยาในขนาดที่เหมาะสมหรือไม่',
                    incorrect: 'ยังไม่ถูกต้อง — ผู้ป่วยรับประทานยาตามสั่งและมีข้อบ่งชี้ (ปวดข้อเข่า) ปัญหาจึงไม่ได้อยู่ที่ข้อบ่งชี้ ขนาดยา หรือความร่วมมือ'
                }),

            step_3_etiology: step(
                'ปัจจัยใดที่ทำงานร่วมกัน (synergistic effect) จนทำให้เกิดแผล Forrest Ib ในผู้ป่วยรายนี้',
                'pain',
                [
                    ok('A', 'การยับยั้งเอนไซม์ COX จาก Ibuprofen'),
                    ok('B', 'การทำลายเยื่อบุกระเพาะอาหารโดยตรงจากเชื้อ H. pylori'),
                    no('C', 'การดื่มสุราเรื้อรังทำให้หลอดเลือดในหลอดอาหารโป่งพอง'),
                    no('D', 'ภาวะไตเสื่อมทำให้การขับกรดลดลงและเกิดแผลในกระเพาะ'),
                    no('E', 'ภาวะเกล็ดเลือดต่ำทำให้เลือดหยุดยาก'),
                    no('F', 'การขาดวิตามินจากการรับประทานอาหารไม่ครบหมู่'),
                    no('G', 'ภาวะการแข็งตัวของเลือดผิดปกติจากค่า INR ที่สูง')
                ],
                'ทั้ง NSAIDs และ H. pylori เป็นปัจจัยเสี่ยงหลักของ PUD โดย NSAIDs ลดกลไกป้องกันเยื่อบุผ่านการยับยั้ง prostaglandin ส่วน H. pylori กระตุ้นการอักเสบจนเกิดแผลลึกถึงชั้นหลอดเลือด',
                {
                    correct: 'ถูกต้อง — เป็นการทำงานร่วมกันของสองกลไก: ลดการป้องกันเยื่อบุ และเพิ่มการทำลายเยื่อบุ',
                    partial: 'ตอบถูกบางส่วน — ผู้ป่วยรายนี้มีปัจจัยก่อโรคมากกว่าหนึ่งอย่างที่เสริมฤทธิ์กัน',
                    incorrect: 'ยังไม่ถูกต้อง — ทบทวนค่า platelet, INR และ Cr ของผู้ป่วยก่อนเลือกกลไกที่เกี่ยวข้อง'
                }),

            step_4_risk_factor: step(
                'ข้อใดคือปัจจัยของผู้ป่วยรายนี้ที่บ่งชี้ว่ามีโอกาส "เลือดออกซ้ำ (rebleeding)" หรือ "เสียชีวิต" สูงตามเกณฑ์ CPG',
                'shock',
                [
                    ok('A', 'อายุ 62 ปี (≥ 60 ปี)'),
                    ok('B', 'Systolic BP 90 mmHg (ภาวะช็อก)'),
                    ok('C', 'Heart rate 115 ครั้ง/นาที (> 100)'),
                    ok('D', 'ประวัติการใช้ยากลุ่ม NSAIDs'),
                    no('E', 'อาการแสบท้องบริเวณลิ้นปี่'),
                    no('F', 'ค่า WBC สูงเล็กน้อย'),
                    no('G', 'ค่า AST/ALT ที่อยู่ในเกณฑ์ปกติ')
                ],
                'ตามเกณฑ์ความเสี่ยงสูง ได้แก่ อายุ ≥ 60 ปี, มีภาวะช็อก (SBP < 100 mmHg, pulse > 100 ครั้ง/นาที) และมีโรคร่วมหรือใช้ยาที่มีความเสี่ยง',
                {
                    correct: 'ถูกต้อง — ปัจจัยเสี่ยงที่นับได้ตามเกณฑ์คือ อายุ ภาวะช็อก ชีพจรเร็ว และการใช้ยาที่ทำให้เลือดออก',
                    partial: 'ตอบถูกบางส่วน — ทบทวนเกณฑ์ตัวเลขของ SBP และ pulse ที่ใช้แบ่งกลุ่มเสี่ยง',
                    incorrect: 'ยังไม่ถูกต้อง — อาการแสบท้องและค่า WBC ที่สูงเล็กน้อยไม่ได้อยู่ในเกณฑ์ทำนายการเลือดออกซ้ำ'
                }),

            step_5_severity: step(
                'จากข้อมูล BUN 35, Hb 8.5, SBP 90, HR 115, melena และมีอาการหน้ามืด ร่วมกับผลส่องกล้อง ข้อใดสรุประดับความรุนแรงได้ถูกต้อง',
                'shock',
                [
                    ok('A', 'Glasgow-Blatchford Score = 18 จัดอยู่ในกลุ่มความเสี่ยงสูงมาก'),
                    ok('B', 'Forrest Ib (active oozing) จัดอยู่ในกลุ่มที่ต้องห้ามเลือดผ่านกล้อง'),
                    no('C', 'GBS = 5 จัดอยู่ในกลุ่มความเสี่ยงปานกลาง'),
                    no('D', 'Forrest IIa (non-bleeding visible vessel)'),
                    no('E', 'Rockall Score = 0 จัดอยู่ในกลุ่มความเสี่ยงต่ำ'),
                    no('F', 'GBS = 0 สามารถดูแลแบบผู้ป่วยนอกได้'),
                    no('G', 'Forrest III (ก้นแผลสะอาด) ความเสี่ยงเลือดออกซ้ำต่ำ')
                ],
                'คำนวณ GBS: BUN 35 (> 25) = 6, Hb 8.5 (< 10) = 6, SBP 90 = 2, HR 115 = 1, melena = 1, syncope = 2 รวม 18 คะแนน ซึ่งสูงมาก (GBS > 0 ต้องรับไว้ในโรงพยาบาลและส่องกล้องด่วน) ส่วน Forrest Ib คือแผลที่มีเลือดซึม จัดเป็นกลุ่มความเสี่ยงสูง',
                {
                    correct: 'ถูกต้อง — ทั้งคะแนน GBS และระดับ Forrest ชี้ไปทางเดียวกันว่าเป็นกลุ่มเสี่ยงสูงที่ต้องรักษาเร่งด่วน',
                    partial: 'ตอบถูกบางส่วน — ลองคำนวณ GBS ทีละองค์ประกอบจากตารางเกณฑ์ในข้อมูลอ้างอิง',
                    incorrect: 'ยังไม่ถูกต้อง — กลับไปดูค่า BUN, Hb, SBP, HR และอาการหน้ามืด แล้วเทียบกับเกณฑ์การให้คะแนน GBS'
                })
        }
    },

    stage_3_plan: {
        title: 'PLAN (วางแผนการรักษา)',
        steps: {
            step_6_current_therapy: step(
                'ในระยะเฉียบพลันที่มีเลือดออกรุนแรงนี้ ท่านจะจัดการกับยา Ibuprofen ของผู้ป่วยอย่างไร',
                'shock',
                [
                    ok('A', 'หยุดการใช้ยาทันที'),
                    ok('B', 'พิจารณาเลี่ยงไปใช้ยาแก้ปวดกลุ่มอื่นที่ไม่ใช่ NSAIDs ในอนาคต'),
                    no('C', 'ลดขนาดยาเหลือ 200 mg วันละครั้ง'),
                    no('D', 'เปลี่ยนเป็น NSAIDs ตัวอื่นที่ระคายกระเพาะน้อยกว่าในขนาดเดิม'),
                    no('E', 'หยุดยาชั่วคราว 3 วัน แล้วกลับมาใช้ต่อเมื่อเลือดหยุด'),
                    no('F', 'ให้ใช้ต่อได้แต่เพิ่มยาลดกรดชนิดรับประทานควบคู่'),
                    fat('G', 'ให้รับประทานต่อได้ แต่ต้องเปลี่ยนเป็นรับประทานหลังอาหารทันทีพร้อมน้ำเยอะ ๆ',
                        'การรับประทานหลังอาหารลดการระคายเคืองเฉพาะที่ได้บ้าง แต่ไม่ป้องกันการยับยั้ง prostaglandin ในระดับระบบ ซึ่งเป็นกลไกที่ทำให้เกิดแผล การให้ยาต่อในขณะที่มีเลือดออกทำให้แผลไม่หายและเลือดออกรุนแรงขึ้นจนผู้ป่วยเสียชีวิต')
                ],
                'ต้องหยุดยาที่เป็นสาเหตุของแผล (offending agent) ทันที การให้รับประทานต่อในขณะที่มีเลือดออกจะทำให้แผลไม่หายและเลือดออกรุนแรงขึ้นจนเสียชีวิตได้',
                {
                    correct: 'ถูกต้อง — หยุดยาต้นเหตุทันที และวางแผนทางเลือกที่ปลอดภัยกว่าสำหรับอาการปวดข้อในระยะยาว',
                    partial: 'ตอบถูกบางส่วน — การจัดการยาต้นเหตุต้องครอบคลุมทั้งระยะเฉียบพลันและแผนระยะยาว',
                    incorrect: 'ยังไม่ถูกต้อง — ยาตัวนี้คือสาเหตุของแผลและเลือดออก การลดขนาดหรือเปลี่ยนวิธีรับประทานยังไม่เพียงพอ'
                }),

            step_7_new_therapy: step(
                'ยาชนิดใดคือ first-line ที่มีหลักฐานสนับสนุนสูงสุดในการรักษาแผล PUD ที่มีเลือดออก (non-variceal bleeding) ในผู้ป่วยรายนี้',
                'stabilized',
                [
                    ok('A', 'IV Proton Pump Inhibitor เช่น Omeprazole หรือ Pantoprazole'),
                    no('B', 'Oral antacid แบบน้ำ 30 mL ทุก 2 ชั่วโมง'),
                    no('C', 'IV Ranitidine 50 mg ทุก 8 ชั่วโมง'),
                    no('D', 'IV Octreotide infusion'),
                    no('E', 'IV Tranexamic acid เพื่อช่วยห้ามเลือด'),
                    no('F', 'Sucralfate suspension รับประทานเพื่อเคลือบแผล'),
                    no('G', 'IV Vitamin K เพื่อแก้ไขการแข็งตัวของเลือด')
                ],
                'IV PPI มีประสิทธิภาพสูงสุดในการคงระดับ pH ในกระเพาะอาหารให้ > 6 เพื่อให้ลิ่มเลือดคงตัว ส่วน Octreotide ใช้สำหรับเลือดออกที่มาจากหลอดเลือดโป่งพอง (variceal bleeding) เท่านั้น',
                {
                    correct: 'ถูกต้อง — IV PPI คือยาหลักของ non-variceal bleeding',
                    partial: 'ตอบถูกบางส่วน — ทบทวนว่ายาใดออกฤทธิ์ได้เร็วและแรงพอที่จะคง pH > 6 ในภาวะเลือดออกเฉียบพลัน',
                    incorrect: 'ยังไม่ถูกต้อง — แยกให้ออกระหว่างยาที่ใช้ใน variceal bleeding กับ non-variceal bleeding และทบทวนค่า INR ของผู้ป่วย'
                }),

            step_8_goal: step(
                'เป้าหมายการจัดการ (goal of therapy) ใน 24 ชั่วโมงแรกสำหรับผู้ป่วยรายนี้คือข้อใด',
                'stabilized',
                [
                    ok('A', 'Hemodynamic stability — Systolic BP ≥ 100 mmHg'),
                    ok('B', 'รักษาระดับ Hb ให้อยู่ในช่วง 9–10 g/dL'),
                    ok('C', 'หยุดเลือดออกจากแผลให้สำเร็จ'),
                    no('D', 'กำจัดเชื้อ H. pylori ให้หมดภายใน 24 ชั่วโมง'),
                    no('E', 'ทำให้ค่า BUN กลับมาเป็นปกติภายใน 24 ชั่วโมง'),
                    no('F', 'ทำให้ผู้ป่วยกลับไปรับประทาน Ibuprofen ได้ตามปกติ'),
                    no('G', 'ลด pain score ให้เหลือ 0/10 เป็นเป้าหมายอันดับแรก')
                ],
                'เป้าหมายแรกคือการกู้ชีพ (resuscitation) เพื่อให้สัญญาณชีพคงที่ ส่วนเป้าหมาย Hb สำหรับผู้ป่วยที่มีเลือดออกรุนแรงคือ 9–10 g/dL การกำจัดเชื้อเป็นเป้าหมายระยะยาว ไม่ใช่ของ 24 ชั่วโมงแรก',
                {
                    correct: 'ถูกต้อง — เป้าหมายใน 24 ชั่วโมงแรกคือความคงที่ของระบบไหลเวียน ระดับ Hb ตามเป้า และการห้ามเลือดสำเร็จ',
                    partial: 'ตอบถูกบางส่วน — แยกให้ออกระหว่างเป้าหมายเฉียบพลันกับเป้าหมายระยะยาว',
                    incorrect: 'ยังไม่ถูกต้อง — ทบทวนเป้าหมายตัวเลขของ SBP และ Hb ในข้อมูลอ้างอิงหัวข้อการกู้ชีพ'
                }),

            step_9_therapeutic_plan: step(
                'จงเลือกแผนการสั่งยา PPI สำหรับผู้ป่วยแผล Forrest Ib รายนี้ หลังทำ endoscopic hemostasis สำเร็จ',
                'stabilized',
                [
                    ok('A', 'Omeprazole 80 mg IV bolus ทันที'),
                    ok('B', 'ตามด้วย continuous infusion 8 mg/ชั่วโมง นาน 72 ชั่วโมง'),
                    no('C', 'Omeprazole 20 mg รับประทานวันละครั้ง'),
                    no('D', 'Pantoprazole 40 mg IV push วันละ 2 ครั้ง'),
                    no('E', 'Omeprazole 80 mg IV bolus ครั้งเดียวแล้วหยุด'),
                    no('F', 'ให้ยาแบบ on-demand เมื่อผู้ป่วยมีอาการปวดท้อง'),
                    no('G', 'IV PPI นาน 24 ชั่วโมงแล้วเปลี่ยนเป็นรูปแบบรับประทานทันที')
                ],
                'เป็น high-dose PPI regimen มาตรฐานสำหรับแผลที่มีความเสี่ยงสูง (Forrest I, IIa) เพื่อป้องกันการเลือดออกซ้ำในช่วง 72 ชั่วโมงแรกซึ่งมีโอกาสเลือดออกซ้ำสูงที่สุด',
                {
                    correct: 'ถูกต้อง — bolus 80 mg ตามด้วย infusion 8 mg/ชม. ครบ 72 ชั่วโมง คือสูตรมาตรฐานของแผลกลุ่มเสี่ยงสูง',
                    partial: 'ตอบถูกบางส่วน — สูตรมาตรฐานประกอบด้วยสองส่วนเสมอ คือ loading dose และ continuous infusion',
                    incorrect: 'ยังไม่ถูกต้อง — ทบทวนขนาดยา รูปแบบการบริหาร และระยะเวลาของ high-dose IV PPI ในข้อมูลอ้างอิง'
                })
        }
    },

    stage_4_monitoring: {
        title: 'MONITORING & DISCHARGE (ติดตามและวางแผนต่อเนื่อง)',
        steps: {
            step_10_efficacy_monitoring: step(
                'พารามิเตอร์ใด "จำเป็น" ที่ต้องติดตามทุก 4–8 ชั่วโมงในช่วงแรก เพื่อประเมินภาวะเลือดออก',
                'stabilized',
                [
                    ok('A', 'Vital signs (BP, HR)'),
                    ok('B', 'Hematocrit (Hct)'),
                    ok('C', 'ลักษณะและสีของอุจจาระ หรือเลือดที่ออกจากสาย NG'),
                    no('D', 'Pain score และการเคลื่อนไหวของข้อเข่า'),
                    no('E', 'ระดับ Amylase ในเลือด'),
                    no('F', 'ระดับ Magnesium ในเลือดทุก 4–8 ชั่วโมง'),
                    no('G', 'ผลตรวจ Urea Breath Test ซ้ำทุกวัน')
                ],
                'การติดตาม vital signs และ Hct อย่างใกล้ชิดเป็นตัวบ่งชี้ความสำเร็จของการห้ามเลือดและการให้สารน้ำ ส่วนลักษณะอุจจาระและเลือดจากสาย NG บอกได้ว่ายังมีเลือดออกต่อเนื่องหรือไม่',
                {
                    correct: 'ถูกต้อง — ติดตามระบบไหลเวียน ความเข้มข้นของเลือด และหลักฐานของเลือดที่ยังออกอยู่',
                    partial: 'ตอบถูกบางส่วน — ทบทวนว่าพารามิเตอร์ใดเปลี่ยนแปลงเร็วพอที่จะจับการเลือดออกซ้ำได้ทัน',
                    incorrect: 'ยังไม่ถูกต้อง — พารามิเตอร์ที่เลือกต้องสะท้อนภาวะเลือดออกโดยตรง ไม่ใช่อาการปวดข้อหรือผลตรวจที่ใช้เวลานาน'
                }),

            step_11_adr_monitoring: step(
                'หากผู้ป่วยได้รับ IV PPI ขนาดสูงต่อเนื่อง 72 ชั่วโมง ข้อใดคืออาการไม่พึงประสงค์ (ADR) ที่ควรระวังและพบบ่อยที่สุด',
                'stabilized',
                [
                    ok('A', 'ปวดศีรษะ (headache)'),
                    ok('B', 'ท้องเสีย (diarrhea)'),
                    no('C', 'ไตวายเฉียบพลัน'),
                    no('D', 'ใจสั่นและมือสั่น'),
                    no('E', 'ภาวะน้ำตาลในเลือดต่ำ'),
                    no('F', 'ผมร่วงเฉียบพลัน'),
                    no('G', 'ความดันโลหิตสูงขึ้นอย่างรุนแรง')
                ],
                'ปวดศีรษะและท้องเสียเป็นอาการข้างเคียงหลักที่รายงานในยากลุ่ม PPI',
                {
                    correct: 'ถูกต้อง — เป็นอาการข้างเคียงที่พบบ่อยที่สุดของยากลุ่ม PPI',
                    partial: 'ตอบถูกบางส่วน — ยากลุ่มนี้มีอาการข้างเคียงที่พบบ่อยมากกว่าหนึ่งอย่าง',
                    incorrect: 'ยังไม่ถูกต้อง — ทบทวนหัวข้อ PPI — อาการไม่พึงประสงค์ ในข้อมูลอ้างอิง'
                }),

            step_12_patient_education: step(
                'หัวข้อ counseling ใด "วิกฤต" ที่สุดที่ต้องเน้นย้ำกับผู้ป่วยก่อนจำหน่ายออกจากด่านนี้',
                'recovered',
                [
                    ok('A', 'งดดื่มสุราอย่างเด็ดขาด'),
                    ok('B', 'ห้ามซื้อยาแก้ปวดกลุ่ม NSAIDs หรือยาชุดมารับประทานเองโดยไม่ปรึกษาแพทย์หรือเภสัชกร'),
                    ok('C', 'สอนให้สังเกตอาการเตือน เช่น ถ่ายดำ หรืออาเจียนเป็นเลือด'),
                    no('D', 'แนะนำให้เคี้ยวอาหารให้ละเอียด'),
                    no('E', 'ให้รับประทานยาลดกรดเฉพาะตอนที่มีอาการปวดท้อง'),
                    no('F', 'แนะนำให้ดื่มนมก่อนรับประทานยาแก้ปวดทุกครั้ง'),
                    no('G', 'ไม่ต้องมาตรวจติดตามผลหากไม่มีอาการแล้ว')
                ],
                'ปัจจัยกระตุ้นหลักคือ NSAIDs และแอลกอฮอล์ หากไม่หยุดจะเกิดการเลือดออกซ้ำซึ่งอันตรายถึงชีวิต และผู้ป่วยต้องรู้จักอาการเตือนเพื่อกลับมาโรงพยาบาลได้ทัน',
                {
                    correct: 'ถูกต้อง — ตัดปัจจัยกระตุ้นทั้งสองอย่าง และทำให้ผู้ป่วยรู้ว่าเมื่อใดต้องกลับมาโรงพยาบาล',
                    partial: 'ตอบถูกบางส่วน — ทบทวน social history และ medication history ว่ามีพฤติกรรมใดบ้างที่ต้องแก้ไข',
                    incorrect: 'ยังไม่ถูกต้อง — คำแนะนำที่วิกฤตที่สุดต้องมุ่งไปที่สาเหตุที่ทำให้ผู้ป่วยกลับมาเลือดออกซ้ำได้'
                }),

            step_13_future_plan: step(
                'หลังจากหยุดเลือดได้สำเร็จและสัญญาณชีพคงที่ แผนถัดไปที่สำคัญที่สุดคืออะไร',
                'recovered',
                [
                    ok('A', 'เริ่ม eradication therapy สำหรับ H. pylori นาน 14 วัน'),
                    ok('B', 'ใช้สูตร Standard Triple Therapy (PPI + Amoxicillin 1 g + Clarithromycin 500 mg วันละ 2 ครั้ง)'),
                    ok('C', 'นัดส่องกล้อง EGD ติดตามผลใน 6–8 สัปดาห์'),
                    no('D', 'ให้รับประทาน PPI ต่อเนื่องไปตลอดชีวิตโดยไม่ต้องตรวจซ้ำ'),
                    no('E', 'แนะนำให้ผ่าตัดตัดกระเพาะอาหารออกเพื่อป้องกันมะเร็ง'),
                    no('F', 'ให้ยาปฏิชีวนะกำจัดเชื้อเพียง 7 วันก็เพียงพอ'),
                    no('G', 'ไม่ต้องกำจัดเชื้อเพราะมีประวัติใช้ NSAIDs ชัดเจนอยู่แล้ว')
                ],
                'การกำจัดเชื้อ H. pylori เป็นหัวใจสำคัญในการลดอัตราการเป็นซ้ำของแผล และแผลที่ gastric antrum ต้องมีการส่องกล้องติดตามการหายของแผลเพื่อคัดกรองมะเร็ง',
                {
                    correct: 'ถูกต้อง — กำจัดเชื้อครบ 14 วัน แล้วส่องกล้องซ้ำเพื่อยืนยันว่าแผลหายและคัดกรองมะเร็ง',
                    partial: 'ตอบถูกบางส่วน — แผนระยะยาวประกอบด้วยทั้งการกำจัดเชื้อ สูตรยาที่ถูกต้อง และการติดตามด้วยการส่องกล้อง',
                    incorrect: 'ยังไม่ถูกต้อง — ทบทวนสูตรและระยะเวลาของ eradication therapy และเหตุผลที่แผลในกระเพาะต้องส่องกล้องซ้ำ'
                })
        }
    }
};

// ── CASE ────────────────────────────────────────────────────────
const caseData = {
    case_id: 'case_001',
    // Bump whenever step ids change, so instructor analytics can tell that
    // older attempts measured a different set of questions.
    case_version: 3,
    map_title: 'ด่านที่ 1 · ห้องฉุกเฉิน',
    map_subtitle: 'ชายไทย 62 ปี อาเจียนเป็นเลือดสด และถ่ายอุจจาระดำเหลว 2 ชั่วโมงก่อนมาโรงพยาบาล',
    ward: 'Emergency Room',
    // Revealed on the end-of-case screen only.
    case_title: 'Acute Upper GI Bleeding from Peptic Ulcer Disease — NSAID + H. pylori, Gastric Antral Ulcer (Forrest Ib)',
    difficulty: 'Advanced',
    tags: ['Gastroenterology', 'Critical Care', 'Pharmacotherapy'],

    patient: {
        name: 'นายวิชัย',
        age: 62,
        sex: 'M',
        // The dataset records occupation as absent; nothing is invented here.
        occupation: null,
        chief_complaint: 'อาเจียนเป็นเลือดสีแดงสด และถ่ายอุจจาระเป็นสีดำเหลว 2 ชั่วโมงก่อนมาโรงพยาบาล'
        // `acuity` and `status_tags` are intentionally absent: labels such as
        // "HIGH ACUITY" / "Hypovolemic Shock" / "NSAID use" name the answers
        // to Step 1 and Step 3 before the learner has reasoned to them.
    },

    vitals,

    renal: {
        // Body weight is not in the source dataset, so Cockcroft-Gault cannot
        // be computed and the badge shows "—" rather than a number derived
        // from an invented weight.
        weight_kg: null,
        height_cm: null,
        scr_mg_dl: 1.0,
        bun_mg_dl: 35,
        note: null
    },

    dtp: {
        // Attached to the DRPs step, where the learner is already reasoning
        // about what the drug did to this patient.
        step_id: 'step_2_drps',
        correct_ids: [5],
        rationale: 'Ibuprofen 400 mg วันละ 3 ครั้ง ต่อเนื่อง 2 สัปดาห์ ทำให้เกิดแผลและเลือดออกในทางเดินอาหาร ซึ่งเป็นอาการไม่พึงประสงค์จากยาที่เกิดขึ้นแล้ว (Adverse Drug Reaction) ผู้ป่วยมีข้อบ่งชี้ในการใช้ยาและใช้ตามสั่ง ปัญหาจึงอยู่ที่ความปลอดภัย ไม่ใช่ข้อบ่งชี้หรือความร่วมมือ'
    },

    monitoring: {
        regimen: 'Fluid resuscitation ด้วย isotonic crystalloid → High-dose IV PPI (Omeprazole 80 mg bolus → 8 mg/ชม. นาน 72 ชม.) → Endoscopic hemostasis ภายใน 24 ชม. → H. pylori eradication 14 วัน',
        efficacy: [
            { param: 'Vital signs (BP / HR)', target: 'Systolic BP ≥ 100 mmHg, HR < 100 ครั้ง/นาที', when: 'ทุก 4–8 ชม. ในช่วงแรก' },
            { param: 'Hematocrit (Hct)', target: 'ไม่ลดลงต่อเนื่อง สอดคล้องกับ Hb 9–10 g/dL', when: 'ทุก 4–8 ชม.' },
            { param: 'ลักษณะอุจจาระ / เลือดจากสาย NG', target: 'ไม่มีเลือดสดออกซ้ำ อุจจาระกลับเป็นสีปกติ', when: 'ทุกครั้งที่ถ่ายและทุกเวร' },
            { param: 'Hemoglobin (Hb)', target: 'คงอยู่ในช่วง 9–10 g/dL', when: 'ทุก 4–8 ชม. หลังให้เลือด' },
            { param: 'BUN', target: 'ลดลงเข้าสู่เกณฑ์ปกติ (7–20 mg/dL)', when: 'ทุก 24 ชม.' },
            { param: 'ผลกำจัดเชื้อ H. pylori', target: 'ผลตรวจติดตามเป็นลบ', when: 'หลังครบสูตรยา 14 วัน' }
        ],
        safety: [
            { param: 'ปวดศีรษะ (headache)', watch: 'อาการไม่พึงประสงค์ที่พบบ่อยที่สุดของ PPI', when: 'ทุกเวรขณะได้รับ infusion' },
            { param: 'ท้องเสีย (diarrhea)', watch: 'อาการไม่พึงประสงค์ที่พบบ่อยของ PPI', when: 'ทุกเวรขณะได้รับ infusion' },
            { param: 'ปวดท้องรุนแรง / หน้าท้องแข็งเกร็ง', watch: 'สัญญาณของแผลทะลุ (perforation) — รายงานแพทย์ทันที', when: 'ทุกเวร' },
            { param: 'อาเจียนเป็นเลือดซ้ำ', watch: 'สัญญาณของการเลือดออกซ้ำ (rebleeding)', when: 'ตลอดเวลา' },
            { param: 'ปฏิกิริยาจากการให้เลือด', watch: 'ไข้ หนาวสั่น ผื่น หายใจลำบาก', when: 'ระหว่างและหลังให้เลือด' },
            { param: 'ผลข้างเคียงของสูตรกำจัดเชื้อ', watch: 'คลื่นไส้ รสชาติผิดปกติ ท้องเสีย จากยาปฏิชีวนะ', when: 'ตลอด 14 วันที่ได้รับยา' }
        ]
    },

    reference,
    stages,

    // Not rendered anywhere in the player UI. Kept so the clinical reasoning
    // behind the case is not lost from the repository — and because every line
    // below is the answer to a step the learner is about to be asked.
    authoring_notes: {
        subjective_summary: 'ผู้ป่วยชาย 62 ปี ใช้ Ibuprofen 400 mg tid ต่อเนื่อง 2 สัปดาห์โดยไม่มียาป้องกันกระเพาะ ร่วมกับประวัติ PUD เดิมและการดื่มสุราเรื้อรัง',
        objective_summary: 'Acute UGIB จาก gastric antral ulcer ระยะ Forrest Ib ร่วมกับภาวะช็อกจากการเสียเลือด และ RUT positive',
        vitals_interpretation: 'BP 90/60 = hypotension; HR 115 = tachycardia; RR 22 = tachypnea; Temp 36.5 และ SpO₂ 96% ปกติ — เข้าได้กับ hypovolemic shock Class II–III',
        lab_interpretation: 'Hb 8.5 และ Hct 26 = low; WBC 12,500 = high; platelet, Cr, INR, AST/ALT ปกติ; BUN 35 สูงขึ้นจากการย่อยสลายโปรตีนจากเลือดในทางเดินอาหารส่วนต้นร่วมกับ prerenal azotaemia',
        negative_findings_significance: 'ไม่มีดีซ่านและไม่มีท้องมาน ช่วยลดโอกาสที่เลือดออกจะมาจาก varices จากตับแข็ง; ไม่มี petechiae/ecchymosis ลดโอกาสความผิดปกติของการแข็งตัวของเลือด; ไม่มี guarding/rebound ช่วยคัดกรองว่ายังไม่มีแผลทะลุ',
        gbs_calculation: 'BUN 35 (> 25) = 6, Hb 8.5 (< 10) = 6, SBP 90 = 2, HR 115 = 1, melena = 1, syncope = 2 → รวม 18 คะแนน',
        forrest_interpretation: 'Forrest Ib = active oozing = กลุ่มเสี่ยงสูงต่อการเลือดออกซ้ำ ต้องทำ endoscopic hemostasis และให้ high-dose IV PPI 72 ชม.',
        etiology: 'NSAIDs ยับยั้ง COX ทำให้ prostaglandin ที่ปกป้องเยื่อบุลดลง ร่วมกับ H. pylori ที่ทำลายเยื่อบุโดยตรง เป็น synergistic effect',
        plan_summary: '(1) Fluid resuscitation แก้ภาวะช็อก (2) High-dose IV PPI 80 mg bolus + 8 mg/hr drip (3) Endoscopic hemostasis ภายใน 24 ชม. เนื่องจาก GBS สูงและแผลเป็น Forrest Ib',
        sources: [
            'แนวทางการดูแลรักษาผู้ป่วยภาวะเลือดออกในทางเดินอาหารส่วนต้นในประเทศไทย พ.ศ. 2557',
            'GI Emergencies',
            'Peptic Ulcer Disease Guideline — Froedtert',
            '2024 ACG Clinical Guideline: Treatment of Helicobacter pylori Infection'
        ]
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
