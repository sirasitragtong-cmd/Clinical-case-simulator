/**
 * i18n.js — Thai / English interface language for the Clinical Case Simulator.
 *
 * Why this file exists: the simulator was authored in Thai for a Thai pharmacy
 * programme, and is now also used by students who do not read Thai. Rather than
 * fork the app, every Thai string the interface can emit lives here beside its
 * English counterpart, and the rest of the code asks for a key.
 *
 * ── Which language a visitor gets ──────────────────────────────────────────
 *   1. An explicit choice, if they have made one (localStorage).
 *   2. Otherwise the browser's own language list: any tag starting with "th"
 *      means Thai. Everything else gets English.
 *
 * Auto-detection alone is not enough and is never treated as final. A Thai
 * student on a laptop shipped with an English locale would be handed an English
 * simulator and no way out, so the header carries a visible TH/EN switch and the
 * choice is remembered. Detection is a good first guess, not a verdict.
 *
 * ── Why switching reloads the page ─────────────────────────────────────────
 * Almost every panel here is built as an HTML string at render time. Re-running
 * each of those in place would leave whichever fragment was missed sitting in
 * the old language — a bug that only shows up on the screen nobody re-tested.
 * A reload cannot get that wrong. It is only offered outside an active case, so
 * it never discards work in progress.
 *
 * ── What is NOT translated ────────────────────────────────────────────────
 * Strings that were already English stay English in both languages. The login
 * screen, the panel headings and the clinical vocabulary printed on the case
 * (SOAP, Subjective, Objective, DTP, CrCl, Fatal) are the terms the curriculum
 * itself uses, and Thai pharmacy students read them in English on the ward.
 * Translating them "back" into Thai would change what today's users see for no
 * one's benefit.
 *
 * Clinical case content is not here either — it lives beside each case file as
 * data/<case>.en.json, so a pharmacist can review a whole translated case as
 * one document instead of hunting keys.
 */
