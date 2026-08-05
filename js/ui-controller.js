/**
 * ui-controller.js
 * Medical RPG Simulator — View Switcher, Boot Gate & Render Engine
 *
 * Contract with game-engine.js:
 *   renderInfo(stepData) / renderMCQ(stepData) / renderMCQMulti(stepData)
 *   showFeedback(isCorrect, message) / showMultiFeedback(result)
 *   renderGameOver(msg, state) / renderSummary(state)
 *   navigateTo('login' | 'dashboard' | 'game')
 *
 * Layout note: there is exactly ONE render host for step content
 * (#game-content-area). Earlier revisions had two, which caused the HUD
 * to miss score updates; a single host removes that class of bug.
 */
const UIController = (function() {

    // ─── View Registry ─────────────────────────────────────────
    const views = {
        login:     document.getElementById('login-view'),
        dashboard: document.getElementById('dashboard-view'),
        game:      document.getElementById('simulation-view')
    };

    // ─── Elements ──────────────────────────────────────────────
    const splash        = document.getElementById('app-loading-screen');
    const gameArea      = document.getElementById('game-content-area');
    const stepDotsEl    = document.getElementById('step-dots');
    const questTrack    = document.getElementById('quest-track');
    const drawer        = document.getElementById('patient-drawer');
    const drawerBackdrop= document.getElementById('patient-drawer-backdrop');

    const vitalHosts = ['vitals-mobile', 'vitals-tablet', 'vitals-desktop']
        .map(id => document.getElementById(id)).filter(Boolean);
    const soapHosts  = ['soap-content', 'soap-content-mobile']
        .map(id => document.getElementById(id)).filter(Boolean);

    // ─── State ─────────────────────────────────────────────────
    let activeCase     = null;
    let soapTab        = 'subjective';
    let multiSelection = new Set();
    let multiLimit     = 1;
    let multiPerPoint  = 0;

    // Drug Therapy Problem tagging (pharmacy practice)
    let dtpSelection   = null;   // category id chosen on the current step
    let dtpRequired    = false;  // true only on the case's designated DTP step
    let dtpLastTag     = null;   // survives the step, for the Firestore payload

    // The Monitoring tab holds the efficacy/safety care plan, which is also the
    // answer key to the monitoring step. It stays locked until that step has
    // been answered, so it reinforces the plan instead of revealing it.
    let monitoringUnlocked = false;

    /**
     * The seven standard Drug Therapy Problem categories from the
     * Pharmaceutical Care Practice framework (Cipolle, Strand & Morley).
     * Ids are stable and are what gets written to Firestore for analytics —
     * do not renumber them.
     */
    const DTP_CATEGORIES = [
        { id: 1, short: 'Unnecessary Drug Therapy',      th: 'ได้รับยาโดยไม่จำเป็น' },
        { id: 2, short: 'Needs Additional Drug Therapy', th: 'ต้องการยาเพิ่ม' },
        { id: 3, short: 'Ineffective Drug',              th: 'ยาไม่ได้ผล' },
        { id: 4, short: 'Dosage Too Low',                th: 'ขนาดยาต่ำเกินไป' },
        { id: 5, short: 'Adverse Drug Reaction',         th: 'อาการไม่พึงประสงค์จากยา' },
        { id: 6, short: 'Dosage Too High',               th: 'ขนาดยาสูงเกินไป' },
        { id: 7, short: 'Non-adherence',                 th: 'ไม่ให้ความร่วมมือในการใช้ยา' }
    ];

    // ─── Helpers ───────────────────────────────────────────────
    function esc(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    function byId(id) { return document.getElementById(id); }
    function setText(id, val) { const el = byId(id); if (el && val != null) el.textContent = val; }

    // ═══ BOOT GATE ═════════════════════════════════════════════
    // Nothing is revealed until authReadyPromise settles. This is what
    // stops the login screen from flashing before a restored session.
    function boot(opts) {
        const options = opts || {};

        function reveal(viewName) {
            if (splash) {
                splash.classList.add('is-hidden');
                setTimeout(() => { splash.style.display = 'none'; }, 480);
            }
            switchView(viewName);
        }

        function run() {
            const gate = window.authReadyPromise || Promise.resolve(null);

            gate.then(function(user) {
                console.log('[Boot] Auth gate resolved →', user ? 'session restored' : 'no session');

                const casesReady = typeof options.loadCases === 'function'
                    ? Promise.resolve(options.loadCases()).catch(err => {
                          console.error('[Boot] Case loading failed:', err);
                          return [];
                      })
                    : Promise.resolve([]);

                return casesReady.then(function() {
                    if (user) {
                        if (typeof options.onSignedIn === 'function') options.onSignedIn(user);
                        reveal('dashboard');

                        // ?mode=instructor deep-links faculty straight into
                        // the analytics panel. It reads the same signed-in
                        // Firestore data as everything else — it is a
                        // shortcut, not a privilege.
                        try {
                            if (new URLSearchParams(location.search).get('mode') === 'instructor') {
                                console.log('[Boot] mode=instructor → opening analytics panel.');
                                switchPanel('instructor');
                            }
                        } catch (e) { /* URLSearchParams unavailable — ignore */ }
                    } else {
                        reveal('login');
                    }
                });
            }).catch(function(err) {
                // Never strand the user on the splash.
                console.error('[Boot] Unexpected failure — falling back to login:', err);
                reveal('login');
            });
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', run);
        } else {
            run();
        }
    }

    // ─── View Switching ────────────────────────────────────────
    function switchView(viewName) {
        Object.values(views).forEach(view => {
            if (view) {
                view.classList.remove('active-view');
                view.classList.add('hidden-view');
            }
        });
        const active = views[viewName];
        if (active) {
            active.classList.remove('hidden-view');
            active.classList.add('active-view');
        }
        closeDrawer();
        window.scrollTo(0, 0);
    }

    // ─── Mobile patient drawer ─────────────────────────────────
    // The slide animation is presentation only. The final open/closed
    // state is also written inline after the transition window, so the
    // drawer is never left half-open if the transition does not run
    // (background tabs, reduced-motion, non-compositing contexts).
    let drawerSettle = null;

    // Force an element to a final value, bypassing any in-flight transition.
    // A stalled transition (background tab, no compositor, reduced motion)
    // otherwise keeps ownership of the property and pins the old value.
    function snapTo(el, prop, value) {
        if (!el) return;
        const prev = el.style.transition;
        el.style.transition = 'none';
        el.style.setProperty(prop, value);
        void el.offsetHeight;
        el.style.transition = prev;
    }

    function openDrawer() {
        if (!drawer) return;
        clearTimeout(drawerSettle);

        drawer.style.transform = '';
        void drawer.offsetHeight;           // commit the closed position first
        drawer.classList.add('is-open');
        if (drawerBackdrop) drawerBackdrop.classList.add('is-open');
        document.body.style.overflow = 'hidden';

        // After the animation window, guarantee the end state.
        drawerSettle = setTimeout(() => {
            if (!drawer.classList.contains('is-open')) return;
            snapTo(drawer, 'transform', 'translateY(0)');
            snapTo(drawerBackdrop, 'opacity', '1');
            snapTo(drawerBackdrop, 'visibility', 'visible');
        }, 380);
    }

    function closeDrawer() {
        if (!drawer) return;
        clearTimeout(drawerSettle);

        drawer.classList.remove('is-open');
        if (drawerBackdrop) drawerBackdrop.classList.remove('is-open');
        document.body.style.overflow = '';

        drawerSettle = setTimeout(() => {
            if (drawer.classList.contains('is-open')) return;
            snapTo(drawer, 'transform', 'translateY(100%)');
            snapTo(drawerBackdrop, 'opacity', '0');
            snapTo(drawerBackdrop, 'visibility', 'hidden');
            // Hand styling back to the stylesheet for the next open.
            drawer.style.transform = '';
            if (drawerBackdrop) {
                drawerBackdrop.style.opacity = '';
                drawerBackdrop.style.visibility = '';
            }
        }, 380);
    }

    // ─── Event Delegation ──────────────────────────────────────
    function handleClick(event) {
        const dtpChip = event.target.closest('.dtp-chip');
        if (dtpChip && !dtpChip.disabled) { selectDTP(dtpChip); return; }

        const multiBtn = event.target.closest('.choice-multi');
        if (multiBtn && !multiBtn.disabled) { toggleMultiChoice(multiBtn); return; }

        const submitBtn = event.target.closest('.submit-decision-btn');
        if (submitBtn && !submitBtn.disabled) {
            GameEngine.evaluateMultiAnswer(Array.from(multiSelection));
            return;
        }

        const choiceBtn = event.target.closest('.choice-btn');
        if (choiceBtn && !choiceBtn.disabled && !choiceBtn.classList.contains('choice-multi')) {
            const id = choiceBtn.dataset.choiceId;
            if (id) GameEngine.evaluateAnswer(id);
            return;
        }

        const nextBtn = event.target.closest('.next-step-btn');
        if (nextBtn) { GameEngine.proceedToNextStep(); return; }
    }

    function initEventListeners() {
        if (!gameArea) console.error('[UI Error] #game-content-area not found.');

        // ONE delegated listener for the whole document.
        // A second listener on #game-content-area would double-fire for
        // controls inside .submit-dock (which is nested in it), advancing
        // two steps per click. Handlers match by class, so document-level
        // delegation is both sufficient and safe.
        document.addEventListener('click', handleClick);

        const openBtn  = byId('btn-open-drawer');
        const closeBtn = byId('btn-close-drawer');
        if (openBtn)  openBtn.addEventListener('click', openDrawer);
        if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
        if (drawerBackdrop) drawerBackdrop.addEventListener('click', closeDrawer);

        initPanelNav();

        // SOAP tabs exist in both the side panel and the drawer.
        document.querySelectorAll('.soap-tab').forEach(tab => {
            tab.addEventListener('click', function() {
                soapTab = tab.dataset.soap;
                syncSoapTabs();
                renderPatientChart(activeCase);
            });
        });
    }

    function syncSoapTabs() {
        document.querySelectorAll('.soap-tab').forEach(t => {
            const on = t.dataset.soap === soapTab;
            t.classList.toggle('bg-teal-400', on);
            t.classList.toggle('text-navy-900', on);
            t.classList.toggle('font-bold', on);
            t.classList.toggle('text-slate-400', !on);
            t.classList.toggle('font-semibold', !on);

            // The Monitoring tab is the only one that can be empty by design.
            // Without a marker on the tab itself an empty panel reads as a
            // broken feature, so the lock state is shown before it is opened.
            if (t.dataset.soap !== 'monitoring') return;
            if (!t.dataset.baseLabel) t.dataset.baseLabel = t.textContent.trim().replace(/^\S+\s*/, '');
            t.textContent = (monitoringUnlocked ? '🎯 ' : '🔒 ') + t.dataset.baseLabel;
            t.title = monitoringUnlocked
                ? 'กรอบการติดตามผล — เปิดใช้งานแล้ว'
                : 'ยังล็อกอยู่ — จะเปิดเมื่อท่านส่งคำตอบข้อแรกของด่าน Monitoring';
            t.classList.toggle('is-locked-tab', !monitoringUnlocked && !on);
        });
    }

    // ─── Case Header ───────────────────────────────────────────
    function renderCaseHeader(caseData) {
        if (!caseData) return;
        activeCase = caseData;

        const idBadge = byId('case-id-badge');
        if (idBadge) idBadge.textContent = String(caseData.case_id || 'case').toUpperCase().replace('_', ' ');

        const acuity = byId('case-acuity-badge');
        const level  = (caseData.patient && caseData.patient.acuity) || caseData.difficulty || '';
        if (acuity) acuity.textContent = level ? `⚠ ${String(level).toUpperCase()}` : '—';

        const badge = byId('bedside-status-badge');
        const tags  = (caseData.patient && caseData.patient.status_tags) || [];
        if (badge) badge.textContent = '● ' + (tags[0] ? String(tags[0]).toUpperCase() : 'STABLE');

        const tagWrap = byId('bedside-tags');
        if (tagWrap) {
            tagWrap.innerHTML = tags.map(t => `<span class="tag-pill">${esc(t)}</span>`).join('');
        }

        initPatientAvatar(caseData);
    }

    // ─── Vitals (rendered into every breakpoint host) ───────────
    function renderVitals(caseData) {
        const vitals = (caseData && Array.isArray(caseData.vitals)) ? caseData.vitals : [];
        if (vitals.length === 0) {
            vitalHosts.forEach(h => { h.innerHTML = ''; });
            return;
        }

        // Measurement + reference range only.
        //
        // Earlier revisions coloured each vital by an authored `severity` and
        // printed an interpretive `flag` ("Hypotension", "Severe anemia",
        // "High Risk"). Those labels are the answers to the problem-list and
        // severity steps this case then asks, so the interface was grading the
        // data for the learner. The numbers are all still here — reading them
        // against the reference range is the exercise.
        const html = vitals.map(v => `
                <div class="bg-navy-850 px-1.5 py-1.5 text-center">
                    <p class="text-[.52rem] font-bold tracking-wider text-slate-500 uppercase truncate">${esc(v.label)}</p>
                    <p class="text-[.82rem] font-mono font-bold text-white leading-tight truncate">${esc(v.value)}</p>
                    <p class="text-[.5rem] text-slate-500 truncate">${esc(v.unit || '')}</p>
                    <p class="text-[.48rem] text-slate-600 truncate" title="reference range">${v.ref ? esc(v.ref) : ''}</p>
                </div>`).join('');

        vitalHosts.forEach(h => { h.innerHTML = html; });
    }

    // ─── Clinical Narrative (desktop column 2) ─────────────────
    function renderNarrative(caseData) {
        if (!caseData) return;
        const p = caseData.patient || {};

        setText('case-narrative',
            `${p.name || 'ผู้ป่วย'} อายุ ${p.age || '—'} ปี` +
            (p.occupation ? ` (${p.occupation})` : '') +
            (p.chief_complaint ? ` — ${p.chief_complaint}` : ''));

        const meta = byId('narrative-meta');
        if (meta) {
            const stages = Object.keys(caseData.stages || {}).length;
            meta.innerHTML = [
                `<span class="tag-pill">${stages} Stages</span>`,
                `<span class="tag-pill !text-gold-400 !border-gold-400/30 !bg-gold-400/10">${esc(caseData.difficulty || '—')}</span>`,
                ...(caseData.tags || []).map(t => `<span class="tag-pill">${esc(t)}</span>`)
            ].join('');
        }
    }

    // ─── Clinical reference (collapsible) ──────────────────────
    // Replaces the old flat CPG table. Every section is a <details> that
    // starts closed: consulting a reference should be a deliberate act, not
    // something the interface does on the learner's behalf. This is also
    // where any material that deliberately helps the learner belongs, so the
    // patient chart itself stays raw data.
    function renderReferenceBlock(ref) {
        if (!ref || !Array.isArray(ref.sections) || ref.sections.length === 0) {
            return `<p class="text-[.7rem] text-slate-500 leading-relaxed">
                        เคสนี้ยังไม่มีข้อมูลอ้างอิง — เพิ่มฟิลด์
                        <code class="text-teal-400">reference</code> ใน case JSON เพื่อแสดงที่นี่
                    </p>`;
        }

        const rowList = rows => `
            <div class="flex flex-col gap-1.5 mt-2">
                ${rows.map(pair => `
                    <div class="rounded-lg border border-navy-700/60 bg-navy-800/50 px-2 py-1.5">
                        <p class="text-[.66rem] font-bold text-teal-400 leading-tight">${esc(pair[0])}</p>
                        <p class="text-[.64rem] text-slate-300 leading-relaxed mt-0.5">${esc(pair[1])}</p>
                    </div>`).join('')}
            </div>`;

        const tableList = t => `
            <div class="flex flex-col gap-2 mt-2">
                ${t.rows.map(cells => `
                    <div class="rounded-lg border border-navy-700/60 bg-navy-800/50 p-2">
                        <p class="text-[.66rem] font-bold text-teal-400 leading-tight mb-1">${esc(cells[0])}</p>
                        ${cells.slice(1).map((v, i) => `
                            <p class="text-[.56rem] font-bold uppercase tracking-wide text-slate-500 mt-1.5">${esc(t.columns[i + 1] || '')}</p>
                            <p class="text-[.64rem] text-slate-300 leading-relaxed">${esc(v)}</p>`).join('')}
                    </div>`).join('')}
            </div>`;

        const sections = ref.sections.map(sec => `
            <details class="ref-section rounded-xl border border-navy-600/70 bg-navy-850/60 overflow-hidden">
                <summary class="flex items-center gap-2 px-2.5 py-2 cursor-pointer select-none min-h-[44px]">
                    <span class="text-xs flex-shrink-0">${esc(sec.icon || '📄')}</span>
                    <span class="text-[.7rem] font-bold text-slate-200 flex-1 leading-tight">${esc(sec.title)}</span>
                    <span class="ref-chevron text-slate-500 text-[.7rem] flex-shrink-0">▾</span>
                </summary>
                <div class="px-2.5 pb-2.5">
                    ${sec.note ? `<p class="text-[.6rem] text-slate-500 leading-relaxed">${esc(sec.note)}</p>` : ''}
                    ${sec.table ? tableList(sec.table) : rowList(sec.rows || [])}
                </div>
            </details>`).join('');

        return `
            <div class="flex flex-col gap-2">
                <div>
                    <p class="text-xs font-extrabold text-white">${esc(ref.title || 'ข้อมูลอ้างอิง')}</p>
                    ${ref.note ? `<p class="text-[.6rem] text-slate-500 mt-0.5 leading-relaxed">${esc(ref.note)}</p>` : ''}
                </div>
                ${sections}
            </div>`;
    }

    // ═══ PHARMACY TOOLING ══════════════════════════════════════

    /**
     * Cockcroft-Gault creatinine clearance, in mL/min.
     *
     *     CrCl = ((140 - age) x weight_kg) / (72 x Scr)   x 0.85 if female
     *
     * This is deliberately CG and not eGFR: CG is what drug monographs and
     * renal dose-adjustment tables are written against. The authored eGFR
     * is displayed alongside it, never substituted for it.
     *
     * Returns null when the case lacks the inputs, so the badge can say so
     * instead of printing a number derived from defaults.
     */
    function calcCockcroftGault(patient, renal) {
        if (!patient || !renal) return null;
        const age = Number(patient.age);
        const wt  = Number(renal.weight_kg);
        const scr = Number(renal.scr_mg_dl);
        if (!age || !wt || !scr) return null;

        let crcl = ((140 - age) * wt) / (72 * scr);
        if (String(patient.sex || '').toUpperCase().charAt(0) === 'F') crcl *= 0.85;
        return Math.round(crcl * 10) / 10;
    }

    /**
     * Renal & pharmacokinetic quick-calc badge for the Objective tab.
     * Below 60 mL/min it raises the amber "Renal Dose Adjustment Required"
     * tag, which is the trigger a pharmacist is trained to act on.
     */
    function renderRenalBadge(caseData) {
        const data = caseData || activeCase;
        if (!data || !data.renal) return '';

        const r = data.renal;
        const crcl = calcCockcroftGault(data.patient, r);
        const egfr = Number(r.egfr_ml_min_1_73);

        // BUN/Cr ratio is shown as a number only. Its interpretation — that a
        // ratio above 20:1 points to an upper GI source — belongs in the CPG
        // reference, not stamped onto the patient's chart as a conclusion.
        const ratio = (r.bun_mg_dl && r.scr_mg_dl)
            ? Math.round((r.bun_mg_dl / r.scr_mg_dl) * 10) / 10
            : null;

        // The lower of the two drives the warning — the conservative read.
        const impaired = (crcl != null && crcl < 60) || (egfr && egfr < 60);

        const cell = (label, value, unit, tone) => `
            <div class="rounded-lg px-2 py-1.5 border ${tone || 'border-navy-600/70 bg-navy-800/60'}">
                <p class="text-[.56rem] font-bold tracking-wider text-slate-500 uppercase">${label}</p>
                <p class="text-[.82rem] font-mono font-bold text-white leading-tight">${value}<span class="text-[.55rem] font-sans font-medium text-slate-500 ml-0.5">${unit || ''}</span></p>
            </div>`;

        const crclTone = crcl != null && crcl < 60
            ? 'border-gold-400/50 bg-gold-400/10'
            : 'border-teal-400/35 bg-teal-400/[.07]';

        return `
            <div class="rounded-xl border border-navy-600/70 bg-navy-850/70 p-2.5 mb-3">
                <div class="flex items-center gap-1.5 mb-2">
                    <span class="text-xs">🧪</span>
                    <p class="text-[.6rem] font-bold tracking-widest text-teal-400 uppercase">Renal &amp; PK Quick-Calc</p>
                </div>

                <div class="grid grid-cols-2 gap-1.5">
                    ${cell('Scr', r.scr_mg_dl != null ? r.scr_mg_dl : '—', 'mg/dL')}
                    ${cell('BUN', r.bun_mg_dl != null ? r.bun_mg_dl : '—', 'mg/dL')}
                    ${egfr
                        ? cell('eGFR', egfr, 'mL/min/1.73m²')
                        : cell('BUN/Cr', ratio != null ? ratio + ':1' : '—', 'ratio')}
                    ${cell('CrCl (C-G)', crcl != null ? crcl : '—', 'mL/min', crclTone)}
                </div>

                <p class="text-[.58rem] text-slate-500 mt-1.5 leading-relaxed">
                    น้ำหนัก ${r.weight_kg != null ? r.weight_kg : '—'} kg · คำนวณด้วยสูตร Cockcroft-Gault
                </p>

                ${impaired ? `
                <div class="mt-2 flex items-start gap-1.5 rounded-lg border border-gold-400/40 bg-gold-400/10 px-2 py-1.5">
                    <span class="text-gold-400 text-[.7rem] leading-none mt-0.5">⚠</span>
                    <div>
                        <p class="text-[.66rem] font-bold text-gold-400 leading-tight">Renal Dose Adjustment Required</p>
                        <p class="text-[.58rem] text-slate-400 leading-relaxed mt-0.5">
                            ตรวจสอบขนาดยาทุกตัวที่ขับออกทางไตก่อนสั่งจ่าย
                        </p>
                    </div>
                </div>` : ''}
            </div>`;
    }

    /**
     * Efficacy vs. Safety monitoring framework for the Plan step — the
     * two-column table every pharmacist care plan has to end with.
     * Stacks to one column on narrow panels.
     */
    function renderMonitoringBlock(caseData) {
        const data = caseData || activeCase;
        const m = data && data.monitoring;

        if (!monitoringUnlocked) {
            const hasFramework = !!(m && (m.regimen || (m.efficacy || []).length || (m.safety || []).length));
            return `<div class="rounded-xl border border-navy-600/70 bg-navy-850/70 p-4">
                        <div class="text-center">
                            <p class="text-xl mb-1.5">🔒</p>
                            <p class="text-[.72rem] font-bold text-slate-300 mb-1">ยังไม่เปิดใช้งาน</p>
                        </div>
                        <p class="text-[.66rem] text-slate-400 leading-relaxed mt-1">
                            แท็บนี้เก็บ <strong class="text-slate-200">กรอบการติดตามผล (Monitoring Framework)</strong>
                            ซึ่งเป็นเฉลยของด่าน Monitoring โดยตรง จึงถูกล็อกไว้จนกว่าท่านจะวางแผนการติดตามด้วยตนเองก่อน
                        </p>
                        <p class="text-[.62rem] text-slate-500 leading-relaxed mt-2 pt-2 border-t border-navy-600/60">
                            🔓 จะเปิดอัตโนมัติทันทีที่ท่านส่งคำตอบข้อแรกของด่าน
                            <span class="text-slate-300 font-semibold">MONITORING</span> —
                            ${hasFramework
                                ? 'เคสนี้มีข้อมูลกรอบการติดตามพร้อมแสดงแล้ว'
                                : 'แต่เคสนี้ยังไม่ได้เขียนกรอบการติดตามไว้ จึงจะขึ้นข้อความแจ้งแทน'}
                        </p>
                        <p class="text-[.6rem] text-slate-600 leading-relaxed mt-2">
                            ระหว่างนี้ใช้แท็บ Subj / Obj / อ้างอิง ได้ตามปกติ — นี่ไม่ใช่ข้อผิดพลาด
                        </p>
                    </div>`;
        }

        if (!m) {
            return `<p class="text-slate-500 text-[.72rem] leading-relaxed">
                        ยังไม่มีกรอบการติดตามสำหรับเคสนี้
                    </p>`;
        }

        const row = (r, accent) => `
            <div class="rounded-lg border border-navy-600/60 bg-navy-800/50 p-2">
                <p class="text-[.7rem] font-bold ${accent} leading-tight">${esc(r.param)}</p>
                <p class="text-[.66rem] text-slate-300 leading-relaxed mt-0.5">${esc(r.target || r.watch || '')}</p>
                ${r.when ? `<p class="text-[.58rem] text-slate-500 mt-1">🕒 ${esc(r.when)}</p>` : ''}
            </div>`;

        return `
            <div class="flex flex-col gap-3">
                <div class="rounded-xl border border-teal-400/30 bg-teal-400/[.06] p-2.5">
                    <p class="text-[.58rem] font-bold tracking-widest text-teal-400 uppercase mb-1">Regimen</p>
                    <p class="text-[.72rem] text-slate-200 leading-relaxed">${esc(m.regimen || '—')}</p>
                </div>

                <div class="grid grid-cols-1 xl:grid-cols-2 gap-3">
                    <div>
                        <div class="flex items-center gap-1.5 mb-1.5">
                            <span class="text-[.7rem]">🎯</span>
                            <p class="text-[.6rem] font-bold tracking-widest text-teal-400 uppercase">Therapeutic Efficacy</p>
                        </div>
                        <div class="flex flex-col gap-1.5">
                            ${(m.efficacy || []).map(r => row(r, 'text-teal-400')).join('')}
                        </div>
                    </div>

                    <div>
                        <div class="flex items-center gap-1.5 mb-1.5">
                            <span class="text-[.7rem]">🛡</span>
                            <p class="text-[.6rem] font-bold tracking-widest text-gold-400 uppercase">Safety / Toxicity</p>
                        </div>
                        <div class="flex flex-col gap-1.5">
                            ${(m.safety || []).map(r => row(r, 'text-gold-400')).join('')}
                        </div>
                    </div>
                </div>
            </div>`;
    }

    // ─── DTP tagger ────────────────────────────────────────────
    /** True when the current step is the one the case marks for DTP tagging. */
    function isDTPStep() {
        const dtp = activeCase && activeCase.dtp;
        return !!(dtp && dtp.step_id && dtp.step_id === state_currentStepId());
    }

    function renderDTPTagger() {
        const chips = DTP_CATEGORIES.map(c => `
            <button class="dtp-chip text-left px-2 py-2 min-h-[48px] rounded-lg border border-navy-600/70 bg-navy-800/60
                           text-[.64rem] leading-tight text-slate-300 transition"
                    data-dtp-id="${c.id}" aria-pressed="false">
                <span class="font-bold text-slate-500 mr-1">${c.id}.</span>${esc(c.short)}
                <span class="block text-[.56rem] text-slate-500 mt-0.5">${esc(c.th)}</span>
            </button>`).join('');

        return `
            <div id="dtp-tagger" class="rounded-xl border border-gold-400/35 bg-gold-400/[.05] p-2.5">
                <div class="flex items-center gap-1.5 mb-1">
                    <span class="text-xs">🏷</span>
                    <p class="text-[.6rem] font-bold tracking-widest text-gold-400 uppercase">Drug Therapy Problem</p>
                </div>
                <p class="text-[.66rem] text-slate-400 leading-relaxed mb-2">
                    จำแนกประเภทของปัญหาจากการใช้ยาก่อน แล้วจึงเลือกคำตอบด้านล่าง
                </p>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5">${chips}</div>
                <div id="dtp-verdict"></div>
            </div>`;
    }

    function selectDTP(chip) {
        const id = Number(chip.dataset.dtpId);
        if (!id) return;

        dtpSelection = id;
        dtpLastTag = id;

        document.querySelectorAll('.dtp-chip').forEach(c => {
            const on = Number(c.dataset.dtpId) === id;
            c.classList.toggle('border-gold-400', on);
            c.classList.toggle('bg-gold-400/15', on);
            c.classList.toggle('text-white', on);
            c.setAttribute('aria-pressed', on ? 'true' : 'false');
        });

        syncSubmitState();
    }

    /** Reveals whether the tag matched the case key, after the answer. */
    function renderDTPVerdict() {
        const host = byId('dtp-verdict');
        const dtp = activeCase && activeCase.dtp;
        if (!host || !dtp) return;

        document.querySelectorAll('.dtp-chip').forEach(c => { c.disabled = true; });

        const key = Array.isArray(dtp.correct_ids) ? dtp.correct_ids : [];
        const ok = key.indexOf(dtpSelection) !== -1;
        const names = key
            .map(id => (DTP_CATEGORIES.find(c => c.id === id) || {}).short)
            .filter(Boolean);

        host.innerHTML = `
            <div class="mt-2 rounded-lg border ${ok ? 'border-teal-400/45 bg-teal-400/10' : 'border-acuity-500/45 bg-acuity-500/10'} px-2 py-1.5">
                <p class="text-[.66rem] font-bold ${ok ? 'text-teal-400' : 'text-acuity-500'} leading-tight">
                    ${ok ? '✓ จำแนก DTP ถูกต้อง' : '✕ จำแนก DTP ยังไม่ตรง'}
                    <span class="font-normal text-slate-400">— เฉลย: ${esc(names.join(' + ') || '—')}</span>
                </p>
                ${dtp.rationale ? `<p class="text-[.6rem] text-slate-400 leading-relaxed mt-1">${esc(dtp.rationale)}</p>` : ''}
            </div>`;
    }

    // ─── Patient Chart (panel + drawer) ────────────────────────
    function renderPatientChart(caseData) {
        if (caseData) activeCase = caseData;
        const data = activeCase;
        if (!data || soapHosts.length === 0) return;

        const p = data.patient || {};
        const nameLine = `${p.name || 'ผู้ป่วย'}${p.age ? `, ${p.age}${p.sex || ''}` : ''}`;
        setText('patient-name', nameLine);
        setText('patient-name-mobile', nameLine);
        setText('patient-cc', p.chief_complaint || data.case_title || '');
        setText('patient-cc-mobile', p.chief_complaint || data.case_title || '');

        const stages = data.stages || {};
        const firstStage = stages[Object.keys(stages)[0]] || { steps: {} };
        const infoSteps = Object.values(firstStage.steps || {}).filter(s => s.type === 'info');

        function contentBlock(step, emptyMsg) {
            if (!step || !Array.isArray(step.content)) {
                return `<p class="text-slate-500 text-[.72rem] leading-relaxed">${emptyMsg}</p>`;
            }
            // Authored HTML from the case file (uses <strong>) — trusted content.
            return step.content.map(line => `<p class="clinical-text">${line}</p>`).join('');
        }

        let html;
        if (soapTab === 'subjective') {
            html = contentBlock(infoSteps[0], 'ไม่มีข้อมูล Subjective');
        } else if (soapTab === 'objective') {
            // Renal/PK parameters are objective data, so they lead the tab.
            html = renderRenalBadge(data) + contentBlock(infoSteps[1], 'ไม่มีข้อมูล Objective');
        } else if (soapTab === 'monitoring') {
            html = renderMonitoringBlock(data);
        } else {
            html = renderReferenceBlock(data.reference);
        }

        soapHosts.forEach(h => { h.innerHTML = html; });
    }

    // ─── Step dots ─────────────────────────────────────────────
    function buildStepDots(total) {
        if (!stepDotsEl || !total) return;
        stepDotsEl.innerHTML = Array.from({ length: total },
            () => `<span class="step-dot flex-shrink-0"></span>`).join('');
    }
    function syncStepDots(currentIndex, total) {
        if (!stepDotsEl) return;
        if (stepDotsEl.querySelectorAll('.step-dot').length !== total) buildStepDots(total);
        stepDotsEl.querySelectorAll('.step-dot').forEach((dot, i) => {
            dot.classList.remove('done', 'current');
            if (i < currentIndex) dot.classList.add('done');
            else if (i === currentIndex) dot.classList.add('current');
        });
    }

    // ─── Decision header chips ─────────────────────────────────
    function syncDecisionHeader(state, caseData) {
        setText('decision-step-chip', `Step ${state.currentStepIndex + 1}/${state.totalSteps}`);

        if (caseData && state.currentStageId) {
            const s = (caseData.stages || {})[state.currentStageId];
            setText('decision-stage-chip', (s && s.title) ? s.title : state.currentStageId);

            // The step's point_value is deliberately not surfaced anywhere:
            // points are awarded per correct option, so displaying "400" told
            // the learner there were exactly four correct answers of seven.
        }
    }

    // ─── Render: Info step ─────────────────────────────────────
    // Info steps hold chart data, which belongs in the patient file on the
    // left — NOT duplicated into the decision column. The right column
    // stays a pure decision surface and simply points at the right tab.
    function renderInfoStep(stepData) {
        const tab = stepData.chart_tab
            || (String(state_currentStepId()).indexOf('objective') !== -1 ? 'objective' : 'subjective');

        soapTab = tab;
        syncSoapTabs();
        renderPatientChart(activeCase);

        const label = tab === 'objective' ? 'Objective — ผลตรวจร่างกายและแล็บ'
                                          : 'Subjective — ประวัติจากผู้ป่วย';

        gameArea.innerHTML = `
            <div class="animate-fade-in flex flex-col items-center justify-center text-center gap-3 py-8 px-2">
                <div class="w-14 h-14 rounded-2xl grid place-items-center text-2xl border border-teal-400/35 bg-teal-400/10">📋</div>
                <span class="tag-pill !bg-teal-400/12 !text-teal-400 !border-teal-400/35">รวบรวมข้อมูล</span>
                <p class="text-sm font-bold text-white leading-relaxed">${esc(label)}</p>
                <p class="text-[.72rem] text-slate-400 leading-relaxed max-w-[16rem]">
                    เปิดแฟ้มผู้ป่วยเพื่ออ่านข้อมูลให้ครบก่อน แล้วจึงดำเนินการต่อ
                </p>
                <button id="btn-open-chart" class="md:hidden px-4 py-2.5 rounded-xl text-xs font-bold text-teal-400 bg-teal-400/10 border border-teal-400/35">
                    📄 เปิดแฟ้มผู้ป่วย
                </button>
                <p class="hidden md:block text-[.68rem] text-slate-600">← ดูแฟ้มผู้ป่วยที่คอลัมน์ซ้าย</p>

                <div class="submit-dock">
                    <button class="next-step-btn primary-btn w-full">อ่านเข้าใจแล้ว / ถัดไป →</button>
                </div>
            </div>`;

        const openChart = byId('btn-open-chart');
        if (openChart) openChart.addEventListener('click', openDrawer);
    }

    // Small helper so renderInfoStep can pick the right chart tab.
    function state_currentStepId() {
        try { return GameEngine.getState().currentStepId || ''; }
        catch (e) { return ''; }
    }

    // ─── Render: Single-answer MCQ (legacy case format) ────────
    function renderMCQStep(stepData) {
        const pts = stepData.point_value || 0;
        const choices = (stepData.choices || []).map(c => `
            <button class="choice-btn" data-choice-id="${esc(c.id)}">
                <span class="choice-key">${esc(c.id)}</span>
                <span class="flex-1">${esc(c.text)}</span>
                <span class="text-[.62rem] font-bold text-gold-400 flex-shrink-0 mt-0.5">+${pts}</span>
            </button>`).join('');

        gameArea.innerHTML = `
            <div class="animate-fade-in flex flex-col gap-3">
                <div>
                    <p class="text-[.6rem] font-bold tracking-widest text-teal-400 uppercase mb-1.5">Clinical Decision</p>
                    <h3 class="text-sm font-bold text-white leading-relaxed">${esc(stepData.question)}</h3>
                    <p class="text-[.68rem] text-slate-500 mt-1.5">ⓘ เลือก 1 คำตอบที่เหมาะสมที่สุด</p>
                </div>
                <div class="flex flex-col gap-2">${choices}</div>
                <div id="feedback-area"></div>
            </div>`;
    }

    // ─── Render: Multi-select MCQ ──────────────────────────────
    function renderMCQMulti(stepData) {
        multiSelection = new Set();
        multiPerPoint  = stepData.point_per_correct || 0;
        // No cap. select_count is authoring metadata only — surfacing it, or
        // enforcing it, tells the learner exactly how many options are correct,
        // which is the single largest hint the interface could give.
        multiLimit     = 0;

        // DTP tagging is required only on the step the case designates.
        dtpSelection = null;
        dtpRequired  = isDTPStep();

        // The patient's condition follows the authored clinical state, not the
        // learner's score, so a deteriorating avatar never signals a wrong answer
        // before the answer is submitted.
        if (stepData.patient_state) setPatientReaction(stepData.patient_state);

        const choices = (stepData.choices || []).map(c => `
            <button class="choice-btn choice-multi" data-choice-id="${esc(c.id)}" aria-pressed="false">
                <span class="choice-box" aria-hidden="true"></span>
                <span class="choice-key">${esc(c.id)}</span>
                <span class="flex-1">${esc(c.text)}</span>
            </button>`).join('');

        gameArea.innerHTML = `
            <div class="animate-fade-in flex flex-col gap-3">
                <div>
                    <p class="text-[.6rem] font-bold tracking-widest text-teal-400 uppercase mb-1.5">Clinical Decision</p>
                    <h3 class="text-sm font-bold text-white leading-relaxed">${esc(stepData.question)}</h3>
                    <p class="text-[.68rem] text-slate-500 mt-1.5">
                        ⓘ เลือกได้มากกว่าหนึ่งข้อ — ตอบผิดมีการหักคะแนน
                    </p>
                </div>

                ${dtpRequired ? renderDTPTagger() : ''}

                <div class="flex flex-col gap-2">${choices}</div>
                <div id="feedback-area"></div>

                <div class="submit-dock">
                    <p class="text-[.7rem] text-slate-400 mb-2">
                        เลือกแล้ว <strong id="multi-count" class="text-white">0</strong> ข้อ
                    </p>
                    <button class="submit-decision-btn primary-btn w-full" disabled>Submit Clinical Decision</button>
                </div>
            </div>`;
    }

    function toggleMultiChoice(btn) {
        const id = btn.dataset.choiceId;
        if (!id) return;

        if (multiSelection.has(id)) {
            multiSelection.delete(id);
            btn.classList.remove('is-selected');
            btn.setAttribute('aria-pressed', 'false');
        } else {
            multiSelection.add(id);
            btn.classList.add('is-selected');
            btn.setAttribute('aria-pressed', 'true');
        }

        syncSubmitState();
    }

    /**
     * Single owner of the Submit button's enabled state and label.
     * Both the choice buttons and the DTP chips feed into it, so the rule
     * "tag the DTP before choosing therapy" is enforced in one place.
     */
    function syncSubmitState() {
        setText('multi-count', multiSelection.size);

        const submit = document.querySelector('.submit-decision-btn');
        if (!submit) return;

        const needsTag = dtpRequired && dtpSelection == null;
        submit.disabled = multiSelection.size === 0 || needsTag;

        // The label must not vary with how close the selection is to the
        // answer key — a "✓" that appears at the right count would be a tell.
        submit.textContent = needsTag
            ? '🏷 เลือกประเภท DTP ก่อน'
            : 'Submit Clinical Decision';
    }

    // ─── Render: Feedback (single answer) ──────────────────────
    function renderFeedback(isCorrect, feedbackMessage) {
        const feedbackArea = byId('feedback-area');
        if (!feedbackArea) return;

        document.querySelectorAll('.choice-btn').forEach(btn => { btn.disabled = true; });

        markStreakActive();

        // The patient responds to the decision.
        adjustPatientHealth(isCorrect ? 8 : -12, isCorrect ? 'improving' : 'pain');

        const tone = isCorrect
            ? { cls: 'border-teal-400/50 bg-teal-400/10', text: 'text-teal-400', icon: '✓', title: 'ถูกต้อง!' }
            : { cls: 'border-acuity-500/50 bg-acuity-500/10', text: 'text-acuity-500', icon: '✕', title: 'ยังไม่ถูกต้อง' };

        feedbackArea.innerHTML = `
            <div class="rounded-xl border ${tone.cls} p-3 animate-slide-up">
                <div class="flex items-center gap-2 mb-1.5">
                    <span class="w-5 h-5 rounded-full grid place-items-center text-[.7rem] font-bold ${tone.text} border border-current">${tone.icon}</span>
                    <h4 class="text-xs font-extrabold ${tone.text}">${tone.title}</h4>
                </div>
                <p class="text-[.72rem] text-slate-300 leading-relaxed">${esc(feedbackMessage)}</p>
                <button class="next-step-btn primary-btn w-full mt-3">ขั้นตอนถัดไป →</button>
            </div>`;
        feedbackArea.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // ─── Render: Feedback (multi-select) ───────────────────────
    function showMultiFeedback(result) {
        document.querySelectorAll('.choice-multi').forEach(btn => {
            const id = btn.dataset.choiceId;
            const inKey     = result.answerKey.indexOf(id) !== -1;
            const wasPicked = result.hits.indexOf(id) !== -1 || result.misses.indexOf(id) !== -1;
            if (inKey) btn.classList.add('is-correct');
            else if (wasPicked) btn.classList.add('is-wrong');
            btn.disabled = true;
        });

        const dock = document.querySelector('.submit-dock');
        if (dock) dock.remove();

        markStreakActive();

        if (dtpRequired) renderDTPVerdict();

        // The learner has now committed to a monitoring plan, so the reference
        // framework is reinforcement rather than a hint.
        if (String(state_currentStepId()).indexOf('monitoring') !== -1 && !monitoringUnlocked) {
            monitoringUnlocked = true;
            syncSoapTabs();
            // Flag the tab so the learner notices something they could not
            // see before is now available, instead of having to re-check.
            document.querySelectorAll('.soap-tab[data-soap="monitoring"]').forEach(t => {
                t.classList.add('tab-just-unlocked');
                setTimeout(() => t.classList.remove('tab-just-unlocked'), 3400);
            });
            renderPatientChart(activeCase);
        }

        // Condition tracks how well the plan was executed.
        if (result.allCorrect)      adjustPatientHealth(10, 'improving');
        else if (result.earned > 0) adjustPatientHealth(2,  'pain');
        else                        adjustPatientHealth(-14, 'distress');

        const feedbackArea = byId('feedback-area');
        if (!feedbackArea) return;

        const tone = result.allCorrect
            ? { cls: 'border-teal-400/50 bg-teal-400/10', text: 'text-teal-400', icon: '✓', title: 'ถูกต้องทั้งหมด!' }
            : result.earned > 0
                ? { cls: 'border-gold-400/50 bg-gold-400/10', text: 'text-gold-400', icon: '◐', title: 'ถูกบางส่วน' }
                : { cls: 'border-acuity-500/50 bg-acuity-500/10', text: 'text-acuity-500', icon: '✕', title: 'ยังไม่ถูกต้อง' };

        feedbackArea.innerHTML = `
            <div class="rounded-xl border ${tone.cls} p-3 animate-slide-up">
                <div class="flex items-center gap-2 mb-1.5">
                    <span class="w-5 h-5 rounded-full grid place-items-center text-[.7rem] font-bold ${tone.text} border border-current">${tone.icon}</span>
                    <h4 class="text-xs font-extrabold ${tone.text}">${tone.title}</h4>
                    <span class="ml-auto text-[.7rem] font-mono font-bold ${tone.text}">
                        +${result.earned}<span class="text-slate-500">/${result.possible}</span>
                    </span>
                </div>
                <p class="text-[.7rem] text-slate-400 mb-1.5">
                    ตอบถูก ${result.hits.length} จาก ${result.answerKey.length} ข้อ
                    · เฉลย: <strong class="text-teal-400">${result.answerKey.join(', ')}</strong>
                    ${result.misses && result.misses.length
                        ? `· ตอบผิด <strong class="text-acuity-500">${result.misses.length}</strong> ข้อ (−${result.lost || 0})`
                        : ''}
                </p>
                <p class="text-[.72rem] text-slate-300 leading-relaxed">${esc(result.message || '')}</p>
                ${result.rationale ? `
                <div class="mt-2 pt-2 border-t border-navy-600/60">
                    <p class="text-[.56rem] font-bold tracking-widest text-slate-500 uppercase mb-1">Clinical Rationale</p>
                    <p class="text-[.68rem] text-slate-400 leading-relaxed">${esc(result.rationale)}</p>
                </div>` : ''}
                <button class="next-step-btn primary-btn w-full mt-3">ขั้นตอนถัดไป →</button>
            </div>`;
        feedbackArea.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // ─── End-of-case screens ───────────────────────────────────
    function renderEndScreen(opts) {
        const pct = opts.maxScore > 0 ? Math.round((opts.score / opts.maxScore) * 100) : 0;
        const stars = pct >= 85 ? 3 : pct >= 60 ? 2 : pct >= 35 ? 1 : 0;
        const starRow = Array.from({ length: 3 }, (_, i) =>
            `<span class="text-2xl ${i < stars ? 'text-gold-400' : 'text-navy-600'}">★</span>`).join('');

        const dock = document.querySelector('.submit-dock');
        if (dock) dock.remove();

        gameArea.innerHTML = `
            <div class="flex flex-col items-center justify-center text-center gap-3 py-6 px-2 animate-slide-up">
                <div class="w-16 h-16 rounded-2xl grid place-items-center text-3xl border ${opts.ringClass}">${opts.icon}</div>
                <span class="tag-pill ${opts.tagClass}">${opts.tag}</span>
                <h3 class="text-base font-extrabold text-white">${esc(opts.title)}</h3>
                <p class="text-[.72rem] text-slate-400 leading-relaxed max-w-md">${esc(opts.message)}</p>
                <div class="flex items-center gap-1">${starRow}</div>
                <div class="panel rounded-xl px-5 py-3 w-full max-w-xs">
                    <p class="text-[.6rem] font-bold tracking-widest text-slate-500 uppercase">Final Score</p>
                    <p class="text-xl font-mono font-extrabold text-gold-400 mt-0.5">
                        ${opts.score}<span class="text-slate-600 text-sm">/${opts.maxScore}</span>
                        <span class="text-xs text-slate-400 ml-1.5">(${pct}%)</span>
                    </p>
                    <p class="text-[.65rem] text-slate-500 mt-1">ทำได้ ${opts.completedSteps} / ${opts.totalSteps} ขั้นตอน</p>
                </div>
                <p class="text-[.62rem] text-slate-600 max-w-md">${esc(opts.footnote || '')}</p>
                <div class="submit-dock">
                    <button id="btn-end-return" class="primary-btn w-full">← กลับสู่ Campaign Map</button>
                </div>
            </div>`;

        const back = byId('btn-end-return');
        if (back) back.addEventListener('click', () => switchView('dashboard'));
    }

    function renderGameOver(fatalMessage, state) {
        // Highlight the fatal option that was picked, if still on screen
        document.querySelectorAll('.choice-multi.is-selected, .choice-btn.is-selected')
            .forEach(b => b.classList.add('is-fatal-pick'));

        clearTimeout(reactionTimer);
        setPatientHealth(0, { holdReaction: true });
        setPatientReaction('critical');

        renderEndScreen({
            icon: '☠',
            ringClass: 'border-acuity-500/50 bg-acuity-500/10',
            tag: '⚠ CRITICAL ERROR',
            tagClass: '!bg-acuity-500/12 !text-acuity-500 !border-acuity-500/35',
            title: 'Game Over — การตัดสินใจถึงแก่ชีวิต',
            message: fatalMessage || 'การตัดสินใจนี้ก่อให้เกิดอันตรายร้ายแรงต่อผู้ป่วย',
            score: state.currentScore,
            maxScore: state.maxPossibleScore,
            completedSteps: state.currentStepIndex + 1,
            totalSteps: state.totalSteps,
            footnote: 'ทบทวนเหตุผลทางเภสัชวิทยา แล้วลองเล่นเคสนี้ใหม่อีกครั้ง'
        });
    }

    function renderSummary(state) {
        clearTimeout(reactionTimer);
        const score = state.maxPossibleScore > 0
            ? state.currentScore / state.maxPossibleScore : 0;
        // A well-managed case leaves the patient visibly better.
        setPatientHealth(Math.max(patientHealth, 40 + Math.round(score * 58)), { holdReaction: true });
        setPatientReaction(score >= 0.6 ? 'recovered' : 'neutral');

        // Clearing a stage unlocks the next node on the journey map.
        markCaseCompleted(activeCase && activeCase.case_id);
        renderCaseMap(allCases, onStartCase);

        renderEndScreen({
            icon: '🎓',
            ringClass: 'border-teal-400/50 bg-teal-400/10',
            tag: '✓ STAGE CLEARED',
            tagClass: '!bg-teal-400/12 !text-teal-400 !border-teal-400/35',
            title: 'ผ่านด่านแล้ว!',
            // The diagnosis is the answer — reveal it only now, at the end.
            message: 'คำวินิจฉัยของเคสนี้คือ ' + ((activeCase && activeCase.case_title) || '—'),
            score: state.currentScore,
            maxScore: state.maxPossibleScore,
            completedSteps: state.totalSteps,
            totalSteps: state.totalSteps,
            footnote: 'ผลคะแนนถูกบันทึกเมื่อเข้าสู่ระบบด้วยบัญชี Google'
        });
    }

    // ─── Dashboard: Case Map ───────────────────────────────────
    // Every case in the registry is playable; no artificial locks.
    // ─── Local progression (unlock state) ──────────────────────
    const PROGRESS_KEY = 'ccs_progress_v1';

    function loadProgress() {
        try {
            const raw = JSON.parse(localStorage.getItem(PROGRESS_KEY));
            return (raw && Array.isArray(raw.completed)) ? raw : { completed: [] };
        } catch (e) { return { completed: [] }; }
    }
    function markCaseCompleted(caseId) {
        if (!caseId) return;
        const p = loadProgress();
        if (p.completed.indexOf(caseId) === -1) {
            p.completed.push(caseId);
            try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(p)); } catch (e) {}
            console.log(`[Progress] Stage cleared: ${caseId}`);
        }
    }

    // ═══ DAILY PRACTICE STREAK ═════════════════════════════════
    // Clinical reasoning is a habit, so the reward is for turning up, not for
    // scoring well: a day counts once the learner commits to any answer. That
    // keeps a bad day from breaking the streak, which would punish exactly the
    // practice the streak exists to encourage.
    const STREAK_KEY = 'ccs_streak_v1';

    /** Local calendar date as YYYY-MM-DD. Deliberately local, not UTC — a
     *  student in Bangkok should roll over at their midnight, not London's. */
    function todayKey(d) {
        const t = d || new Date();
        const p = n => String(n).padStart(2, '0');
        return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
    }

    function daysBetween(a, b) {
        const toDate = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
        return Math.round((toDate(b) - toDate(a)) / 86400000);
    }

    function loadStreak() {
        try {
            const raw = JSON.parse(localStorage.getItem(STREAK_KEY));
            if (raw && typeof raw.current === 'number') {
                return { current: raw.current, best: raw.best || raw.current, last: raw.last || null,
                         days: Array.isArray(raw.days) ? raw.days : [] };
            }
        } catch (e) { /* corrupt or unavailable — start fresh */ }
        return { current: 0, best: 0, last: null, days: [] };
    }

    /**
     * Records today as an active day. Idempotent: calling it repeatedly within
     * the same day does not inflate the count.
     * Returns { streak, changed } so the caller can celebrate only on the
     * first commitment of the day.
     */
    function markStreakActive() {
        const s = loadStreak();
        const today = todayKey();
        if (s.last === today) return { streak: s, changed: false };

        const gap = s.last ? daysBetween(s.last, today) : null;
        if (gap === 1) s.current += 1;        // consecutive day
        else s.current = 1;                    // first ever, or the chain broke

        s.best = Math.max(s.best, s.current);
        s.last = today;
        s.days = s.days.concat(today).slice(-60);

        try { localStorage.setItem(STREAK_KEY, JSON.stringify(s)); } catch (e) {}
        console.log(`[Streak] Day recorded — current ${s.current}, best ${s.best}.`);
        return { streak: s, changed: true };
    }

    /** The last 7 calendar days, oldest first, flagged active or not. */
    function recentWeek(s) {
        const out = [];
        const now = new Date();
        for (let i = 6; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
            const k = todayKey(d);
            out.push({ key: k, active: s.days.indexOf(k) !== -1,
                       label: ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'][d.getDay()] });
        }
        return out;
    }

    function renderStreakCard() {
        const host = byId('streak-card');
        if (!host) return;

        const s = loadStreak();
        const week = recentWeek(s);
        const activeToday = s.last === todayKey();
        const flame = s.current > 0 ? '🔥' : '🕯';

        const dots = week.map(d => `
            <div class="flex flex-col items-center gap-1">
                <div class="w-7 h-7 rounded-lg grid place-items-center text-[.7rem] font-bold
                            ${d.active ? 'bg-gold-400/20 border border-gold-400/60 text-gold-400'
                                       : 'bg-navy-800/60 border border-navy-700/60 text-slate-600'}">
                    ${d.active ? '🔥' : ''}
                </div>
                <span class="text-[.55rem] ${d.active ? 'text-gold-400' : 'text-slate-600'}">${d.label}</span>
            </div>`).join('');

        host.innerHTML = `
            <div class="panel rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center gap-3.5">
                <div class="flex items-center gap-3 flex-shrink-0">
                    <div class="w-12 h-12 rounded-xl grid place-items-center text-2xl flex-shrink-0
                                ${s.current > 0 ? 'bg-gold-400/12 border border-gold-400/40' : 'bg-navy-800 border border-navy-700'}">
                        ${flame}
                    </div>
                    <div class="leading-tight">
                        <p class="text-[.58rem] font-bold tracking-widest text-slate-500 uppercase">Practice Streak</p>
                        <p class="text-xl font-extrabold ${s.current > 0 ? 'text-gold-400' : 'text-slate-400'} leading-none mt-0.5">
                            ${s.current}<span class="text-[.7rem] font-bold text-slate-500 ml-1.5">วันติดต่อกัน</span>
                        </p>
                        <p class="text-[.6rem] text-slate-500 mt-0.5">สถิติสูงสุด ${s.best} วัน</p>
                    </div>
                </div>

                <div class="flex gap-1.5 sm:ml-auto">${dots}</div>

                <p class="text-[.64rem] leading-relaxed sm:max-w-[13rem] ${activeToday ? 'text-teal-400' : 'text-slate-400'}">
                    ${activeToday
                        ? '✓ วันนี้ฝึกแล้ว — พรุ่งนี้กลับมาต่อเพื่อรักษาสถิติ'
                        : 'ตอบคำถามอย่างน้อย 1 ข้อวันนี้ เพื่อต่อสถิติของคุณ'}
                </p>
            </div>`;
    }

    // ─── Campaign: journey map ─────────────────────────────────
    // Stage names never reveal the diagnosis — that is the answer the
    // learner is being asked to work out. Only the presenting complaint
    // is shown, which is what a pharmacist actually sees first.
    function renderCaseMap(cases, onStart) {
        allCases = cases || [];
        onStartCase = onStart;

        // The campaign panel is the default view at boot, so switchPanel()
        // never fires for it — draw the streak card here as well.
        renderStreakCard();

        if (!questTrack) return;

        if (!cases || cases.length === 0) {
            questTrack.innerHTML = `<p class="text-xs text-slate-500 py-6">ไม่พบข้อมูลเคส — ตรวจสอบไฟล์ใน data/</p>`;
            return;
        }

        const done = loadProgress().completed;

        questTrack.innerHTML = cases.map((c, i) => {
            let steps = 0, pts = 0;
            Object.values(c.stages || {}).forEach(st =>
                Object.values(st.steps || {}).forEach(s => { steps++; pts += (s.point_value || 0); }));

            const p        = c.patient || {};
            const acuity   = p.acuity || c.difficulty || '';
            const isHigh   = /HIGH|CRITICAL/i.test(acuity);
            const cleared  = done.indexOf(c.case_id) !== -1;
            const unlocked = i === 0 || done.indexOf(cases[i - 1].case_id) !== -1;
            const num      = String(i + 1).padStart(2, '0');

            const connector = i < cases.length - 1
                ? `<div class="hidden md:block absolute top-1/2 -right-3 w-6 h-px ${unlocked ? 'bg-teal-400/40' : 'bg-navy-600'}"></div>`
                : '';

            if (!unlocked) {
                return `
                    <div class="quest-node relative panel rounded-2xl p-4 flex flex-col gap-2 opacity-50 border-navy-700">
                        ${connector}
                        <div class="flex items-center gap-2">
                            <span class="w-9 h-9 rounded-full grid place-items-center text-base bg-navy-800 border border-navy-600">🔒</span>
                            <span class="tag-pill">STAGE ${num}</span>
                        </div>
                        <h3 class="text-sm font-extrabold text-slate-500 leading-snug">${esc(c.map_title || 'ด่านถัดไป')}</h3>
                        <p class="text-[.7rem] text-slate-600 leading-relaxed">ผ่านด่านก่อนหน้าเพื่อปลดล็อกเส้นทางนี้</p>
                        <div class="mt-auto pt-2">
                            <button class="w-full py-3 rounded-xl text-xs font-bold text-slate-600 bg-navy-800 border border-navy-700 cursor-not-allowed" disabled>
                                🔒 ยังไม่ปลดล็อก
                            </button>
                        </div>
                    </div>`;
            }

            return `
                <div class="quest-node relative panel rounded-2xl p-4 flex flex-col gap-2 ${cleared ? 'border-teal-400/40' : 'border-teal-400/25 animate-quest-glow'}">
                    ${connector}
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="w-9 h-9 rounded-full grid place-items-center text-sm font-extrabold flex-shrink-0
                                     ${cleared ? 'bg-teal-400 text-navy-900' : 'bg-teal-400/15 text-teal-400 border border-teal-400/50'}">
                            ${cleared ? '✓' : '▶'}
                        </span>
                        <span class="tag-pill !bg-navy-700 !text-slate-300">STAGE ${num}</span>
                        <span class="tag-pill ${isHigh
                            ? '!bg-acuity-500/12 !text-acuity-500 !border-acuity-500/35'
                            : '!bg-gold-400/12 !text-gold-400 !border-gold-400/35'}">${esc(acuity)}</span>
                    </div>

                    <h3 class="text-sm font-extrabold text-white leading-snug">${esc(c.map_title || ('ด่านที่ ' + (i + 1)))}</h3>

                    <p class="text-[.7rem] text-slate-400 leading-relaxed">
                        ${esc(c.map_subtitle || p.chief_complaint || '')}
                    </p>

                    <div class="flex items-center gap-3 text-[.68rem] text-slate-400 mt-1">
                        <span>🏥 ${esc(c.ward || '')}</span>
                        <span>☰ <strong class="text-white">${steps}</strong> steps</span>
                        <span>★ <strong class="text-gold-400">${pts.toLocaleString('en-US')}</strong></span>
                    </div>

                    <button class="primary-btn w-full mt-2" data-case-index="${i}">
                        ${cleared ? '↻ เล่นซ้ำ' : '▶ เริ่มภารกิจ'}
                    </button>
                </div>`;
        }).join('');

        questTrack.querySelectorAll('[data-case-index]').forEach(btn => {
            btn.addEventListener('click', function() {
                const idx = parseInt(btn.dataset.caseIndex, 10);
                if (typeof onStart === 'function') onStart(cases[idx]);
            });
        });
    }

    // ═══ ANIMATED PATIENT AVATAR ═══════════════════════════════
    // A half-body character whose face, breathing rate, colour and
    // aura react to the learner's clinical decisions.
    // Desktop/tablet avatar lives in column 2; the mobile layout hides that
    // column, so a compact second host keeps the patient visible on phones.
    const avatarHosts = ['patient-avatar', 'patient-avatar-mobile']
        .map(id => byId(id)).filter(Boolean);
    const avatarEl = avatarHosts[0];

    // Flat patient portrait set in a ward room, thick dark linework,
    // front-facing so the learner is addressed directly.
    //
    // Two designs only — male and female. Age is not depicted, by design: the
    // patient's age is written on the chart, and drawing it would add a visual
    // cue the case data already carries.
    //
    // Every animation hook the stylesheet drives is preserved:
    //   .pa-head-group  head follows the cursor
    //   .pa-pupil       eyes follow the cursor
    //   .pa-eyes-open   hidden on pain/critical, revealing the closed-eye lines
    //   .pa-eyelid      blink
    //   .pa-skin        skin tone shifts with condition
    //   .pa-chest       breathing, rate varies by condition
    //   .pa-sweat       sweat on pain/distress
    //   .pa-aura        red glow on critical
    //   .pa-variant     the six expression sets
    /**
     * The same portrait is mounted into two hosts (desktop panel + mobile
     * strip). Every id inside must therefore be unique per instance: two SVGs
     * declaring id="paRoom" is a duplicate-id collision, and a url(#paRoom)
     * that resolves into a hidden sibling SVG paints as *nothing* — which is
     * how the room ended up with an unfilled window and a colourless wall
     * while the flat-filled shapes beside it rendered fine. `uid` suffixes
     * every id so each copy references only its own defs.
     */
    function buildAvatarSVG(sex, uid) {
        const female = String(sex || '').toUpperCase().charAt(0) === 'F';
        // The counter hangs off the function itself so the whole builder stays
        // self-contained — tools/preview-avatar.js lifts this function out of
        // the file and runs it standalone.
        const u = uid == null
            ? `a${buildAvatarSVG.seq = (buildAvatarSVG.seq || 0) + 1}`
            : uid;

        const INK   = '#2F3542';   // outline
        const HAIR  = female ? '#7A4B2C' : '#2E3440';
        // The male gown is slightly grey rather than white so its silhouette
        // still reads against the white sticker disc behind it.
        const GOWN  = female ? '#9BDBD6' : '#E3E7ED';
        const GOWN2 = female ? '#6FBDB8' : '#C9D0DA';

        // ── Hair ────────────────────────────────────────────────
        const hair = female
            ? `
      <!-- Long hair: fringe swept to one side, falling past the jaw.
           The inner edge stays above y≈80 so it clears the eyebrows at 86. -->
      <path d="M112 112 C110 60 133 38 160 38 C190 38 210 60 208 112
               C208 130 206 142 204 152 C200 130 200 112 199 92
               C186 80 150 80 136 68 C124 76 118 88 116 112
               C115 128 114 142 112 152 Z" fill="${HAIR}"/>
      <path d="M136 68 C150 80 186 80 199 92" fill="none" stroke="${HAIR}" stroke-width="6" stroke-linecap="round"/>`
            : `
      <!-- Short hair with a side part. It wraps down past the ears on both
           sides, and the fringe bottom is held near y≈70 so the forehead and
           eyebrows stay clear of it. -->
      <path d="M114 116 C112 56 134 36 160 36 C188 36 208 56 206 116
               C205 104 204 92 203 84 C202 74 196 68 186 64
               C177 76 141 78 131 64 C121 70 118 78 117 88
               C116 96 115 106 114 116 Z" fill="${HAIR}"/>`;

        // Ponytail sits outside the head clip so it reads beyond the silhouette.
        const ponytail = female
            ? `
    <g class="pa-tail">
      <path d="M200 118 C222 118 234 136 230 158 C227 176 214 184 204 178
               C214 168 216 148 206 136 Z" fill="${HAIR}" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>
    </g>`
            : '';

        // Glasses are part of the male design in the reference artwork.
        const glasses = female ? '' : `
      <g class="pa-glasses" fill="none" stroke="${INK}" stroke-width="3.4">
        <circle cx="141" cy="104" r="15.5"/>
        <circle cx="179" cy="104" r="15.5"/>
        <path d="M156.5 103 q3.5 -3 7 0" stroke-linecap="round"/>
        <path d="M125.5 101 L118 99" stroke-linecap="round"/>
        <path d="M194.5 101 L202 99" stroke-linecap="round"/>
      </g>`;

        // A small dressing on the brow, as drawn in the reference sheet.
        const dressing = female ? `
      <g transform="rotate(-18 190 74)">
        <rect x="178" y="66" width="24" height="13" rx="3" fill="#FFFFFF" stroke="${INK}" stroke-width="3"/>
        <path d="M186 68 v9 M194 68 v9" stroke="${INK}" stroke-width="1.6" opacity=".55"/>
      </g>` : '';

        // Blush is used only on the female design, matching the reference.
        const blush = female ? `
      <ellipse cx="128" cy="120" rx="8.5" ry="5" fill="#F2A6A6" opacity=".75"/>
      <ellipse cx="192" cy="120" rx="8.5" ry="5" fill="#F2A6A6" opacity=".75"/>` : '';

        // Decorative trim on the male gown, as in the reference.
        const trim = female ? '' : `
      <path d="M147 154 L162 184" fill="none" stroke="#8FC7D8" stroke-width="2.4"
            stroke-linecap="round" stroke-dasharray="4 5"/>`;

        return `
<svg viewBox="0 0 320 240" xmlns="http://www.w3.org/2000/svg" role="img"
     aria-label="ภาพผู้ป่วย${female ? 'หญิง' : 'ชาย'}" preserveAspectRatio="xMidYMid meet">
  <defs>
    <clipPath id="paFrame-${u}"><rect x="0" y="0" width="320" height="240" rx="14"/></clipPath>
    <clipPath id="paHead-${u}"><ellipse cx="160" cy="102" rx="41" ry="45"/></clipPath>
    <clipPath id="paGlass-${u}"><rect x="26" y="34" width="86" height="74" rx="6"/></clipPath>
    <radialGradient id="paAlarm-${u}" cx="50%" cy="50%">
      <stop offset="35%" stop-color="#E63946" stop-opacity=".55"/>
      <stop offset="100%" stop-color="#E63946" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <g clip-path="url(#paFrame-${u})">

  <!-- ── ROOM ───────────────────────────────────────────────
       A ward room behind the patient. Every shape carries an
       explicit solid fill — no gradients, no opacity-only
       washes over an assumed backdrop — so the scene renders
       identically in the browser, in a static rasteriser and
       inside a second mounted copy of this SVG.

       Colour is carried by the objects (sky, plant, curtain,
       blanket rail) rather than by a loud wall, so the figure
       still reads as the subject. -->
  <rect width="320" height="240" fill="#F2E4D0"/>
  <rect y="150" width="320" height="90" fill="#DFC9AC"/>
  <rect y="146" width="320" height="6" fill="#C9A87E"/>
  <rect y="212" width="320" height="28" fill="#C9A87E"/>

  <!-- Window: sky, sun and cloud behind a white frame -->
  <g clip-path="url(#paGlass-${u})">
    <rect x="26" y="34" width="86" height="74" fill="#8FD3EE"/>
    <rect x="26" y="34" width="86" height="26" fill="#B4E4F6"/>
    <circle cx="97" cy="50" r="11" fill="#FFD972"/>
    <ellipse cx="52" cy="60" rx="17" ry="8" fill="#FFFFFF"/>
    <ellipse cx="64" cy="57" rx="11" ry="7" fill="#FFFFFF"/>
    <rect x="26" y="92" width="86" height="16" fill="#7FC3A0"/>
  </g>
  <rect x="26" y="34" width="86" height="74" rx="6" fill="none" stroke="#FFFFFF" stroke-width="5"/>
  <path d="M69 36 V106 M28 71 H110" stroke="#FFFFFF" stroke-width="4.5" stroke-linecap="round"/>
  <rect x="18" y="108" width="102" height="8" rx="3" fill="#C9A87E"/>

  <!-- Potted plant on the sill -->
  <path d="M34 108 C34 92 44 88 44 80 C52 86 50 100 46 108 Z" fill="#5FA777"/>
  <path d="M46 108 C48 96 58 92 64 92 C62 102 54 108 50 108 Z" fill="#77BE8A"/>
  <path d="M32 108 h26 l-4 14 h-18 Z" fill="#E07A5F"/>

  <!-- Privacy curtain on the far side -->
  <rect x="228" y="20" width="78" height="146" fill="#F0B3A3"/>
  <path d="M240 20 v146 M256 20 v146 M272 20 v146 M290 20 v146"
        stroke="#E09A89" stroke-width="5" stroke-linecap="round"/>
  <rect x="222" y="14" width="92" height="8" rx="4" fill="#B7BCC9"/>

  <!-- Critical alarm glow -->
  <circle class="pa-aura" cx="160" cy="120" r="132" fill="url(#paAlarm-${u})"/>

  <g>

    <!-- ── BODY ─────────────────────────────────────────── -->
    <g class="pa-chest">
      <path d="M160 146 C116 148 86 174 78 236 L242 236 C234 174 204 148 160 146 Z"
            fill="${GOWN}" stroke="${INK}" stroke-width="3.8" stroke-linejoin="round"/>

      <!-- Kimono wrap: the chest opening, then the two collar bands, then the
           single seam where the left panel laps over the right. Earlier this
           was two lines splaying from the V, which read as suspenders. -->
      <path d="M140 149 L160 188 L180 149 Z" class="pa-skin"/>
      <path d="M136 148 L160 190 L184 148" fill="none" stroke="${INK}"
            stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>
      <path d="M143 150 L160 183 L177 150" fill="none" stroke="${GOWN2}"
            stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>
      <path d="M160 190 L141 236" fill="none" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/>
      ${trim}
    </g>

    <!-- Neck -->
    <path d="M144 128 h32 v22 q-16 10 -32 0 z" class="pa-skin" stroke="${INK}"
          stroke-width="3.6" stroke-linejoin="round"/>

    ${ponytail}

    <!-- ── HEAD ─────────────────────────────────────────── -->
    <g class="pa-head-group">

      <!-- Ears -->
      <ellipse cx="119" cy="108" rx="7" ry="10" class="pa-skin" stroke="${INK}" stroke-width="3.2"/>
      <ellipse cx="201" cy="108" rx="7" ry="10" class="pa-skin" stroke="${INK}" stroke-width="3.2"/>

      <!-- Face -->
      <ellipse cx="160" cy="102" rx="41" ry="45" class="pa-skin" stroke="${INK}" stroke-width="3.8"/>

      <g clip-path="url(#paHead-${u})">${hair}</g>
      ${dressing}
      ${blush}
      ${glasses}

      <!-- EYES — follow the cursor -->
      <g class="pa-eyes-open">
        <g class="pa-pupil">
          <ellipse cx="141" cy="104" rx="6.2" ry="7.4" fill="${INK}"/>
          <circle cx="143" cy="101" r="2.1" fill="#FFFFFF"/>
        </g>
        <g class="pa-pupil">
          <ellipse cx="179" cy="104" rx="6.2" ry="7.4" fill="${INK}"/>
          <circle cx="181" cy="101" r="2.1" fill="#FFFFFF"/>
        </g>
        <!-- Blink lids, hidden at rest and flashed in by the CSS animation. -->
        <rect class="pa-eyelid pa-skin" x="132" y="93" width="18" height="13" rx="4"/>
        <rect class="pa-eyelid pa-skin" x="170" y="93" width="18" height="13" rx="4"/>
      </g>

      <!-- Nose -->
      <path d="M160 108 q4 6 -1 8" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>

      <!-- Sweat -->
      <g class="pa-sweat">
        <ellipse cx="123" cy="86" rx="3.4" ry="5.2" fill="#7DD3FC" stroke="${INK}" stroke-width="1.6"/>
        <ellipse cx="197" cy="92" rx="3" ry="4.6" fill="#7DD3FC" stroke="${INK}" stroke-width="1.6"/>
      </g>

      <!-- ── EXPRESSIONS ────────────────────────────────── -->
      <g class="pa-variant pa-neutral">
        <path d="M131 86 h19 M170 86 h19" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/>
        <path d="M151 128 h18" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/>
      </g>

      <g class="pa-variant pa-improving">
        <path d="M131 84 h19 M170 84 h19" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/>
        <path d="M149 125 q11 8 22 0" fill="none" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/>
      </g>

      <g class="pa-variant pa-recovered">
        <path d="M131 82 h19 M170 82 h19" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/>
        <path d="M145 122 q15 14 30 0" fill="none" stroke="${INK}" stroke-width="3.6" stroke-linecap="round"/>
        <ellipse cx="128" cy="120" rx="8.5" ry="5" fill="#F2A6A6" opacity=".8"/>
        <ellipse cx="192" cy="120" rx="8.5" ry="5" fill="#F2A6A6" opacity=".8"/>
      </g>

      <g class="pa-variant pa-pain">
        <path d="M131 80 l19 8 M189 80 l-19 8" stroke="${INK}" stroke-width="3.6" stroke-linecap="round"/>
        <!-- eyes are hidden by CSS here, so the squeeze is drawn in -->
        <path d="M133 104 q8 -7 16 0 M171 104 q8 -7 16 0" fill="none" stroke="${INK}" stroke-width="3.2" stroke-linecap="round"/>
        <path d="M148 130 q6 -8 12 0 t12 0" fill="none" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/>
      </g>

      <g class="pa-variant pa-distress">
        <path d="M130 80 q10 -7 20 -1 M190 80 q-10 -7 -20 -1" fill="none" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/>
        <ellipse cx="160" cy="130" rx="9" ry="10.5" fill="#7E3A3A" stroke="${INK}" stroke-width="3"/>
      </g>

      <g class="pa-variant pa-critical">
        <path d="M131 88 h19 M170 88 h19" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>
        <path d="M132 104 h18 M170 104 h18" stroke="${INK}" stroke-width="3.2" stroke-linecap="round"/>
        <ellipse cx="160" cy="132" rx="8" ry="9.5" fill="#5F2B2B" stroke="${INK}" stroke-width="3"/>
      </g>
    </g>
  </g>
  </g>
</svg>`;
    }

    const REACTIONS = ['neutral', 'pain', 'distress', 'critical', 'improving', 'recovered'];
    let patientHealth = 60;
    let reactionTimer = null;

    // Case files author clinical states ("shock", "stabilized"); the artwork
    // has six expressions. This maps one onto the other so an authored state
    // never silently degrades to a blank neutral face.
    const CLINICAL_STATE_MAP = {
        shock: 'distress',
        stabilized: 'neutral',
        improving: 'improving',
        recovered: 'recovered',
        pain: 'pain',
        distress: 'distress',
        critical: 'critical',
        neutral: 'neutral'
    };

    function setPatientReaction(state) {
        const mapped = CLINICAL_STATE_MAP[state] || state;
        const next = REACTIONS.indexOf(mapped) !== -1 ? mapped : 'neutral';
        avatarHosts.forEach(host => {
            REACTIONS.forEach(r => host.classList.remove('reaction-' + r));
            host.classList.add('reaction-' + next);
            host.dataset.reaction = next;
        });
    }

    function reactionForHealth(h) {
        if (h <= 0)  return 'critical';
        if (h < 30)  return 'distress';
        if (h < 55)  return 'pain';
        if (h < 85)  return 'neutral';
        return 'recovered';
    }

    function paintHealth() {
        const w = Math.max(0, Math.min(100, patientHealth)) + '%';
        const txt = Math.round(patientHealth) + '%';
        ['patient-health-bar', 'patient-health-bar-mobile'].forEach(id => {
            const el = byId(id); if (el) el.style.width = w;
        });
        ['patient-health-label', 'patient-health-label-mobile'].forEach(id => {
            const el = byId(id); if (el) el.textContent = txt;
        });
    }

    function setPatientHealth(value, opts) {
        patientHealth = Math.max(0, Math.min(100, value));
        paintHealth();
        if (!opts || !opts.holdReaction) setPatientReaction(reactionForHealth(patientHealth));
    }

    // Temporary reaction that decays back to the health-derived state.
    function flashReaction(state, ms) {
        clearTimeout(reactionTimer);
        setPatientReaction(state);
        reactionTimer = setTimeout(() => {
            setPatientReaction(reactionForHealth(patientHealth));
        }, ms || 2200);
    }

    function adjustPatientHealth(delta, flash) {
        patientHealth = Math.max(0, Math.min(100, patientHealth + delta));
        paintHealth();
        if (flash) flashReaction(flash);
        else setPatientReaction(reactionForHealth(patientHealth));
    }

    // ─── Cursor tracking ───────────────────────────────────────
    // The patient watches the pharmacist: pupils and head follow the
    // pointer. Written directly as SVG transforms (no CSS transition)
    // so it stays responsive and does not depend on the compositor.
    let eyeTrackingBound = false;

    function aimEyes(clientX, clientY) {
        avatarHosts.forEach(host => {
            const svg = host.querySelector('svg');
            if (!svg) return;
            const r = svg.getBoundingClientRect();
            if (r.width === 0) return;

            const cx = r.left + r.width / 2;
            const cy = r.top + r.height * 0.5;
            const dx = Math.max(-1, Math.min(1, (clientX - cx) / (r.width * 0.75)));
            const dy = Math.max(-1, Math.min(1, (clientY - cy) / (r.height * 0.75)));

            host.querySelectorAll('.pa-pupil').forEach(p => {
                p.setAttribute('transform', `translate(${(dx * 3.6).toFixed(2)} ${(dy * 2.6).toFixed(2)})`);
            });
            const head = host.querySelector('.pa-head-group');
            if (head) {
                head.setAttribute('transform', `translate(${(dx * 3.4).toFixed(2)} ${(dy * 1.8).toFixed(2)})`);
            }
        });
    }

    function initEyeTracking() {
        if (eyeTrackingBound) return;
        eyeTrackingBound = true;
        document.addEventListener('mousemove', e => aimEyes(e.clientX, e.clientY), { passive: true });
        document.addEventListener('touchmove', e => {
            if (e.touches && e.touches[0]) aimEyes(e.touches[0].clientX, e.touches[0].clientY);
        }, { passive: true });
    }

    function initPatientAvatar(caseData) {
        if (avatarHosts.length === 0) return;

        const p = (caseData && caseData.patient) || {};

        // The portrait follows the case's patient sex and nothing else.
        // Anything absent or unrecognised falls back to the male design
        // rather than rendering no patient at all.
        // One build per host, each with its own id namespace — see the note on
        // buildAvatarSVG(). Sharing one markup string between both hosts is
        // what broke the room's fills.
        avatarHosts.forEach((h, i) => { h.innerHTML = buildAvatarSVG(p.sex, `h${i}`); });
        clearTimeout(reactionTimer);
        initEyeTracking();

        setText('patient-name-strip',
            `${p.name || 'ผู้ป่วย'}${p.age ? `, ${p.age}${p.sex || ''}` : ''}`);

        // Every case now starts from the same neutral baseline.
        //
        // This used to be derived from patient.acuity and the count of vitals
        // flagged "critical". Both fields were removed from the case files
        // because they stated conclusions the learner is supposed to reach, and
        // an avatar that already looks near death is the same hint drawn in
        // pixels. Each step's authored patient_state drives the expression from
        // here, and the learner's own decisions move it after that.
        setPatientHealth(70);
    }

    // ═══ DASHBOARD PANELS ══════════════════════════════════════
    let allCases = [];
    let onStartCase = null;
    let activePanel = 'campaign';

    function switchPanel(name) {
        activePanel = name;

        document.querySelectorAll('[data-panel]').forEach(el => {
            el.classList.toggle('is-active', el.dataset.panel === name);
        });
        document.querySelectorAll('[data-panel-body]').forEach(el => {
            el.classList.toggle('hidden', el.dataset.panelBody !== name);
        });

        if (name === 'campaign')     renderStreakCard();
        if (name === 'stats')        renderStatsPanel();
        if (name === 'leaderboard')  renderLeaderboardPanel();
        if (name === 'achievements') renderAchievementsPanel();
        if (name === 'instructor')   renderInstructorPanel();
    }

    function loadingBlock(text) {
        return `<div class="panel rounded-2xl p-6 text-center">
                    <p class="text-xs text-slate-400">${esc(text)}</p>
                </div>`;
    }

    // Honest empty/blocked states — never a fake number.
    function stateBlock(result, emptyMsg) {
        if (result.reason === 'signed-out') {
            return `<div class="panel rounded-2xl p-6 text-center">
                        <p class="text-2xl mb-2">🔒</p>
                        <p class="text-xs font-bold text-white mb-1">ต้องเข้าสู่ระบบก่อน</p>
                        <p class="text-[.7rem] text-slate-500">โหมด Anonymous ไม่บันทึกผล จึงไม่มีสถิติให้แสดง</p>
                    </div>`;
        }
        if (result.reason === 'permission-denied') {
            return `<div class="panel rounded-2xl p-6 text-center border-gold-400/30">
                        <p class="text-2xl mb-2">⚠</p>
                        <p class="text-xs font-bold text-gold-400 mb-1">Firestore ปฏิเสธการอ่านข้อมูล</p>
                        <p class="text-[.7rem] text-slate-400 leading-relaxed">
                            Security Rules ของคอลเลกชัน <code class="text-teal-400">user_attempts</code>
                            ยังไม่อนุญาตให้อ่าน — ต้องแก้ที่ Firebase Console
                        </p>
                    </div>`;
        }
        if (result.reason === 'missing-index') {
            return `<div class="panel rounded-2xl p-6 text-center border-gold-400/30">
                        <p class="text-2xl mb-2">🗂</p>
                        <p class="text-xs font-bold text-gold-400 mb-1">ยังไม่ได้สร้าง Composite Index</p>
                        <p class="text-[.7rem] text-slate-400 leading-relaxed">
                            Deploy ไฟล์ <code class="text-teal-400">firestore.indexes.json</code>
                            ด้วยคำสั่ง <code class="text-teal-400">firebase deploy --only firestore:indexes</code>
                        </p>
                    </div>`;
        }
        if (result.reason === 'offline' || result.reason === 'error') {
            return `<div class="panel rounded-2xl p-6 text-center border-acuity-500/30">
                        <p class="text-xs font-bold text-acuity-500 mb-1">เชื่อมต่อฐานข้อมูลไม่ได้</p>
                        <p class="text-[.7rem] text-slate-500">${esc(result.message || '')}</p>
                    </div>`;
        }
        return `<div class="panel rounded-2xl p-6 text-center">
                    <p class="text-2xl mb-2">📭</p>
                    <p class="text-xs text-slate-400">${esc(emptyMsg)}</p>
                </div>`;
    }

    function pct(a, b) { return b > 0 ? Math.round((a / b) * 100) : 0; }

    // ═══ LEARNER ANALYTICS ═════════════════════════════════════
    // One derivation, two consumers: the My Stats dashboard and the
    // achievement engine. Both must agree on every number, so neither
    // computes anything on its own.
    //
    // Attempts written before the telemetry schema (schemaVersion 2) carry
    // no stepLog, no duration and no local clock. Those attempts are counted
    // wherever the score alone is enough and skipped — not zero-filled —
    // wherever they are not. `telemetryRows` is how a panel knows which
    // denominator it is entitled to use.

    /** Attempt date as a JS Date, preferring the server timestamp. */
    function attemptDate(r) {
        if (r.completedAt && r.completedAt.seconds) return new Date(r.completedAt.seconds * 1000);
        if (r.localDayKey) {
            const p = String(r.localDayKey).split('-').map(Number);
            if (p.length === 3) return new Date(p[0], p[1] - 1, p[2]);
        }
        return null;
    }

    function dayKeyOf(r) {
        if (r.localDayKey) return r.localDayKey;
        const d = attemptDate(r);
        return d ? todayKey(d) : null;
    }

    function median(nums) {
        if (!nums.length) return 0;
        const s = nums.slice().sort((a, b) => a - b);
        const m = Math.floor(s.length / 2);
        return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
    }

    function fmtDuration(sec) {
        if (sec == null) return '—';
        if (sec < 60) return `${sec}s`;
        const m = Math.floor(sec / 60);
        if (m < 60) return `${m}m ${sec % 60}s`;
        return `${Math.floor(m / 60)}h ${m % 60}m`;
    }

    /**
     * Everything the dashboard and the badges are allowed to know.
     * Pure — no DOM, no network — so it can be checked in isolation.
     */
    function deriveStats(rows) {
        const a = rows.map(r => Object.assign({}, r, {
            p: pct(r.finalScore, r.maxScore),
            date: attemptDate(r),
            day: dayKeyOf(r)
        }));

        // Oldest → newest. getMyAttempts hands back newest first, and every
        // trend below reads forwards in time.
        const chrono = a.slice().reverse();
        const tele   = a.filter(r => Array.isArray(r.stepLog) && r.stepLog.length);

        const pcts     = a.map(r => r.p);
        const clean    = a.filter(r => !r.isFatal);
        const finished = clean.filter(r => r.totalSteps > 0 && r.completedSteps >= r.totalSteps);

        // Longest run of consecutive non-fatal attempts, read forwards.
        let run = 0, safeRun = 0;
        chrono.forEach(r => { if (r.isFatal) run = 0; else { run++; safeRun = Math.max(safeRun, run); } });

        // Consecutive attempts each scoring better than the one before it.
        let imp = 0, bestImp = 0;
        for (let i = 1; i < chrono.length; i++) {
            if (chrono[i].p > chrono[i - 1].p) { imp++; bestImp = Math.max(bestImp, imp); }
            else imp = 0;
        }

        // Recovery: scored below 50% at some point, then above 80% later on.
        let comeback = false, sawLow = false;
        chrono.forEach(r => { if (r.p < 50) sawLow = true; else if (sawLow && r.p >= 80) comeback = true; });

        // Per-stage and per-step aggregation, telemetry rows only.
        const byStage = {}, byStep = {}, hours = new Array(24).fill(0);
        tele.forEach(r => {
            r.stepLog.forEach(s => {
                if (!s.possible) return;
                const st = byStage[s.stageId] || (byStage[s.stageId] = { earned: 0, possible: 0, seen: 0, perfect: 0 });
                st.earned += s.earned || 0; st.possible += s.possible;
                st.seen++; if (s.perfect) st.perfect++;

                const key = `${r.caseId}::${s.stepId}`;
                const sp = byStep[key] || (byStep[key] = { caseId: r.caseId, stepId: s.stepId, seen: 0, perfect: 0, misses: 0, seconds: 0, timed: 0 });
                sp.seen++;
                if (s.perfect) sp.perfect++;
                sp.misses += s.misses || 0;
                if (s.seconds != null) { sp.seconds += s.seconds; sp.timed++; }
            });
        });
        a.forEach(r => { if (typeof r.localHour === 'number') hours[r.localHour]++; });

        const timed = a.filter(r => typeof r.durationSec === 'number' && r.durationSec > 0);
        const streak = loadStreak();

        return {
            rows: a, chrono, tele,
            n: a.length,
            best: pcts.length ? Math.max(...pcts) : 0,
            worst: pcts.length ? Math.min(...pcts) : 0,
            avg: pcts.length ? Math.round(pcts.reduce((s, v) => s + v, 0) / pcts.length) : 0,
            median: median(pcts),
            latest: a.length ? a[0].p : 0,
            bestScore: a.length ? Math.max(...a.map(r => r.finalScore)) : 0,
            totalScore: a.reduce((s, r) => s + (r.finalScore || 0), 0),
            distinctCases: new Set(a.map(r => r.caseId)).size,
            fatals: a.filter(r => r.isFatal).length,
            fatalRate: a.length ? Math.round((a.filter(r => r.isFatal).length / a.length) * 100) : 0,
            cleanRuns: clean.length,
            finishedRuns: finished.length,
            safeRun: safeRun,
            bestImprovementRun: bestImp,
            comeback: comeback,
            distinctDays: new Set(a.map(r => r.day).filter(Boolean)).size,
            byStage: byStage,
            byStep: byStep,
            hours: hours,
            // Telemetry-only figures. `hasTelemetry` gates every badge and tile
            // that would otherwise read a missing field as a zero.
            hasTelemetry: tele.length > 0,
            telemetryRuns: tele.length,
            gradedSteps: tele.reduce((s, r) => s + (r.gradedSteps || 0), 0),
            perfectSteps: tele.reduce((s, r) => s + (r.perfectSteps || 0), 0),
            wrongPicks: tele.reduce((s, r) => s + (r.wrongPicks || 0), 0),
            bestStepStreak: tele.reduce((m, r) => Math.max(m, r.bestStepStreak || 0), 0),
            flawlessRuns: tele.filter(r => !r.isFatal && r.gradedSteps > 0 && r.perfectSteps === r.gradedSteps).length,
            totalSeconds: timed.reduce((s, r) => s + r.durationSec, 0),
            avgSeconds: timed.length ? Math.round(timed.reduce((s, r) => s + r.durationSec, 0) / timed.length) : null,
            fastestGoodRun: (() => {
                const c = timed.filter(r => !r.isFatal && r.p >= 80);
                return c.length ? Math.min(...c.map(r => r.durationSec)) : null;
            })(),
            dtpAttempts: a.filter(r => r.dtpTag != null).length,
            dtpCorrect: a.filter(r => r.dtpCorrect === true).length,
            streakCurrent: streak.current || 0,
            streakBest: streak.best || 0
        };
    }

    // ─── My Stats ──────────────────────────────────────────────
    function statCard(label, value, tone, sub) {
        return `<div class="panel rounded-xl p-3">
                    <p class="text-[.55rem] font-bold tracking-widest text-slate-500 uppercase">${esc(label)}</p>
                    <p class="text-lg font-mono font-extrabold ${tone || 'text-white'} mt-0.5 leading-none">${value}</p>
                    ${sub ? `<p class="text-[.55rem] text-slate-600 mt-1 leading-tight">${esc(sub)}</p>` : ''}
                </div>`;
    }

    function sectionTitle(title, note) {
        return `<div class="flex items-baseline gap-2 mt-5 mb-2">
                    <p class="text-[.6rem] font-bold tracking-widest text-slate-500 uppercase">${esc(title)}</p>
                    ${note ? `<p class="text-[.55rem] text-slate-600">${esc(note)}</p>` : ''}
                </div>`;
    }

    /** Score trend as an inline sparkline — no chart library, no network. */
    function trendChart(chrono) {
        const pts = chrono.slice(-24);
        if (pts.length < 2) {
            return `<div class="panel rounded-xl p-4 text-center">
                        <p class="text-[.65rem] text-slate-500">ต้องเล่นอย่างน้อย 2 ครั้งจึงจะวาดกราฟแนวโน้มได้</p>
                    </div>`;
        }
        const W = 600, H = 120, PAD = 8;
        const x = i => PAD + (i * (W - PAD * 2)) / (pts.length - 1);
        const y = v => H - PAD - (v / 100) * (H - PAD * 2);
        const line = pts.map((r, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(r.p).toFixed(1)}`).join(' ');
        const area = `${line} L${x(pts.length - 1).toFixed(1)},${H - PAD} L${x(0).toFixed(1)},${H - PAD} Z`;
        const dots = pts.map((r, i) =>
            `<circle cx="${x(i).toFixed(1)}" cy="${y(r.p).toFixed(1)}" r="${r.isFatal ? 4 : 3}"
                     fill="${r.isFatal ? '#FF6B6B' : '#48E5C2'}"><title>${r.p}%${r.isFatal ? ' — FATAL' : ''}</title></circle>`).join('');

        return `<div class="panel rounded-xl p-3">
                    <svg viewBox="0 0 ${W} ${H}" class="w-full h-28" preserveAspectRatio="none" role="img"
                         aria-label="แนวโน้มคะแนน ${pts.length} ครั้งล่าสุด">
                        <defs><linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stop-color="#48E5C2" stop-opacity=".28"/>
                            <stop offset="100%" stop-color="#48E5C2" stop-opacity="0"/>
                        </linearGradient></defs>
                        ${[25, 50, 75].map(v => `<line x1="${PAD}" x2="${W - PAD}" y1="${y(v)}" y2="${y(v)}" stroke="#1E293B" stroke-width="1"/>`).join('')}
                        <line x1="${PAD}" x2="${W - PAD}" y1="${y(80)}" y2="${y(80)}" stroke="#F4C542" stroke-width="1" stroke-dasharray="4 4" opacity=".55"/>
                        <path d="${area}" fill="url(#trendFill)"/>
                        <path d="${line}" fill="none" stroke="#48E5C2" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
                        ${dots}
                    </svg>
                    <p class="text-[.55rem] text-slate-600 mt-1">เส้นประ = เกณฑ์ 80% · จุดแดง = จบด้วย Fatal · เก่า → ใหม่</p>
                </div>`;
    }

    /** Horizontal bar list, used for stage accuracy and the hour histogram. */
    function barRows(items) {
        const top = Math.max(1, ...items.map(i => i.value));
        return `<div class="flex flex-col gap-1.5">
            ${items.map(i => `
                <div class="panel rounded-lg p-2.5 flex items-center gap-3">
                    <span class="text-[.65rem] text-slate-300 w-32 sm:w-44 flex-shrink-0 truncate">${esc(i.label)}</span>
                    <div class="flex-1 h-2 rounded-full bg-navy-700 overflow-hidden">
                        <div class="h-full rounded-full" style="width:${Math.round((i.value / top) * 100)}%; background:${i.color || '#48E5C2'};"></div>
                    </div>
                    <span class="text-[.65rem] font-mono ${i.tone || 'text-slate-400'} flex-shrink-0 w-20 text-right">${esc(i.right)}</span>
                </div>`).join('')}
        </div>`;
    }

    async function renderStatsPanel() {
        const host = byId('stats-body');
        if (!host) return;
        host.innerHTML = loadingBlock('กำลังโหลดสถิติจาก Firestore…');

        const res = await window.DBService.getMyAttempts();
        if (!res.ok || res.rows.length === 0) {
            host.innerHTML = stateBlock(res, 'ยังไม่มีประวัติการเล่น — เล่นเคสให้จบสักครั้งแล้วกลับมาดูใหม่');
            return;
        }

        const s = deriveStats(res.rows);

        // ── Overview ──
        const overview = `
            <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
                ${statCard('Attempts', s.n, 'text-white', `${s.distinctDays} วันที่เล่น`)}
                ${statCard('Best', s.best + '%', 'text-teal-400', `${s.bestScore} คะแนน`)}
                ${statCard('Average', s.avg + '%', 'text-gold-400', `มัธยฐาน ${s.median}%`)}
                ${statCard('Latest', s.latest + '%', s.latest >= s.avg ? 'text-teal-400' : 'text-slate-300',
                           s.latest >= s.avg ? 'สูงกว่าค่าเฉลี่ยตัวเอง' : 'ต่ำกว่าค่าเฉลี่ยตัวเอง')}
                ${statCard('Cases', s.distinctCases, 'text-white', `จบครบด่าน ${s.finishedRuns} ครั้ง`)}
                ${statCard('Fatal', s.fatals, s.fatals ? 'text-acuity-500' : 'text-white', `${s.fatalRate}% ของการเล่น`)}
            </div>
            <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2 mt-2">
                ${statCard('Safe Run', s.safeRun, 'text-teal-400', 'ไม่เจอ Fatal ติดกัน')}
                ${statCard('Streak', s.streakCurrent + ' วัน', 'text-gold-400', `สถิติสูงสุด ${s.streakBest} วัน`)}
                ${statCard('ข้อที่ตอบ', s.hasTelemetry ? s.gradedSteps : '—', 'text-white',
                           s.hasTelemetry ? `ถูกครบข้อ ${s.perfectSteps} ข้อ` : 'ยังไม่มีข้อมูลรายข้อ')}
                ${statCard('ตอบผิดสะสม', s.hasTelemetry ? s.wrongPicks : '—',
                           s.wrongPicks ? 'text-acuity-500' : 'text-white', 'ตัวเลือกที่เลือกผิด')}
                ${statCard('เวลารวม', s.totalSeconds ? fmtDuration(s.totalSeconds) : '—', 'text-white',
                           s.avgSeconds ? `เฉลี่ย ${fmtDuration(s.avgSeconds)}/ครั้ง` : 'ยังไม่มีข้อมูลเวลา')}
                ${statCard('DTP', s.dtpAttempts ? `${s.dtpCorrect}/${s.dtpAttempts}` : '—', 'text-teal-400', 'ระบุปัญหาถูกต้อง')}
            </div>`;

        // ── Stage accuracy ──
        const stageRows = Object.keys(s.byStage).map(id => {
            const st = s.byStage[id];
            const acc = pct(st.earned, st.possible);
            return {
                label: id.replace(/_/g, ' '),
                value: acc,
                right: `${acc}%`,
                color: acc >= 80 ? '#48E5C2' : acc >= 60 ? '#F4C542' : '#FF6B6B',
                tone: acc >= 80 ? 'text-teal-400' : acc >= 60 ? 'text-gold-400' : 'text-acuity-500'
            };
        });

        // ── Weakest steps ──
        const weak = Object.values(s.byStep)
            .map(sp => {
                const lbl = stepLabel(sp.caseId, sp.stepId, allCases);
                const acc = pct(sp.perfect, sp.seen);
                return {
                    label: lbl.retired ? `${sp.stepId} (ข้อที่ถูกยกเลิก)` : lbl.text,
                    value: 100 - acc,
                    right: `${acc}% · ผิด ${sp.misses}`,
                    color: '#FF6B6B',
                    tone: 'text-acuity-500',
                    acc: acc,
                    seen: sp.seen
                };
            })
            .filter(w => w.acc < 100)
            .sort((x, y) => y.value - x.value || y.seen - x.seen)
            .slice(0, 6);

        // ── Time of day ──
        const hourRows = s.hours
            .map((c, h) => ({ h, c }))
            .filter(x => x.c > 0)
            .sort((x, y) => y.c - x.c)
            .slice(0, 6)
            .map(x => ({
                label: `${String(x.h).padStart(2, '0')}:00 – ${String(x.h).padStart(2, '0')}:59`,
                value: x.c,
                right: `${x.c} ครั้ง`,
                color: '#8B7BE8',
                tone: 'text-slate-300'
            }));

        // ── Per-case breakdown ──
        const caseIds = Array.from(new Set(s.rows.map(r => r.caseId)));
        const caseRows = caseIds.map(id => {
            const rs = s.rows.filter(r => r.caseId === id);
            const bp = Math.max(...rs.map(r => r.p));
            return {
                label: id,
                value: bp,
                right: `${rs.length} ครั้ง · ดีสุด ${bp}%`,
                color: bp >= 80 ? '#48E5C2' : '#F4C542',
                tone: bp >= 80 ? 'text-teal-400' : 'text-gold-400'
            };
        });

        const noTelemetryNote = s.hasTelemetry ? '' : `
            <div class="panel rounded-xl p-3 border-gold-400/30 mt-3">
                <p class="text-[.65rem] text-gold-400 font-bold mb-1">ยังไม่มีข้อมูลเชิงลึกรายข้อ</p>
                <p class="text-[.6rem] text-slate-400 leading-relaxed">
                    การวิเคราะห์รายข้อ รายด่าน เวลาที่ใช้ และช่วงเวลาที่เล่น เริ่มเก็บตั้งแต่รุ่นนี้เป็นต้นไป
                    ผลการเล่นเดิมยังนับรวมในคะแนนทุกช่อง แต่ไม่มีข้อมูลรายข้อให้วิเคราะห์ — เล่นอีกครั้งแล้วส่วนนี้จะขึ้นมาเอง
                </p>
            </div>`;

        host.innerHTML = `
            ${overview}
            ${sectionTitle('แนวโน้มคะแนน', `${Math.min(s.chrono.length, 24)} ครั้งล่าสุด`)}
            ${trendChart(s.chrono)}
            ${noTelemetryNote}
            ${stageRows.length ? sectionTitle('ความแม่นยำรายด่าน', 'คะแนนที่ได้ ÷ คะแนนเต็มของด่านนั้น') + barRows(stageRows) : ''}
            ${weak.length ? sectionTitle('ข้อที่ควรทบทวน', 'เรียงจากอัตราตอบถูกครบข้อต่ำสุด') + barRows(weak) : ''}
            ${caseRows.length > 1 ? sectionTitle('แยกตามเคส') + barRows(caseRows) : ''}
            ${hourRows.length ? sectionTitle('ช่วงเวลาที่เล่นบ่อย', 'ตามนาฬิกาเครื่องคุณ') + barRows(hourRows) : ''}
            ${sectionTitle('ประวัติล่าสุด')}
            <div class="flex flex-col gap-1.5">
                ${s.rows.slice(0, 15).map(r => {
                    const when = r.date
                        ? r.date.toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })
                        : '—';
                    return `
                        <div class="panel rounded-lg p-2.5 flex items-center gap-3">
                            <span class="tag-pill !text-[.6rem] flex-shrink-0">${esc(r.caseId || '')}</span>
                            <span class="text-[.65rem] text-slate-500 flex-shrink-0 hidden sm:block">${esc(when)}</span>
                            <span class="text-[.65rem] text-slate-400 ml-auto">${r.completedSteps || 0}/${r.totalSteps || 0} steps</span>
                            ${r.durationSec ? `<span class="text-[.6rem] font-mono text-slate-600 hidden sm:block">${esc(fmtDuration(r.durationSec))}</span>` : ''}
                            ${r.isFatal ? '<span class="tag-pill !bg-acuity-500/12 !text-acuity-500 !border-acuity-500/35 !text-[.58rem]">FATAL</span>' : ''}
                            <span class="text-[.72rem] font-mono font-bold ${r.p >= 85 ? 'text-teal-400' : r.p >= 60 ? 'text-gold-400' : 'text-slate-400'} flex-shrink-0 w-20 text-right">
                                ${r.finalScore}/${r.maxScore}
                            </span>
                        </div>`;
                }).join('')}
            </div>`;
    }

    // ─── Leaderboard ───────────────────────────────────────────
    async function renderLeaderboardPanel() {
        const host = byId('leaderboard-body');
        if (!host) return;
        host.innerHTML = loadingBlock('กำลังจัดอันดับ…');

        const res = await window.DBService.getLeaderboard(20);
        if (!res.ok || res.rows.length === 0) {
            host.innerHTML = stateBlock(res, 'ยังไม่มีผู้เล่นที่ทำคะแนนไว้');
            return;
        }

        const me = window.AuthService.getCurrentUser();
        const medals = ['🥇', '🥈', '🥉'];

        host.innerHTML = `<div class="flex flex-col gap-1.5">
            ${res.rows.map((r, i) => {
                const isMe = me && r.uid === me.uid;
                return `
                    <div class="panel rounded-lg p-2.5 flex items-center gap-3 ${isMe ? '!border-teal-400/50 !bg-teal-400/[.06]' : ''}">
                        <span class="w-7 text-center text-sm flex-shrink-0">${medals[i] || `<span class="text-[.7rem] font-mono text-slate-500">${i + 1}</span>`}</span>
                        <span class="text-xs font-bold ${isMe ? 'text-teal-400' : 'text-white'} truncate flex-1">
                            ${esc(r.displayName)}${isMe ? ' <span class="tag-pill !text-[.55rem] !text-teal-400 !border-teal-400/35">คุณ</span>' : ''}
                        </span>
                        <span class="tag-pill !text-[.58rem] hidden sm:inline-flex flex-shrink-0">${esc(r.caseId || '')}</span>
                        <span class="text-[.72rem] font-mono font-bold text-gold-400 flex-shrink-0">${Math.round(r.pct * 100)}%</span>
                        <span class="text-[.65rem] font-mono text-slate-500 flex-shrink-0 w-16 text-right">${r.finalScore}</span>
                    </div>`;
            }).join('')}
        </div>`;
    }

    // ─── Achievements ──────────────────────────────────────────
    // Every badge is a predicate over deriveStats() — the same numbers the
    // My Stats dashboard shows, so a badge can never claim something the
    // dashboard contradicts.
    //
    //   cat   grouping header
    //   test  s => bool, the unlock condition
    //   prog  s => [current, target] for the "almost there" bar (optional).
    //         Only for badges that count towards a threshold; a badge with
    //         nothing meaningful to count simply omits it.
    //
    // Badges marked `tele` need per-step telemetry, which only exists on
    // attempts recorded from build 2026-08-05 onward. They stay locked on
    // older history rather than unlocking on a zero.

    const AC_CATS = {
        volume:   { name: 'ก้าวแรกและความต่อเนื่อง', icon: '🚀' },
        accuracy: { name: 'ความแม่นยำ',              icon: '🎯' },
        safety:   { name: 'ความปลอดภัยผู้ป่วย',       icon: '🛡' },
        mastery:  { name: 'ความเชี่ยวชาญรายข้อ',      icon: '🧠' },
        habit:    { name: 'วินัยและเวลา',             icon: '⏱' },
        growth:   { name: 'การพัฒนาตนเอง',           icon: '📈' }
    };

    const ACHIEVEMENTS = [
        // ── ก้าวแรกและความต่อเนื่อง ──
        { id: 'first',     cat: 'volume', icon: '🩺', name: 'First Case',        desc: 'เล่นจบเคสแรก',                   test: s => s.n >= 1,  prog: s => [s.n, 1] },
        { id: 'v3',        cat: 'volume', icon: '📋', name: 'Ward Round',        desc: 'เล่นสะสม 3 ครั้ง',                test: s => s.n >= 3,  prog: s => [s.n, 3] },
        { id: 'v5',        cat: 'volume', icon: '🔥', name: 'Marathon',          desc: 'เล่นสะสม 5 ครั้ง',                test: s => s.n >= 5,  prog: s => [s.n, 5] },
        { id: 'v10',       cat: 'volume', icon: '💪', name: 'Resident',          desc: 'เล่นสะสม 10 ครั้ง',               test: s => s.n >= 10, prog: s => [s.n, 10] },
        { id: 'v20',       cat: 'volume', icon: '🏥', name: 'Chief Resident',    desc: 'เล่นสะสม 20 ครั้ง',               test: s => s.n >= 20, prog: s => [s.n, 20] },
        { id: 'v35',       cat: 'volume', icon: '🎓', name: 'Senior Clinician',  desc: 'เล่นสะสม 35 ครั้ง',               test: s => s.n >= 35, prog: s => [s.n, 35] },
        { id: 'v50',       cat: 'volume', icon: '👑', name: 'Attending',         desc: 'เล่นสะสม 50 ครั้ง',               test: s => s.n >= 50, prog: s => [s.n, 50] },
        { id: 'd3',        cat: 'volume', icon: '📆', name: 'Three Days In',     desc: 'เล่นใน 3 วันที่ต่างกัน',           test: s => s.distinctDays >= 3,  prog: s => [s.distinctDays, 3] },
        { id: 'd7',        cat: 'volume', icon: '🗓', name: 'Weekly Rotation',   desc: 'เล่นใน 7 วันที่ต่างกัน',           test: s => s.distinctDays >= 7,  prog: s => [s.distinctDays, 7] },
        { id: 'd14',       cat: 'volume', icon: '📅', name: 'Full Rotation',     desc: 'เล่นใน 14 วันที่ต่างกัน',          test: s => s.distinctDays >= 14, prog: s => [s.distinctDays, 14] },

        // ── ความแม่นยำ ──
        { id: 'a50',       cat: 'accuracy', icon: '🌱', name: 'Passing Grade',    desc: 'ทำคะแนนถึง 50%',              test: s => s.best >= 50,  prog: s => [s.best, 50] },
        { id: 'a70',       cat: 'accuracy', icon: '📘', name: 'Proficient',       desc: 'ทำคะแนนถึง 70%',              test: s => s.best >= 70,  prog: s => [s.best, 70] },
        { id: 'a80',       cat: 'accuracy', icon: '🎯', name: 'Sharp Shooter',    desc: 'ทำคะแนนถึง 80%',              test: s => s.best >= 80,  prog: s => [s.best, 80] },
        { id: 'a85',       cat: 'accuracy', icon: '⭐', name: 'Distinction',      desc: 'ทำคะแนนถึง 85%',              test: s => s.best >= 85,  prog: s => [s.best, 85] },
        { id: 'a90',       cat: 'accuracy', icon: '🌟', name: 'Honours',          desc: 'ทำคะแนนถึง 90%',              test: s => s.best >= 90,  prog: s => [s.best, 90] },
        { id: 'a95',       cat: 'accuracy', icon: '💎', name: 'Near Perfect',     desc: 'ทำคะแนนถึง 95%',              test: s => s.best >= 95,  prog: s => [s.best, 95] },
        { id: 'a100',      cat: 'accuracy', icon: '💯', name: 'Perfect Score',    desc: 'ทำคะแนนเต็มโดยไม่เจอ Fatal',    test: s => s.rows.some(r => !r.isFatal && r.maxScore > 0 && r.finalScore === r.maxScore) },
        { id: 'avg70',     cat: 'accuracy', icon: '📊', name: 'Consistent',       desc: 'คะแนนเฉลี่ยสะสมถึง 70%',        test: s => s.n >= 3 && s.avg >= 70, prog: s => [s.avg, 70] },
        { id: 'avg85',     cat: 'accuracy', icon: '🏆', name: 'Reliably Excellent', desc: 'คะแนนเฉลี่ยสะสมถึง 85% (อย่างน้อย 5 ครั้ง)', test: s => s.n >= 5 && s.avg >= 85, prog: s => [s.avg, 85] },

        // ── ความปลอดภัยผู้ป่วย ──
        { id: 'clean1',    cat: 'safety', icon: '✅', name: 'No Harm Done',       desc: 'เล่นจบโดยไม่เจอ Fatal 1 ครั้ง',   test: s => s.cleanRuns >= 1,  prog: s => [s.cleanRuns, 1] },
        { id: 'safe3',     cat: 'safety', icon: '🛡', name: 'Do No Harm',         desc: 'ไม่เจอ Fatal ติดต่อกัน 3 ครั้ง',   test: s => s.safeRun >= 3,   prog: s => [s.safeRun, 3] },
        { id: 'safe5',     cat: 'safety', icon: '🩹', name: 'Steady Hands',       desc: 'ไม่เจอ Fatal ติดต่อกัน 5 ครั้ง',   test: s => s.safeRun >= 5,   prog: s => [s.safeRun, 5] },
        { id: 'safe10',    cat: 'safety', icon: '🕊', name: 'Safety Culture',     desc: 'ไม่เจอ Fatal ติดต่อกัน 10 ครั้ง',  test: s => s.safeRun >= 10,  prog: s => [s.safeRun, 10] },
        { id: 'safe20',    cat: 'safety', icon: '🏅', name: 'Zero Harm Streak',   desc: 'ไม่เจอ Fatal ติดต่อกัน 20 ครั้ง',  test: s => s.safeRun >= 20,  prog: s => [s.safeRun, 20] },
        { id: 'nofatal10', cat: 'safety', icon: '🧿', name: 'Spotless Record',    desc: 'เล่น 10 ครั้งโดยไม่เคยเจอ Fatal เลย', test: s => s.n >= 10 && s.fatals === 0, prog: s => [s.fatals === 0 ? s.n : 0, 10] },
        { id: 'fin5',      cat: 'safety', icon: '🏁', name: 'Full Workup',        desc: 'เล่นจบครบทุกสถานี 5 ครั้ง',       test: s => s.finishedRuns >= 5,  prog: s => [s.finishedRuns, 5] },
        { id: 'fin15',     cat: 'safety', icon: '🗿', name: 'Complete Clinician', desc: 'เล่นจบครบทุกสถานี 15 ครั้ง',      test: s => s.finishedRuns >= 15, prog: s => [s.finishedRuns, 15] },

        // ── ความเชี่ยวชาญรายข้อ (ต้องใช้ข้อมูลรายข้อ) ──
        { id: 'p1',        cat: 'mastery', tele: true, icon: '🎖', name: 'First Perfect Step', desc: 'ตอบถูกครบทุกตัวเลือกใน 1 ข้อ',  test: s => s.perfectSteps >= 1,   prog: s => [s.perfectSteps, 1] },
        { id: 'p25',       cat: 'mastery', tele: true, icon: '🧩', name: 'Pattern Recognition', desc: 'ตอบถูกครบข้อสะสม 25 ข้อ',      test: s => s.perfectSteps >= 25,  prog: s => [s.perfectSteps, 25] },
        { id: 'p100',      cat: 'mastery', tele: true, icon: '🧠', name: 'Clinical Reasoning',  desc: 'ตอบถูกครบข้อสะสม 100 ข้อ',     test: s => s.perfectSteps >= 100, prog: s => [s.perfectSteps, 100] },
        { id: 'p250',      cat: 'mastery', tele: true, icon: '🦉', name: 'Deep Knowledge',      desc: 'ตอบถูกครบข้อสะสม 250 ข้อ',     test: s => s.perfectSteps >= 250, prog: s => [s.perfectSteps, 250] },
        { id: 'st5',       cat: 'mastery', tele: true, icon: '⚡', name: 'On a Roll',           desc: 'ตอบถูกครบข้อติดกัน 5 ข้อ',      test: s => s.bestStepStreak >= 5,  prog: s => [s.bestStepStreak, 5] },
        { id: 'st10',      cat: 'mastery', tele: true, icon: '🌀', name: 'In the Zone',         desc: 'ตอบถูกครบข้อติดกัน 10 ข้อ',     test: s => s.bestStepStreak >= 10, prog: s => [s.bestStepStreak, 10] },
        { id: 'st13',      cat: 'mastery', tele: true, icon: '🔱', name: 'Unbroken Chain',      desc: 'ตอบถูกครบข้อติดกัน 13 ข้อ',     test: s => s.bestStepStreak >= 13, prog: s => [s.bestStepStreak, 13] },
        { id: 'flaw1',     cat: 'mastery', tele: true, icon: '🕯', name: 'Flawless Run',        desc: 'เล่นจบ 1 ครั้งโดยถูกครบทุกข้อ',  test: s => s.flawlessRuns >= 1, prog: s => [s.flawlessRuns, 1] },
        { id: 'flaw3',     cat: 'mastery', tele: true, icon: '👑', name: 'Triple Flawless',     desc: 'เล่นจบแบบถูกครบทุกข้อ 3 ครั้ง',  test: s => s.flawlessRuns >= 3, prog: s => [s.flawlessRuns, 3] },
        { id: 'g500',      cat: 'mastery', tele: true, icon: '📚', name: 'Five Hundred Calls',  desc: 'ตอบคำถามสะสม 500 ข้อ',        test: s => s.gradedSteps >= 500, prog: s => [s.gradedSteps, 500] },

        // ── วินัยและเวลา ──
        { id: 'sc2',       cat: 'habit', icon: '🔥', name: 'Back Tomorrow',   desc: 'เล่นต่อเนื่อง 2 วันติด',            test: s => s.streakBest >= 2,  prog: s => [s.streakBest, 2] },
        { id: 'sc3',       cat: 'habit', icon: '🔥', name: 'Three Day Streak', desc: 'เล่นต่อเนื่อง 3 วันติด',           test: s => s.streakBest >= 3,  prog: s => [s.streakBest, 3] },
        { id: 'sc7',       cat: 'habit', icon: '🌤', name: 'Seven Day Streak', desc: 'เล่นต่อเนื่อง 7 วันติด',           test: s => s.streakBest >= 7,  prog: s => [s.streakBest, 7] },
        { id: 'sc14',      cat: 'habit', icon: '🌗', name: 'Fortnight',        desc: 'เล่นต่อเนื่อง 14 วันติด',          test: s => s.streakBest >= 14, prog: s => [s.streakBest, 14] },
        { id: 'sc30',      cat: 'habit', icon: '🌕', name: 'Month of Rounds',  desc: 'เล่นต่อเนื่อง 30 วันติด',          test: s => s.streakBest >= 30, prog: s => [s.streakBest, 30] },
        { id: 't1h',       cat: 'habit', tele: true, icon: '⏱', name: 'One Hour In',  desc: 'ใช้เวลาฝึกสะสมครบ 1 ชั่วโมง', test: s => s.totalSeconds >= 3600, prog: s => [Math.round(s.totalSeconds / 60), 60] },
        { id: 'night',     cat: 'habit', tele: true, icon: '🦇', name: 'Night Shift',  desc: 'เล่นในช่วง 00:00–04:59',     test: s => s.hours.slice(0, 5).some(c => c > 0) },

        // ── การพัฒนาตนเอง ──
        { id: 'imp2',      cat: 'growth', icon: '📈', name: 'Getting Better',   desc: 'ทำคะแนนดีขึ้นติดกัน 2 ครั้ง',      test: s => s.bestImprovementRun >= 2, prog: s => [s.bestImprovementRun, 2] },
        { id: 'imp4',      cat: 'growth', icon: '🚀', name: 'Steep Curve',      desc: 'ทำคะแนนดีขึ้นติดกัน 4 ครั้ง',      test: s => s.bestImprovementRun >= 4, prog: s => [s.bestImprovementRun, 4] },
        { id: 'comeback',  cat: 'growth', icon: '🔄', name: 'Comeback',         desc: 'เคยได้ต่ำกว่า 50% แล้วกลับมาได้ถึง 80%', test: s => s.comeback },
        { id: 'explorer',  cat: 'growth', icon: '🗺', name: 'Case Explorer',    desc: 'เล่นครบ 2 เคสที่ต่างกัน',          test: s => s.distinctCases >= 2, prog: s => [s.distinctCases, 2] },
        { id: 'dtp1',      cat: 'growth', icon: '🔍', name: 'DTP Spotter',      desc: 'ระบุ Drug Therapy Problem ถูกต้อง 1 ครั้ง', test: s => s.dtpCorrect >= 1, prog: s => [s.dtpCorrect, 1] },
        { id: 'dtp3',      cat: 'growth', icon: '💊', name: 'DTP Specialist',   desc: 'ระบุ Drug Therapy Problem ถูกต้อง 3 ครั้ง', test: s => s.dtpCorrect >= 3, prog: s => [s.dtpCorrect, 3] }
    ];

    function achievementCard(a, s, on) {
        // The "almost there" bar. Shown only while locked and only once the
        // learner is actually on the board — a 0% bar tells them nothing.
        let bar = '';
        if (!on && typeof a.prog === 'function') {
            const [cur, target] = a.prog(s);
            if (cur > 0 && target > 0) {
                bar = `<div class="mt-1.5 flex items-center gap-2">
                           <div class="flex-1 h-1 rounded-full bg-navy-700 overflow-hidden">
                               <div class="h-full rounded-full bg-slate-500" style="width:${Math.min(100, Math.round((cur / target) * 100))}%"></div>
                           </div>
                           <span class="text-[.5rem] font-mono text-slate-600 flex-shrink-0">${cur}/${target}</span>
                       </div>`;
            }
        }
        const needsData = !on && a.tele && !s.hasTelemetry;
        return `
            <div class="panel rounded-xl p-3 flex items-start gap-3 ${on ? '!border-gold-400/40' : 'opacity-60'}">
                <div class="w-10 h-10 rounded-xl grid place-items-center text-xl flex-shrink-0
                            ${on ? 'bg-gold-400/15 border border-gold-400/40' : 'bg-navy-700 border border-navy-600 grayscale'}">
                    ${on ? a.icon : '🔒'}
                </div>
                <div class="min-w-0 flex-1">
                    <p class="text-xs font-bold ${on ? 'text-white' : 'text-slate-500'} truncate">${esc(a.name)}</p>
                    <p class="text-[.65rem] text-slate-500 leading-snug">${esc(a.desc)}</p>
                    ${needsData ? '<p class="text-[.5rem] text-slate-600 mt-1">ต้องใช้ข้อมูลรายข้อ — เริ่มเก็บตั้งแต่รุ่นนี้</p>' : bar}
                </div>
            </div>`;
    }

    async function renderAchievementsPanel() {
        const host = byId('achievements-body');
        if (!host) return;
        host.innerHTML = loadingBlock('กำลังตรวจสอบความสำเร็จ…');

        const res = await window.DBService.getMyAttempts();
        if (!res.ok) {
            host.innerHTML = stateBlock(res, '');
            return;
        }

        const s = deriveStats(res.rows);
        const state = ACHIEVEMENTS.map(a => ({ a: a, on: Boolean(a.test(s)) }));
        const unlocked = state.filter(x => x.on).length;

        const groups = Object.keys(AC_CATS).map(cat => {
            const items = state.filter(x => x.a.cat === cat);
            const got = items.filter(x => x.on).length;
            return `
                ${sectionTitle(`${AC_CATS[cat].icon} ${AC_CATS[cat].name}`, `${got}/${items.length}`)}
                <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                    ${items.map(x => achievementCard(x.a, s, x.on)).join('')}
                </div>`;
        }).join('');

        host.innerHTML = `
            <div class="panel rounded-xl p-3 flex items-center gap-3">
                <span class="text-[.6rem] font-bold tracking-widest text-slate-500 uppercase flex-shrink-0">Unlocked</span>
                <div class="flex-1 h-2 rounded-full bg-navy-700 overflow-hidden">
                    <div class="h-full rounded-full transition-all duration-500"
                         style="width:${pct(unlocked, ACHIEVEMENTS.length)}%; background:linear-gradient(90deg,#48E5C2,#17A98A);"></div>
                </div>
                <span class="text-xs font-mono font-bold text-teal-400 flex-shrink-0">${unlocked}/${ACHIEVEMENTS.length}</span>
            </div>
            ${groups}`;
    }

    // ═══ INSTRUCTOR ANALYTICS ══════════════════════════════════
    // Cohort-level pedagogy, not grading. Every number here is derived
    // from real attempts; when the read fails the panel says why rather
    // than showing a plausible-looking zero.

    /** Human-readable label for a step id, using the loaded case files. */
    /**
     * Resolves a stored step id to its question text.
     *
     * Returns `retired: true` when the id is not in the case any more. That
     * happens whenever a case is re-authored: old attempts in Firestore still
     * reference step ids that no longer exist, and silently printing the raw id
     * made the panel look broken. Retired rows are labelled, not hidden — the
     * attempts were real, they just measure a version of the case that is gone.
     */
    function stepLabel(caseId, stepId, cases) {
        const c = (cases || []).find(x => x.case_id === caseId);
        if (c) {
            for (const stage of Object.values(c.stages || {})) {
                const s = (stage.steps || {})[stepId];
                if (s && s.question) {
                    const q = s.question.split(':')[0].trim();
                    return { text: q.length > 64 ? q.slice(0, 64) + '…' : q, retired: false };
                }
            }
        }
        return {
            text: stepId.replace(/^step_\d+_/, '').replace(/_/g, ' '),
            retired: true
        };
    }

    async function renderInstructorPanel() {
        const host = byId('instructor-body');
        if (!host) return;
        host.innerHTML = loadingBlock('กำลังรวบรวมข้อมูลของนักศึกษา…');

        const result = await window.DBService.getAllAttempts(1000);
        if (!result.ok || result.rows.length === 0) {
            host.innerHTML = stateBlock(result, 'ยังไม่มีการส่งผลจากนักศึกษา');
            return;
        }

        const rows = result.rows;
        const total = rows.length;

        // Pass = finished without a fatal error and scored at least 60%.
        const passed = rows.filter(r => !r.isFatal && pct(r.finalScore, r.maxScore) >= 60).length;
        const fatal  = rows.filter(r => r.isFatal).length;
        const avg    = Math.round(rows.reduce((s, r) => s + pct(r.finalScore, r.maxScore), 0) / total);

        // ── Most-missed steps ──────────────────────────────────
        // A step counts as "missed" for an attempt if that attempt logged
        // at least one wrong choice on it. Counting attempts rather than
        // wrong clicks stops multi-select steps from dominating the chart.
        const missed = {};
        rows.forEach(r => {
            Object.keys(r.mistakeHistory || {}).forEach(stepId => {
                const picks = r.mistakeHistory[stepId];
                if (!Array.isArray(picks) || picks.length === 0) return;
                const key = r.caseId + '::' + stepId;
                missed[key] = (missed[key] || 0) + 1;
            });
        });

        const chart = Object.keys(missed)
            .map(key => {
                const [caseId, stepId] = key.split('::');
                const lbl = stepLabel(caseId, stepId, allCases);
                return {
                    caseId, stepId,
                    label: lbl.text,
                    retired: lbl.retired,
                    count: missed[key],
                    rate: pct(missed[key], total)
                };
            })
            .sort((a, b) => b.rate - a.rate)
            .slice(0, 10);

        const retiredCount = chart.filter(i => i.retired).length;

        // ── DTP classification accuracy ────────────────────────
        const tagged = rows.filter(r => r.dtpTag != null);
        const dtpCounts = {};
        tagged.forEach(r => { dtpCounts[r.dtpTag] = (dtpCounts[r.dtpTag] || 0) + 1; });
        const dtpCorrect = tagged.filter(r => r.dtpCorrect === true).length;

        const stat = (label, value, suffix, tone) => `
            <div class="panel rounded-2xl p-3.5">
                <p class="text-[.58rem] font-bold tracking-widest text-slate-500 uppercase mb-1">${label}</p>
                <p class="text-2xl font-extrabold ${tone || 'text-white'} leading-none">
                    ${value}<span class="text-xs font-bold text-slate-500 ml-0.5">${suffix || ''}</span>
                </p>
            </div>`;

        const bar = (item, tone) => `
            <div class="mb-2.5 ${item.retired ? 'opacity-60' : ''}">
                <div class="flex items-baseline justify-between gap-2 mb-1">
                    <p class="text-[.7rem] font-semibold text-slate-200 truncate">
                        ${esc(item.label)}
                        ${item.retired ? '<span class="ml-1 text-[.55rem] font-bold text-gold-400 align-middle">· ขั้นตอนเก่า</span>' : ''}
                    </p>
                    <p class="text-[.66rem] font-mono font-bold ${tone} flex-shrink-0">${item.rate}%
                        <span class="text-slate-600 font-sans font-normal">(${item.count}/${total})</span></p>
                </div>
                <div class="h-1.5 rounded-full bg-navy-700/70 overflow-hidden">
                    <div class="h-full rounded-full ${item.retired ? 'bg-navy-500' : item.rate >= 50 ? 'bg-acuity-500' : item.rate >= 25 ? 'bg-gold-400' : 'bg-teal-400'}"
                         style="width:${Math.max(item.rate, 2)}%"></div>
                </div>
                <p class="text-[.55rem] text-slate-600 mt-0.5 font-mono">${esc(item.caseId)} · ${esc(item.stepId)}</p>
            </div>`;

        // Percentages from a handful of attempts are arithmetically right but
        // read as broken (one student who slipped on a step shows as "100%").
        // Say so rather than letting the reader assume the panel is faulty.
        const sampleNote = total < 5 ? `
            <div class="rounded-xl border border-gold-400/35 bg-gold-400/[.07] px-3 py-2 mb-4 flex items-start gap-2">
                <span class="text-gold-400 text-[.7rem] leading-none mt-0.5">ⓘ</span>
                <p class="text-[.66rem] text-slate-300 leading-relaxed">
                    ขนาดตัวอย่างเล็กมาก (${total} ครั้ง) — ค่าร้อยละยังไม่มีความหมายทางสถิติ
                    ผู้เรียนคนเดียวที่ตอบผิดหนึ่งข้อจะแสดงเป็น 100% ให้ดูจำนวนครั้งในวงเล็บแทน
                </p>
            </div>` : '';

        const retiredNote = retiredCount > 0 ? `
            <div class="rounded-xl border border-navy-600/70 bg-navy-800/50 px-3 py-2 mb-4 flex items-start gap-2">
                <span class="text-slate-400 text-[.7rem] leading-none mt-0.5">⚑</span>
                <p class="text-[.66rem] text-slate-400 leading-relaxed">
                    มี ${retiredCount} ขั้นตอนที่ไม่มีอยู่ในเคสฉบับปัจจุบันแล้ว — เป็นผลจากการส่งก่อนที่เคสจะถูกปรับปรุงใหม่
                    ข้อมูลนี้ยังถูกต้อง แต่วัดเนื้อหาคนละฉบับกับที่นักศึกษาเล่นอยู่ตอนนี้
                </p>
            </div>` : '';

        host.innerHTML = `
            <div class="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-4">
                ${stat('Submissions', total, '', 'text-white')}
                ${stat('Pass Rate', pct(passed, total), '%', pct(passed, total) >= 60 ? 'text-teal-400' : 'text-gold-400')}
                ${stat('Average Score', avg, '%', 'text-white')}
                ${stat('Fatal Errors', pct(fatal, total), '%', fatal > 0 ? 'text-acuity-500' : 'text-teal-400')}
            </div>

            ${sampleNote}
            ${retiredNote}

            <div class="panel rounded-2xl p-4 mb-4">
                <div class="flex items-baseline justify-between mb-3">
                    <h3 class="text-xs font-extrabold text-white">Most Common Clinical Mistakes</h3>
                    <p class="text-[.6rem] text-slate-500">% ของนักศึกษาที่ตอบผิดในขั้นตอนนั้น</p>
                </div>
                ${chart.length
                    ? chart.map(i => bar(i, 'text-slate-300')).join('')
                    : '<p class="text-[.72rem] text-slate-500">ยังไม่พบข้อผิดพลาดที่บันทึกไว้</p>'}
            </div>

            <div class="panel rounded-2xl p-4">
                <div class="flex items-baseline justify-between mb-3">
                    <h3 class="text-xs font-extrabold text-white">DTP Classification</h3>
                    <p class="text-[.6rem] text-slate-500">${tagged.length} attempt(s) ที่ติดแท็ก</p>
                </div>
                ${tagged.length === 0
                    ? `<p class="text-[.72rem] text-slate-500 leading-relaxed">
                           ยังไม่มีข้อมูลการจำแนก DTP — ข้อมูลจะเริ่มเก็บจากการส่งผลครั้งถัดไป
                       </p>`
                    : `<p class="text-[.72rem] text-slate-300 mb-3">
                           จำแนกถูกต้อง <strong class="text-teal-400">${pct(dtpCorrect, tagged.length)}%</strong>
                           (${dtpCorrect}/${tagged.length})
                       </p>
                       ${DTP_CATEGORIES.map(c => {
                           const n = dtpCounts[c.id] || 0;
                           return bar({
                               label: `${c.id}. ${c.short}`,
                               caseId: c.th, stepId: '',
                               count: n, rate: pct(n, tagged.length)
                           }, 'text-slate-300');
                       }).join('')}`}
            </div>`;
    }

    function initPanelNav() {
        document.querySelectorAll('[data-panel]').forEach(el => {
            el.addEventListener('click', () => switchPanel(el.dataset.panel));
        });
        document.querySelectorAll('.refresh-btn').forEach(btn => {
            btn.addEventListener('click', () => switchPanel(btn.dataset.refresh));
        });
    }

    // ─── Pause ─────────────────────────────────────────────────
    function setPaused(value) {
        if (!gameArea) return;
        gameArea.style.opacity = value ? '.3' : '1';
        gameArea.style.pointerEvents = value ? 'none' : 'auto';
        const dock = document.querySelector('.submit-dock');
        if (dock) {
            dock.style.opacity = value ? '.3' : '1';
            dock.style.pointerEvents = value ? 'none' : 'auto';
        }
    }

    // ═══ SCAN-TO-OPEN QR ═══════════════════════════════════════

    /**
     * The address a scanned code should land on. Hard-coded rather than read
     * from location.href on purpose: the same bundle is opened from
     * localhost during development and from a file:// copy on a lecturer's
     * laptop, and a QR pointing at either of those is useless to a student
     * holding a phone. The URL is printed under the code so anyone can
     * check that the two agree.
     */
    const PUBLIC_URL = 'https://sirasitragtong-cmd.github.io/Clinical-case-simulator/';

    /**
     * Paints every .qr-card placeholder. Called once at startup — the cards
     * live in the persistent shell, not in per-step markup, so they survive
     * every stage and panel change without being re-rendered.
     */
    function renderQRCards() {
        const cards = document.querySelectorAll('.qr-card');
        if (!cards.length) return;

        let svg = null;
        try {
            if (window.QRCode) {
                svg = window.QRCode.toSVG(PUBLIC_URL, {
                    dark: '#0B1220',
                    light: '#FFFFFF',
                    label: 'QR code สำหรับเปิด Clinical Case Simulator'
                });
            }
        } catch (err) {
            console.error('[QR] encode failed:', err);
        }

        cards.forEach(card => {
            const small = card.dataset.qrSize === 'sm';

            // No fabricated placeholder image: if encoding failed the card
            // says so and still shows the address, which is the part that
            // actually matters.
            if (!svg) {
                card.innerHTML = `
                    <p class="text-[.6rem] font-bold tracking-widest text-slate-500 uppercase mb-1">Scan to open</p>
                    <p class="text-[.62rem] text-slate-400 leading-relaxed">
                        สร้าง QR ไม่สำเร็จ — เปิดผ่านลิงก์นี้แทนได้
                    </p>
                    <p class="text-[.58rem] font-mono text-teal-400 break-all mt-1">${esc(PUBLIC_URL)}</p>`;
                return;
            }

            card.innerHTML = `
                <p class="text-[.6rem] font-bold tracking-widest text-slate-500 uppercase mb-2">Scan to open</p>
                <div class="mx-auto rounded-lg bg-white p-1.5 ${small ? 'max-w-[7.5rem]' : 'max-w-[9.5rem]'}">${svg}</div>
                <p class="text-[.62rem] text-slate-400 leading-relaxed text-center mt-2">
                    สแกนเพื่อเปิดเว็บนี้บนมือถือ
                </p>
                <p class="text-[.55rem] font-mono text-slate-600 break-all text-center mt-1">${esc(PUBLIC_URL)}</p>`;
        });
    }

    initEventListeners();
    renderQRCards();

    return {
        boot,
        navigateTo: switchView,
        showDashboard: function() { switchView('dashboard'); },

        renderInfo: renderInfoStep,
        renderMCQ: renderMCQStep,
        renderMCQMulti,
        showFeedback: renderFeedback,
        showMultiFeedback,
        renderGameOver,
        renderSummary,

        renderCaseHeader,
        renderVitals,
        renderPatientChart,
        renderNarrative,
        buildStepDots,
        syncStepDots,
        syncDecisionHeader,
        setPaused,

        renderCaseMap,
        openDrawer,
        closeDrawer,

        switchPanel,
        setPatientReaction,
        setPatientHealth,
        getPatientHealth: () => patientHealth,

        // Daily practice streak
        renderStreakCard,
        markStreakActive,
        getStreak: loadStreak,

        // Pharmacy tooling
        calcCockcroftGault,
        DTP_CATEGORIES,
        // The DTP the student tagged this run, for the Firestore payload.
        getDTPTag: () => dtpLastTag,
        resetDTPTag: function() {
            dtpLastTag = null; dtpSelection = null; dtpRequired = false;
            // A replay must re-lock the monitoring framework, otherwise the
            // second run starts with the answer key already open.
            monitoringUnlocked = false;
            soapTab = 'subjective';
            syncSoapTabs();
        },
        renderInstructorPanel
    };
})();

if (typeof window !== 'undefined') {
    window.UIController = UIController;
}