(function() {
    'use strict';

    const STORE_KEY = 'ccs_lang_v1';
    const SUPPORTED = ['th', 'en'];

    // ═══ DICTIONARY ════════════════════════════════════════════════════════
    // Keys are grouped by where they appear. Placeholders are {name} and are
    // substituted by t(); a missing placeholder is left visible rather than
    // silently blanked, so an authoring slip shows up immediately.
    const DICT = {

        // ── Boot / shell ──────────────────────────────────────────────
        'splash.restoring':      { th: 'กำลังกู้คืนเซสชันของคุณ', en: 'Restoring your session' },
        'nav.logout':            { th: 'ออกจากระบบ', en: 'Sign out' },
        'nav.exitCase':          { th: 'ออกจากเคส', en: 'Leave case' },
        'common.refresh':        { th: '↻ รีเฟรช', en: '↻ Refresh' },
        'common.patient':        { th: 'ผู้ป่วย', en: 'Patient' },
        'common.answerKey':      { th: 'เฉลย', en: 'Answer' },
        'narrative.line':        { th: '{name} อายุ {age} ปี', en: '{name}, {age} years old' },
        'lang.switchTitle':      { th: 'Switch to English', en: 'เปลี่ยนเป็นภาษาไทย' },

        // ── Campaign panel ────────────────────────────────────────────
        'campaign.title':        { th: 'เลือกกรณีศึกษา', en: 'Choose a case' },
        'campaign.subtitle':     { th: 'แต่ละเคสดำเนินตามกระบวนการ SOAP — DATA → IDENTIFY → ASSESSMENT → PLAN',
                                   en: 'Every case runs the SOAP process — DATA → IDENTIFY → ASSESSMENT → PLAN' },
        'campaign.noCases':      { th: 'ไม่พบข้อมูลเคส — ตรวจสอบไฟล์ใน data/',
                                   en: 'No cases found — check the files in data/' },
        'campaign.lockedTitle':  { th: 'ด่านถัดไป', en: 'Next stage' },
        'campaign.lockedBody':   { th: 'ผ่านด่านก่อนหน้าเพื่อปลดล็อกเส้นทางนี้',
                                   en: 'Clear the previous stage to unlock this path' },
        'campaign.lockedBtn':    { th: '🔒 ยังไม่ปลดล็อก', en: '🔒 Locked' },
        'campaign.stageN':       { th: 'ด่านที่ {n}', en: 'Stage {n}' },
        'campaign.replay':       { th: '↻ เล่นซ้ำ', en: '↻ Replay' },
        'campaign.start':        { th: '▶ เริ่มภารกิจ', en: '▶ Start mission' },

        // ── Practice streak ───────────────────────────────────────────
        'streak.days':           { th: 'วันติดต่อกัน', en: 'day streak' },
        'streak.best':           { th: 'สถิติสูงสุด {n} วัน', en: 'Best {n} days' },
        'streak.doneToday':      { th: '✓ วันนี้ฝึกแล้ว — พรุ่งนี้กลับมาต่อเพื่อรักษาสถิติ',
                                   en: '✓ Practised today — come back tomorrow to keep the streak' },
        'streak.todo':           { th: 'ตอบคำถามอย่างน้อย 1 ข้อวันนี้ เพื่อต่อสถิติของคุณ',
                                   en: 'Answer at least one question today to extend your streak' },
        'streak.dayLabels':      { th: ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'],
                                   en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] },

        // ── Session labels ────────────────────────────────────────────
        'session.anon':          { th: 'Anonymous · ไม่บันทึกผล', en: 'Anonymous · not saved' },
        'session.signedIn':      { th: 'Signed In · บันทึกผลแล้ว', en: 'Signed in · progress saved' },

        // ── Auth toasts ───────────────────────────────────────────────
        'auth.genericError':     { th: 'เกิดข้อผิดพลาด', en: 'Something went wrong' },
        'auth.loginFailed':      { th: '❌ เข้าสู่ระบบไม่สำเร็จ: {msg}', en: '❌ Sign-in failed: {msg}' },
        'auth.guestFailed':      { th: '❌ เข้าสู่โหมด Guest ไม่สำเร็จ: {msg}', en: '❌ Could not start guest mode: {msg}' },
        'auth.guestNotice':      { th: '⚠ โหมด Anonymous — คะแนนจะไม่ถูกบันทึก',
                                   en: '⚠ Anonymous mode — your scores will not be saved' },

        // ── Launcher ──────────────────────────────────────────────────
        'launch.caseFailed':     { th: '❌ ไม่สามารถเริ่มเคสได้ — ข้อมูล JSON ไม่ถูกต้อง',
                                   en: '❌ Could not start the case — the JSON is not valid' },
        'launch.confirmExit':    { th: 'ออกจากเคสนี้? ความก้าวหน้าจะถูกบันทึก',
                                   en: 'Leave this case? Your progress will be saved.' },
        'launch.caseFallback':   { th: 'ℹ เคสนี้ยังไม่มีฉบับแปลภาษาอังกฤษ — กำลังแสดงฉบับภาษาไทย',
                                   en: 'ℹ No English version of this case yet — showing the Thai original' },

        // ── SOAP tabs / patient chart ─────────────────────────────────
        'soap.cpg':              { th: '📚 อ้างอิง', en: '📚 Refs' },
        'soap.noSubjective':     { th: 'ไม่มีข้อมูล Subjective', en: 'No subjective data' },
        'soap.noObjective':      { th: 'ไม่มีข้อมูล Objective', en: 'No objective data' },
        'soap.monUnlocked':      { th: 'กรอบการติดตามผล — เปิดใช้งานแล้ว', en: 'Monitoring framework — unlocked' },
        'soap.monLockedTip':     { th: 'ยังล็อกอยู่ — จะเปิดเมื่อท่านส่งคำตอบข้อแรกของด่าน Monitoring',
                                   en: 'Still locked — opens when you submit your first Monitoring answer' },

        // ── Reference tab ─────────────────────────────────────────────
        'ref.none':              { th: 'เคสนี้ยังไม่มีข้อมูลอ้างอิง — เพิ่มฟิลด์ <code class="text-teal-400">reference</code> ใน case JSON เพื่อแสดงที่นี่',
                                   en: 'This case has no reference material — add a <code class="text-teal-400">reference</code> field to the case JSON to show it here' },
        'ref.title':             { th: 'ข้อมูลอ้างอิง', en: 'Reference' },

        // ── Renal quick-calc ──────────────────────────────────────────
        'renal.weightNote':      { th: 'น้ำหนัก {kg} kg · คำนวณด้วยสูตร Cockcroft-Gault',
                                   en: 'Weight {kg} kg · calculated with the Cockcroft-Gault equation' },
        'renal.adjustNote':      { th: 'ตรวจสอบขนาดยาทุกตัวที่ขับออกทางไตก่อนสั่งจ่าย',
                                   en: 'Check the dose of every renally cleared drug before dispensing' },

        // ── Monitoring lock ───────────────────────────────────────────
        'mon.lockedTitle':       { th: 'ยังไม่เปิดใช้งาน', en: 'Not unlocked yet' },
        'mon.lockedBody':        { th: 'แท็บนี้เก็บ <strong class="text-slate-200">กรอบการติดตามผล (Monitoring Framework)</strong> ซึ่งเป็นเฉลยของด่าน Monitoring โดยตรง จึงถูกล็อกไว้จนกว่าท่านจะวางแผนการติดตามด้วยตนเองก่อน',
                                   en: 'This tab holds the <strong class="text-slate-200">monitoring framework</strong>, which is the answer key to the Monitoring stage. It stays locked until you have planned your own follow-up first.' },
        'mon.lockedOpens':       { th: '🔓 จะเปิดอัตโนมัติทันทีที่ท่านส่งคำตอบข้อแรกของด่าน',
                                   en: '🔓 Opens automatically the moment you submit your first answer in the' },
        'mon.lockedStage':       { th: '—', en: 'stage —' },
        'mon.hasFramework':      { th: 'เคสนี้มีข้อมูลกรอบการติดตามพร้อมแสดงแล้ว',
                                   en: 'this case has a monitoring framework ready to show' },
        'mon.noFramework':       { th: 'แต่เคสนี้ยังไม่ได้เขียนกรอบการติดตามไว้ จึงจะขึ้นข้อความแจ้งแทน',
                                   en: 'but no framework was authored for this case, so a notice will appear instead' },
        'mon.notABug':           { th: 'ระหว่างนี้ใช้แท็บ Subj / Obj / อ้างอิง ได้ตามปกติ — นี่ไม่ใช่ข้อผิดพลาด',
                                   en: 'Meanwhile the Subj / Obj / Refs tabs work as usual — this is not a fault' },
        'mon.empty':             { th: 'ยังไม่มีกรอบการติดตามสำหรับเคสนี้',
                                   en: 'No monitoring framework has been written for this case' },

        // ── DTP tagger ────────────────────────────────────────────────
        'dtp.instruction':       { th: 'จำแนกประเภทของปัญหาจากการใช้ยาก่อน แล้วจึงเลือกคำตอบด้านล่าง',
                                   en: 'Classify the drug therapy problem first, then choose your answers below' },
        'dtp.correct':           { th: '✓ จำแนก DTP ถูกต้อง', en: '✓ DTP classified correctly' },
        'dtp.wrong':             { th: '✕ จำแนก DTP ยังไม่ตรง', en: '✕ DTP classification does not match' },
        'dtp.needTag':           { th: '🏷 เลือกประเภท DTP ก่อน', en: '🏷 Tag the DTP first' },
        'dtp.1':                 { th: 'ได้รับยาโดยไม่จำเป็น', en: 'Unnecessary Drug Therapy' },
        'dtp.2':                 { th: 'ต้องการยาเพิ่ม', en: 'Needs Additional Drug Therapy' },
        'dtp.3':                 { th: 'ยาไม่ได้ผล', en: 'Ineffective Drug' },
        'dtp.4':                 { th: 'ขนาดยาต่ำเกินไป', en: 'Dosage Too Low' },
        'dtp.5':                 { th: 'อาการไม่พึงประสงค์จากยา', en: 'Adverse Drug Reaction' },
        'dtp.6':                 { th: 'ขนาดยาสูงเกินไป', en: 'Dosage Too High' },
        'dtp.7':                 { th: 'ไม่ให้ความร่วมมือในการใช้ยา', en: 'Non-adherence' },

        // ── Info step ─────────────────────────────────────────────────
        'info.objective':        { th: 'Objective — ผลตรวจร่างกายและแล็บ', en: 'Objective — examination and laboratory findings' },
        'info.subjective':       { th: 'Subjective — ประวัติจากผู้ป่วย', en: 'Subjective — history from the patient' },
        'info.tag':              { th: 'รวบรวมข้อมูล', en: 'Data gathering' },
        'info.body':             { th: 'เปิดแฟ้มผู้ป่วยเพื่ออ่านข้อมูลให้ครบก่อน แล้วจึงดำเนินการต่อ',
                                   en: 'Open the patient file and read it through before moving on' },
        'info.openChart':        { th: '📄 เปิดแฟ้มผู้ป่วย', en: '📄 Open patient file' },
        'info.chartHint':        { th: '← ดูแฟ้มผู้ป่วยที่คอลัมน์ซ้าย', en: '← The patient file is in the left column' },
        'info.next':             { th: 'อ่านเข้าใจแล้ว / ถัดไป →', en: 'Read and understood / Next →' },

        // ── MCQ ───────────────────────────────────────────────────────
        'mcq.singleHint':        { th: 'ⓘ เลือก 1 คำตอบที่เหมาะสมที่สุด', en: 'ⓘ Choose the single best answer' },
        'mcq.multiHint':         { th: 'ⓘ เลือกได้มากกว่าหนึ่งข้อ — ตอบผิดมีการหักคะแนน',
                                   en: 'ⓘ More than one answer may apply — wrong picks lose points' },
        'mcq.selectedCount':     { th: 'เลือกแล้ว <strong id="multi-count" class="text-white">0</strong> ข้อ',
                                   en: '<strong id="multi-count" class="text-white">0</strong> selected' },

        // ── Feedback ──────────────────────────────────────────────────
        'fb.correct':            { th: 'ถูกต้อง!', en: 'Correct!' },
        'fb.incorrect':          { th: 'ยังไม่ถูกต้อง', en: 'Not correct' },
        'fb.allCorrect':         { th: 'ถูกต้องทั้งหมด!', en: 'All correct!' },
        'fb.partial':            { th: 'ถูกบางส่วน', en: 'Partly correct' },
        'fb.next':               { th: 'ขั้นตอนถัดไป →', en: 'Next step →' },
        'fb.hits':               { th: 'ตอบถูก {hits} จาก {total} ข้อ', en: '{hits} of {total} correct' },
        'fb.misses':             { th: '· ตอบผิด <strong class="text-acuity-500">{n}</strong> ข้อ (−{lost})',
                                   en: '· <strong class="text-acuity-500">{n}</strong> wrong (−{lost})' },

        // ── End screens ───────────────────────────────────────────────
        'end.stepsDone':         { th: 'ทำได้ {done} / {total} ขั้นตอน', en: 'Completed {done} of {total} steps' },
        'end.return':            { th: '← กลับสู่ Campaign Map', en: '← Back to Campaign Map' },
        'over.title':            { th: 'Game Over — การตัดสินใจถึงแก่ชีวิต', en: 'Game Over — a fatal decision' },
        'over.message':          { th: 'การตัดสินใจนี้ก่อให้เกิดอันตรายร้ายแรงต่อผู้ป่วย',
                                   en: 'That decision caused serious harm to the patient' },
        'over.footnote':         { th: 'ทบทวนเหตุผลทางเภสัชวิทยา แล้วลองเล่นเคสนี้ใหม่อีกครั้ง',
                                   en: 'Review the pharmacological reasoning, then try this case again' },
        'win.title':             { th: 'ผ่านด่านแล้ว!', en: 'Stage cleared!' },
        'win.message':           { th: 'คำวินิจฉัยของเคสนี้คือ {dx}', en: 'The diagnosis in this case was {dx}' },
        'win.footnote':          { th: 'ผลคะแนนถูกบันทึกเมื่อเข้าสู่ระบบด้วยบัญชี Google',
                                   en: 'Scores are saved when you are signed in with a Google account' },

        // ── Patient avatar ────────────────────────────────────────────
        'avatar.female':         { th: 'ภาพผู้ป่วยหญิง', en: 'Illustration of a female patient' },
        'avatar.male':           { th: 'ภาพผู้ป่วยชาย', en: 'Illustration of a male patient' },

        // ── Panel loading / empty / blocked states ────────────────────
        'state.loadingStats':    { th: 'กำลังโหลดสถิติจาก Firestore…', en: 'Loading your stats from Firestore…' },
        'state.loadingRank':     { th: 'กำลังจัดอันดับ…', en: 'Building the ranking…' },
        'state.loadingAch':      { th: 'กำลังตรวจสอบความสำเร็จ…', en: 'Checking your achievements…' },
        'state.loadingCohort':   { th: 'กำลังรวบรวมข้อมูลของนักศึกษา…', en: 'Gathering student data…' },
        'state.noAttempts':      { th: 'ยังไม่มีประวัติการเล่น — เล่นเคสให้จบสักครั้งแล้วกลับมาดูใหม่',
                                   en: 'No attempts yet — finish a case once and come back' },
        'state.noRanked':        { th: 'ยังไม่มีผู้เล่นที่ทำคะแนนไว้', en: 'Nobody has posted a score yet' },
        'state.noSubmissions':   { th: 'ยังไม่มีการส่งผลจากนักศึกษา', en: 'No student submissions yet' },
        'state.signedOutTitle':  { th: 'ต้องเข้าสู่ระบบก่อน', en: 'Sign-in required' },
        'state.signedOutBody':   { th: 'โหมด Anonymous ไม่บันทึกผล จึงไม่มีสถิติให้แสดง',
                                   en: 'Anonymous mode saves nothing, so there are no stats to show' },
        'state.deniedTitle':     { th: 'Firestore ปฏิเสธการอ่านข้อมูล', en: 'Firestore refused the read' },
        'state.deniedBody':      { th: 'Security Rules ของคอลเลกชัน <code class="text-teal-400">user_attempts</code> ยังไม่อนุญาตให้อ่าน — ต้องแก้ที่ Firebase Console',
                                   en: 'The security rules on the <code class="text-teal-400">user_attempts</code> collection do not allow reads yet — fix this in the Firebase Console' },
        'state.indexTitle':      { th: 'ยังไม่ได้สร้าง Composite Index', en: 'Composite index not created' },
        'state.indexBody':       { th: 'Deploy ไฟล์ <code class="text-teal-400">firestore.indexes.json</code> ด้วยคำสั่ง <code class="text-teal-400">firebase deploy --only firestore:indexes</code>',
                                   en: 'Deploy <code class="text-teal-400">firestore.indexes.json</code> with <code class="text-teal-400">firebase deploy --only firestore:indexes</code>' },
        'state.offlineTitle':    { th: 'เชื่อมต่อฐานข้อมูลไม่ได้', en: 'Cannot reach the database' },

        // ── My Stats ──────────────────────────────────────────────────
        'stats.subtitle':        { th: 'สถิติจากผลการเล่นจริงของคุณใน Firestore',
                                   en: 'Built from your own attempts in Firestore' },
        'stats.daysPlayed':      { th: '{n} วันที่เล่น', en: '{n} days played' },
        'stats.points':          { th: '{n} คะแนน', en: '{n} points' },
        'stats.median':          { th: 'มัธยฐาน {n}%', en: 'Median {n}%' },
        'stats.aboveOwnAvg':     { th: 'สูงกว่าค่าเฉลี่ยตัวเอง', en: 'Above your own average' },
        'stats.belowOwnAvg':     { th: 'ต่ำกว่าค่าเฉลี่ยตัวเอง', en: 'Below your own average' },
        'stats.fullRuns':        { th: 'จบครบด่าน {n} ครั้ง', en: '{n} full runs' },
        'stats.fatalShare':      { th: '{n}% ของการเล่น', en: '{n}% of attempts' },
        'stats.safeRunSub':      { th: 'ไม่เจอ Fatal ติดกัน', en: 'Consecutive runs without a fatal' },
        'stats.streakUnit':      { th: '{n} วัน', en: '{n} days' },
        'stats.streakBest':      { th: 'สถิติสูงสุด {n} วัน', en: 'Best {n} days' },
        'stats.stepsAnswered':   { th: 'ข้อที่ตอบ', en: 'Steps answered' },
        'stats.perfectSteps':    { th: 'ถูกครบข้อ {n} ข้อ', en: '{n} answered perfectly' },
        'stats.noStepData':      { th: 'ยังไม่มีข้อมูลรายข้อ', en: 'No per-step data yet' },
        'stats.wrongPicks':      { th: 'ตอบผิดสะสม', en: 'Wrong picks' },
        'stats.wrongPicksSub':   { th: 'ตัวเลือกที่เลือกผิด', en: 'Options picked in error' },
        'stats.totalTime':       { th: 'เวลารวม', en: 'Total time' },
        'stats.avgPerRun':       { th: 'เฉลี่ย {d}/ครั้ง', en: '{d} per attempt' },
        'stats.noTimeData':      { th: 'ยังไม่มีข้อมูลเวลา', en: 'No timing data yet' },
        'stats.dtpSub':          { th: 'ระบุปัญหาถูกต้อง', en: 'Problems identified correctly' },
        'stats.retiredStep':     { th: '{id} (ข้อที่ถูกยกเลิก)', en: '{id} (retired step)' },
        'stats.accWrong':        { th: '{acc}% · ผิด {n}', en: '{acc}% · {n} wrong' },
        'stats.timesN':          { th: '{n} ครั้ง', en: '{n} attempts' },
        'stats.timesBest':       { th: '{n} ครั้ง · ดีสุด {best}%', en: '{n} attempts · best {best}%' },
        'stats.trendNeedTwo':    { th: 'ต้องเล่นอย่างน้อย 2 ครั้งจึงจะวาดกราฟแนวโน้มได้',
                                   en: 'At least two attempts are needed to draw a trend' },
        'stats.trendAria':       { th: 'แนวโน้มคะแนน {n} ครั้งล่าสุด', en: 'Score trend over the last {n} attempts' },
        'stats.trendLegend':     { th: 'เส้นประ = เกณฑ์ 80% · จุดแดง = จบด้วย Fatal · เก่า → ใหม่',
                                   en: 'Dashed line = 80% threshold · red dot = ended fatally · oldest → newest' },
        'stats.noTeleTitle':     { th: 'ยังไม่มีข้อมูลเชิงลึกรายข้อ', en: 'No per-step detail yet' },
        'stats.noTeleBody':      { th: 'การวิเคราะห์รายข้อ รายด่าน เวลาที่ใช้ และช่วงเวลาที่เล่น เริ่มเก็บตั้งแต่รุ่นนี้เป็นต้นไป ผลการเล่นเดิมยังนับรวมในคะแนนทุกช่อง แต่ไม่มีข้อมูลรายข้อให้วิเคราะห์ — เล่นอีกครั้งแล้วส่วนนี้จะขึ้นมาเอง',
                                   en: 'Per-step, per-stage, duration and time-of-day analysis is only recorded from this build onward. Older attempts still count towards every score above, but carry no step detail to analyse — play once more and this section fills itself in.' },
        'stats.secTrend':        { th: 'แนวโน้มคะแนน', en: 'Score trend' },
        'stats.secTrendNote':    { th: '{n} ครั้งล่าสุด', en: 'last {n} attempts' },
        'stats.secStage':        { th: 'ความแม่นยำรายด่าน', en: 'Accuracy by stage' },
        'stats.secStageNote':    { th: 'คะแนนที่ได้ ÷ คะแนนเต็มของด่านนั้น', en: 'points earned ÷ points available in that stage' },
        'stats.secWeak':         { th: 'ข้อที่ควรทบทวน', en: 'Steps to review' },
        'stats.secWeakNote':     { th: 'เรียงจากอัตราตอบถูกครบข้อต่ำสุด', en: 'lowest perfect-answer rate first' },
        'stats.secByCase':       { th: 'แยกตามเคส', en: 'By case' },
        'stats.secHours':        { th: 'ช่วงเวลาที่เล่นบ่อย', en: 'When you practise' },
        'stats.secHoursNote':    { th: 'ตามนาฬิกาเครื่องคุณ', en: 'by your device clock' },
        'stats.secRecent':       { th: 'ประวัติล่าสุด', en: 'Recent attempts' },

        // ── Leaderboard ───────────────────────────────────────────────
        'lb.subtitle':           { th: 'อันดับจากคะแนนที่ดีที่สุดของผู้เล่นแต่ละคน',
                                   en: "Ranked by each player's best score" },
        'lb.you':                { th: 'คุณ', en: 'You' },

        // ── Achievements ──────────────────────────────────────────────
        'ach.subtitle':          { th: 'ปลดล็อกจากผลการเล่นจริง — ไม่ใช่ค่าตัวอย่าง',
                                   en: 'Unlocked from real attempts — never sample data' },
        'ach.needsData':         { th: 'ต้องใช้ข้อมูลรายข้อ — เริ่มเก็บตั้งแต่รุ่นนี้',
                                   en: 'Needs per-step data — only recorded from this build' },

        'cat.volume':            { th: 'ก้าวแรกและความต่อเนื่อง', en: 'Getting started & keeping going' },
        'cat.accuracy':          { th: 'ความแม่นยำ', en: 'Accuracy' },
        'cat.safety':            { th: 'ความปลอดภัยผู้ป่วย', en: 'Patient safety' },
        'cat.mastery':           { th: 'ความเชี่ยวชาญรายข้อ', en: 'Step-level mastery' },
        'cat.habit':             { th: 'วินัยและเวลา', en: 'Discipline & time' },
        'cat.growth':            { th: 'การพัฒนาตนเอง', en: 'Personal growth' },

        'ach.first':             { th: 'เล่นจบเคสแรก', en: 'Finish your first case' },
        'ach.v3':                { th: 'เล่นสะสม 3 ครั้ง', en: 'Play 3 attempts in total' },
        'ach.v5':                { th: 'เล่นสะสม 5 ครั้ง', en: 'Play 5 attempts in total' },
        'ach.v10':               { th: 'เล่นสะสม 10 ครั้ง', en: 'Play 10 attempts in total' },
        'ach.v20':               { th: 'เล่นสะสม 20 ครั้ง', en: 'Play 20 attempts in total' },
        'ach.v35':               { th: 'เล่นสะสม 35 ครั้ง', en: 'Play 35 attempts in total' },
        'ach.v50':               { th: 'เล่นสะสม 50 ครั้ง', en: 'Play 50 attempts in total' },
        'ach.d3':                { th: 'เล่นใน 3 วันที่ต่างกัน', en: 'Play on 3 different days' },
        'ach.d7':                { th: 'เล่นใน 7 วันที่ต่างกัน', en: 'Play on 7 different days' },
        'ach.d14':               { th: 'เล่นใน 14 วันที่ต่างกัน', en: 'Play on 14 different days' },
        'ach.a50':               { th: 'ทำคะแนนถึง 50%', en: 'Score 50%' },
        'ach.a70':               { th: 'ทำคะแนนถึง 70%', en: 'Score 70%' },
        'ach.a80':               { th: 'ทำคะแนนถึง 80%', en: 'Score 80%' },
        'ach.a85':               { th: 'ทำคะแนนถึง 85%', en: 'Score 85%' },
        'ach.a90':               { th: 'ทำคะแนนถึง 90%', en: 'Score 90%' },
        'ach.a95':               { th: 'ทำคะแนนถึง 95%', en: 'Score 95%' },
        'ach.a100':              { th: 'ทำคะแนนเต็มโดยไม่เจอ Fatal', en: 'Score full marks with no fatal error' },
        'ach.avg70':             { th: 'คะแนนเฉลี่ยสะสมถึง 70%', en: 'Reach a 70% running average' },
        'ach.avg85':             { th: 'คะแนนเฉลี่ยสะสมถึง 85% (อย่างน้อย 5 ครั้ง)',
                                   en: 'Reach an 85% running average (5 attempts minimum)' },
        'ach.clean1':            { th: 'เล่นจบโดยไม่เจอ Fatal 1 ครั้ง', en: 'Finish once with no fatal error' },
        'ach.safe3':             { th: 'ไม่เจอ Fatal ติดต่อกัน 3 ครั้ง', en: '3 attempts in a row with no fatal error' },
        'ach.safe5':             { th: 'ไม่เจอ Fatal ติดต่อกัน 5 ครั้ง', en: '5 attempts in a row with no fatal error' },
        'ach.safe10':            { th: 'ไม่เจอ Fatal ติดต่อกัน 10 ครั้ง', en: '10 attempts in a row with no fatal error' },
        'ach.safe20':            { th: 'ไม่เจอ Fatal ติดต่อกัน 20 ครั้ง', en: '20 attempts in a row with no fatal error' },
        'ach.nofatal10':         { th: 'เล่น 10 ครั้งโดยไม่เคยเจอ Fatal เลย', en: 'Play 10 attempts without a single fatal error' },
        'ach.fin5':              { th: 'เล่นจบครบทุกสถานี 5 ครั้ง', en: 'Complete every station 5 times' },
        'ach.fin15':             { th: 'เล่นจบครบทุกสถานี 15 ครั้ง', en: 'Complete every station 15 times' },
        'ach.p1':                { th: 'ตอบถูกครบทุกตัวเลือกใน 1 ข้อ', en: 'Get every option right on one step' },
        'ach.p25':               { th: 'ตอบถูกครบข้อสะสม 25 ข้อ', en: '25 perfectly answered steps' },
        'ach.p100':              { th: 'ตอบถูกครบข้อสะสม 100 ข้อ', en: '100 perfectly answered steps' },
        'ach.p250':              { th: 'ตอบถูกครบข้อสะสม 250 ข้อ', en: '250 perfectly answered steps' },
        'ach.st5':               { th: 'ตอบถูกครบข้อติดกัน 5 ข้อ', en: '5 perfect steps in a row' },
        'ach.st10':              { th: 'ตอบถูกครบข้อติดกัน 10 ข้อ', en: '10 perfect steps in a row' },
        'ach.st13':              { th: 'ตอบถูกครบข้อติดกัน 13 ข้อ', en: '13 perfect steps in a row' },
        'ach.flaw1':             { th: 'เล่นจบ 1 ครั้งโดยถูกครบทุกข้อ', en: 'Finish an attempt with every step perfect' },
        'ach.flaw3':             { th: 'เล่นจบแบบถูกครบทุกข้อ 3 ครั้ง', en: 'Finish 3 attempts with every step perfect' },
        'ach.g500':              { th: 'ตอบคำถามสะสม 500 ข้อ', en: 'Answer 500 questions in total' },
        'ach.sc2':               { th: 'เล่นต่อเนื่อง 2 วันติด', en: 'Practise 2 days running' },
        'ach.sc3':               { th: 'เล่นต่อเนื่อง 3 วันติด', en: 'Practise 3 days running' },
        'ach.sc7':               { th: 'เล่นต่อเนื่อง 7 วันติด', en: 'Practise 7 days running' },
        'ach.sc14':              { th: 'เล่นต่อเนื่อง 14 วันติด', en: 'Practise 14 days running' },
        'ach.sc30':              { th: 'เล่นต่อเนื่อง 30 วันติด', en: 'Practise 30 days running' },
        'ach.t1h':               { th: 'ใช้เวลาฝึกสะสมครบ 1 ชั่วโมง', en: 'Accumulate one hour of practice' },
        'ach.night':             { th: 'เล่นในช่วง 00:00–04:59', en: 'Practise between 00:00 and 04:59' },
        'ach.imp2':              { th: 'ทำคะแนนดีขึ้นติดกัน 2 ครั้ง', en: 'Improve your score 2 attempts running' },
        'ach.imp4':              { th: 'ทำคะแนนดีขึ้นติดกัน 4 ครั้ง', en: 'Improve your score 4 attempts running' },
        'ach.comeback':          { th: 'เคยได้ต่ำกว่า 50% แล้วกลับมาได้ถึง 80%',
                                   en: 'Score below 50%, then come back and reach 80%' },
        'ach.explorer':          { th: 'เล่นครบ 2 เคสที่ต่างกัน', en: 'Play 2 different cases' },
        'ach.dtp1':              { th: 'ระบุ Drug Therapy Problem ถูกต้อง 1 ครั้ง', en: 'Identify a drug therapy problem correctly once' },
        'ach.dtp3':              { th: 'ระบุ Drug Therapy Problem ถูกต้อง 3 ครั้ง', en: 'Identify a drug therapy problem correctly 3 times' },

        // ── Instructor analytics ──────────────────────────────────────
        'ins.subtitle':          { th: 'ข้อมูลรวมแบบไม่ระบุตัวตน — สำหรับอาจารย์เภสัชกรรม',
                                   en: 'Anonymous aggregate data — for pharmacy faculty' },
        'ins.retiredTag':        { th: '· ขั้นตอนเก่า', en: '· retired step' },
        'ins.smallSample':       { th: 'ขนาดตัวอย่างเล็กมาก ({n} ครั้ง) — ค่าร้อยละยังไม่มีความหมายทางสถิติ ผู้เรียนคนเดียวที่ตอบผิดหนึ่งข้อจะแสดงเป็น 100% ให้ดูจำนวนครั้งในวงเล็บแทน',
                                   en: 'Very small sample ({n} attempts) — these percentages carry no statistical meaning. A single student slipping on one step shows as 100%; read the counts in brackets instead.' },
        'ins.retiredNote':       { th: 'มี {n} ขั้นตอนที่ไม่มีอยู่ในเคสฉบับปัจจุบันแล้ว — เป็นผลจากการส่งก่อนที่เคสจะถูกปรับปรุงใหม่ ข้อมูลนี้ยังถูกต้อง แต่วัดเนื้อหาคนละฉบับกับที่นักศึกษาเล่นอยู่ตอนนี้',
                                   en: '{n} of these steps no longer exist in the current case — they come from submissions made before the case was revised. The data is still accurate, but it measures a different version from the one students play now.' },
        'ins.mistakeNote':       { th: '% ของนักศึกษาที่ตอบผิดในขั้นตอนนั้น', en: '% of students who answered that step wrongly' },
        'ins.noMistakes':        { th: 'ยังไม่พบข้อผิดพลาดที่บันทึกไว้', en: 'No recorded mistakes yet' },
        'ins.taggedCount':       { th: '{n} attempt(s) ที่ติดแท็ก', en: '{n} tagged attempt(s)' },
        'ins.noDTP':             { th: 'ยังไม่มีข้อมูลการจำแนก DTP — ข้อมูลจะเริ่มเก็บจากการส่งผลครั้งถัดไป',
                                   en: 'No DTP classification data yet — collection starts with the next submission' },
        'ins.dtpAccuracy':       { th: 'จำแนกถูกต้อง <strong class="text-teal-400">{pct}%</strong> ({n}/{total})',
                                   en: 'Classified correctly: <strong class="text-teal-400">{pct}%</strong> ({n}/{total})' },

        // ── QR card ───────────────────────────────────────────────────
        'qr.aria':               { th: 'QR code สำหรับเปิด Clinical Case Simulator',
                                   en: 'QR code that opens the Clinical Case Simulator' },
        'qr.failed':             { th: 'สร้าง QR ไม่สำเร็จ — เปิดผ่านลิงก์นี้แทนได้',
                                   en: 'Could not build the QR code — use this link instead' },
        'qr.caption':            { th: 'สแกนเพื่อเปิดเว็บนี้บนมือถือ', en: 'Scan to open this site on a phone' }
    };

    // ═══ ENGINE ════════════════════════════════════════════════════════════

    /**
     * Explicit choice first, browser preference second, English last.
     *
     * navigator.languages is an ORDERED preference list, and the order is the
     * whole point. Scanning it for "is Thai in here anywhere" gets it wrong for
     * a very common setup: a browser reporting ["en-US", "th"] belongs to
     * someone who reads both and prefers English — an exchange student, or a
     * Thai speaker working in English. Walking the list in order and taking the
     * first supported hit gives each visitor the language they actually ranked
     * first.
     */
    function detect() {
        try {
            const saved = localStorage.getItem(STORE_KEY);
            if (SUPPORTED.indexOf(saved) !== -1) return saved;
        } catch (e) { /* storage blocked — fall through to detection */ }

        const tags = (navigator.languages && navigator.languages.length)
            ? navigator.languages
            : [navigator.language || ''];

        for (let i = 0; i < tags.length; i++) {
            const tag = String(tags[i]).toLowerCase();
            if (tag.indexOf('th') === 0) return 'th';
            if (tag.indexOf('en') === 0) return 'en';
        }
        return 'en';   // an unsupported language: English is the wider reach
    }

    let lang = detect();

    /**
     * Looks up `key` and fills in {placeholders} from `vars`.
     *
     * A missing key returns the key itself. That is deliberate: a blank string
     * would leave an empty panel that looks like a rendering fault, whereas a
     * visible "stats.secTrend" points straight at the line to fix.
     */
    function t(key, vars) {
        const entry = DICT[key];
        if (!entry) {
            console.warn('[i18n] Missing key:', key);
            return key;
        }
        let out = entry[lang];
        if (out == null) out = entry.th;          // Thai is the source of truth
        if (Array.isArray(out) || vars == null) return out;

        return String(out).replace(/\{(\w+)\}/g, function(match, name) {
            return Object.prototype.hasOwnProperty.call(vars, name) ? vars[name] : match;
        });
    }

    /** Locale tag for Intl / toLocaleString. Day-first in both languages. */
    function locale() { return lang === 'th' ? 'th-TH' : 'en-GB'; }

    /**
     * Applies the dictionary to markup that exists before any JS renders.
     *   data-i18n        → textContent
     *   data-i18n-html   → innerHTML (entries that carry <strong>, <code>…)
     *   data-i18n-title  → title attribute
     *   data-i18n-aria   → aria-label attribute
     */
    function applyStatic(root) {
        const scope = root || document;
        scope.querySelectorAll('[data-i18n]').forEach(el => {
            el.textContent = t(el.dataset.i18n);
        });
        scope.querySelectorAll('[data-i18n-html]').forEach(el => {
            el.innerHTML = t(el.dataset.i18nHtml);
        });
        scope.querySelectorAll('[data-i18n-title]').forEach(el => {
            el.setAttribute('title', t(el.dataset.i18nTitle));
        });
        scope.querySelectorAll('[data-i18n-aria]').forEach(el => {
            el.setAttribute('aria-label', t(el.dataset.i18nAria));
        });
        document.documentElement.setAttribute('lang', lang);
    }

    /**
     * Records a language choice and reloads.
     *
     * See the file header for why this reloads rather than re-rendering. The
     * switch is only offered outside an active case, so nothing is lost.
     */
    function setLang(next) {
        if (SUPPORTED.indexOf(next) === -1 || next === lang) return;
        try { localStorage.setItem(STORE_KEY, next); } catch (e) { /* private mode */ }
        location.reload();
    }

    /** Wires every [data-lang-switch] control to the other language. */
    function initSwitcher() {
        const other = lang === 'th' ? 'en' : 'th';
        document.querySelectorAll('[data-lang-switch]').forEach(el => {
            el.textContent = other.toUpperCase();
            el.setAttribute('title', t('lang.switchTitle'));
            el.addEventListener('click', () => setLang(other));
        });
    }

    window.I18n = {
        get lang() { return lang; },
        t: t,
        locale: locale,
        detect: detect,
        setLang: setLang,
        applyStatic: applyStatic,
        initSwitcher: initSwitcher,
        isThai: function() { return lang === 'th'; }
    };

    // The <html lang> attribute is set as early as possible so the font stack
    // and any screen reader pick the right language before first paint.
    document.documentElement.setAttribute('lang', lang);
    console.log('[i18n] Interface language:', lang);
})();
