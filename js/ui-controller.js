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

        const html = vitals.map(v => {
            const isCrit = v.severity === 'critical';
            const isWarn = v.severity === 'warning';
            const color  = isCrit ? 'text-acuity-500' : isWarn ? 'text-gold-400' : 'text-teal-400';
            return `
                <div class="bg-navy-850 px-1.5 py-1.5 text-center">
                    <p class="text-[.52rem] font-bold tracking-wider text-slate-500 uppercase truncate">${esc(v.label)}</p>
                    <p class="text-[.82rem] font-mono font-bold text-white leading-tight truncate">${esc(v.value)}</p>
                    <p class="text-[.5rem] font-semibold ${color} truncate">${isCrit ? '▲' : ''}${esc(v.flag)}</p>
                </div>`;
        }).join('');

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

    // ─── CPG block ─────────────────────────────────────────────
    function renderCPGBlock(cpg) {
        if (!cpg || !Array.isArray(cpg.rows) || cpg.rows.length === 0) {
            return `<p class="text-[.7rem] text-slate-500 leading-relaxed">
                        เคสนี้ยังไม่มีข้อมูลแนวทางเวชปฏิบัติ — เพิ่มฟิลด์
                        <code class="text-teal-400">cpg</code> ใน case JSON เพื่อแสดงที่นี่
                    </p>`;
        }

        const cols = cpg.columns || [];
        const blocks = cpg.rows.map(row => {
            const cells = (row.values || []).map((v, i) => `
                <div class="rounded-lg p-2 ${i === 0
                    ? 'bg-teal-400/[.07] border border-teal-400/25'
                    : 'bg-navy-800/60 border border-navy-700/50'}">
                    <p class="text-[.55rem] font-bold uppercase tracking-wide mb-0.5 ${i === 0 ? 'text-teal-400' : 'text-slate-500'}">
                        ${esc(cols[i] || '—')}
                    </p>
                    <p class="text-[.68rem] leading-relaxed ${i === 0 ? 'text-slate-200' : 'text-slate-400'}">${esc(v)}</p>
                </div>`).join('');
            return `
                <div>
                    <p class="text-[.6rem] font-bold tracking-widest text-slate-500 uppercase mb-1.5">${esc(row.label)}</p>
                    <div class="flex flex-col gap-1.5">${cells}</div>
                </div>`;
        }).join('');

        return `
            <div class="space-y-3">
                <div>
                    <p class="text-xs font-extrabold text-white">${esc(cpg.title || 'CPG')}</p>
                    ${cpg.note ? `<p class="text-[.62rem] text-slate-500 mt-0.5 leading-relaxed">${esc(cpg.note)}</p>` : ''}
                </div>
                ${blocks}
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
            html = contentBlock(infoSteps[1], 'ไม่มีข้อมูล Objective');
        } else {
            html = renderCPGBlock(data.cpg);
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

            if (state.currentStepId) {
                const st = (s || { steps: {} }).steps[state.currentStepId];
                setText('decision-points-chip', `⚡ ${(st && st.point_value) || 0}`);
            }
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
        const limit = stepData.select_count || 1;
        const per   = stepData.point_per_correct
            || Math.round((stepData.point_value || 0) / Math.max(limit, 1));

        multiSelection = new Set();
        multiLimit     = limit;
        multiPerPoint  = per;

        const choices = (stepData.choices || []).map(c => `
            <button class="choice-btn choice-multi" data-choice-id="${esc(c.id)}" aria-pressed="false">
                <span class="choice-box" aria-hidden="true"></span>
                <span class="choice-key">${esc(c.id)}</span>
                <span class="flex-1">${esc(c.text)}</span>
                <span class="text-[.62rem] font-bold text-gold-400 flex-shrink-0 mt-0.5">+${per}</span>
            </button>`).join('');

        gameArea.innerHTML = `
            <div class="animate-fade-in flex flex-col gap-3">
                <div>
                    <p class="text-[.6rem] font-bold tracking-widest text-teal-400 uppercase mb-1.5">Clinical Decision</p>
                    <h3 class="text-sm font-bold text-white leading-relaxed">${esc(stepData.question)}</h3>
                    <p class="text-[.68rem] text-teal-400/90 mt-1.5">
                        ⓘ เลือก <strong>${limit}</strong> ข้อ — Partial Credit Enabled
                    </p>
                </div>

                <div class="flex flex-col gap-2">${choices}</div>
                <div id="feedback-area"></div>

                <div class="submit-dock">
                    <div class="flex items-center justify-between text-[.7rem] mb-2">
                        <span class="text-slate-400"><strong id="multi-count" class="text-white">0</strong> / ${limit} selected</span>
                        <span class="text-slate-400">Est. <strong id="multi-est" class="text-gold-400">+0</strong> pts</span>
                    </div>
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
            if (multiSelection.size >= multiLimit) {
                const counter = byId('multi-count');
                if (counter) {
                    counter.classList.add('text-acuity-500');
                    setTimeout(() => counter.classList.remove('text-acuity-500'), 450);
                }
                return;
            }
            multiSelection.add(id);
            btn.classList.add('is-selected');
            btn.setAttribute('aria-pressed', 'true');
        }

        setText('multi-count', multiSelection.size);
        setText('multi-est', '+' + (multiSelection.size * multiPerPoint));

        const submit = document.querySelector('.submit-decision-btn');
        if (submit) {
            submit.disabled = multiSelection.size === 0;
            submit.textContent = multiSelection.size === multiLimit
                ? 'Submit Clinical Decision ✓'
                : `Submit Clinical Decision (${multiSelection.size}/${multiLimit})`;
        }
    }

    // ─── Render: Feedback (single answer) ──────────────────────
    function renderFeedback(isCorrect, feedbackMessage) {
        const feedbackArea = byId('feedback-area');
        if (!feedbackArea) return;

        document.querySelectorAll('.choice-btn').forEach(btn => { btn.disabled = true; });

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
                </p>
                <p class="text-[.72rem] text-slate-300 leading-relaxed">${esc(result.message || '')}</p>
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

    // ─── Campaign: journey map ─────────────────────────────────
    // Stage names never reveal the diagnosis — that is the answer the
    // learner is being asked to work out. Only the presenting complaint
    // is shown, which is what a pharmacist actually sees first.
    function renderCaseMap(cases, onStart) {
        allCases = cases || [];
        onStartCase = onStart;
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

    // Front-facing patient in a hospital room. The learner is the
    // pharmacist standing at the bedside, so the patient looks straight
    // out of the screen and tracks the cursor.
    function buildAvatarSVG() {
        return `
<svg viewBox="0 0 320 240" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="ผู้ป่วยในห้องตรวจ" preserveAspectRatio="xMidYMid meet">
  <defs>
    <linearGradient id="paWall" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#16223B"/><stop offset="100%" stop-color="#0D1526"/>
    </linearGradient>
    <linearGradient id="paGown" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#4FD8BA"/><stop offset="100%" stop-color="#189A82"/>
    </linearGradient>
    <linearGradient id="paWindow" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#2B4A6B"/><stop offset="100%" stop-color="#14263C"/>
    </linearGradient>
    <radialGradient id="paSpot" cx="50%" cy="35%">
      <stop offset="0%" stop-color="#48E5C2" stop-opacity=".16"/>
      <stop offset="100%" stop-color="#48E5C2" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="paAlarm" cx="50%" cy="45%">
      <stop offset="30%" stop-color="#E63946" stop-opacity=".38"/>
      <stop offset="100%" stop-color="#E63946" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="paHeadClip"><ellipse cx="160" cy="120" rx="41" ry="46"/></clipPath>
  </defs>

  <!-- ── ROOM ───────────────────────────────────────────── -->
  <rect width="320" height="240" fill="url(#paWall)"/>
  <ellipse cx="160" cy="95" rx="150" ry="110" fill="url(#paSpot)"/>
  <path d="M0 186h320" stroke="rgba(72,229,194,.10)" stroke-width="2"/>

  <!-- Window with blinds -->
  <g opacity=".85">
    <rect x="14" y="30" width="72" height="60" rx="4" fill="url(#paWindow)" stroke="rgba(72,229,194,.22)"/>
    <path d="M16 42h68M16 54h68M16 66h68M16 78h68" stroke="rgba(72,229,194,.14)" stroke-width="2"/>
    <path d="M50 30v60" stroke="rgba(72,229,194,.18)" stroke-width="2"/>
  </g>

  <!-- Wall monitor with ECG trace -->
  <g>
    <rect x="228" y="26" width="76" height="50" rx="5" fill="#0A1322" stroke="rgba(72,229,194,.28)"/>
    <polyline class="pa-ecg" points="234,58 244,58 249,44 255,70 261,50 266,58 280,58 286,48 292,66 298,58"
              fill="none" stroke="#48E5C2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <circle class="pa-monitor-dot" cx="298" cy="33" r="2.6" fill="#48E5C2"/>
  </g>

  <!-- IV stand -->
  <g>
    <path d="M296 92v96M286 188h20" stroke="#33415F" stroke-width="3" stroke-linecap="round"/>
    <rect x="286" y="92" width="18" height="26" rx="5" fill="rgba(72,229,194,.18)" stroke="rgba(72,229,194,.4)"/>
    <path d="M295 118c0 22-10 30-24 38" stroke="rgba(72,229,194,.35)" stroke-width="2" fill="none"/>
  </g>

  <!-- Curtain -->
  <g opacity=".5">
    <path d="M104 22v164M118 22v164M132 22v164" stroke="rgba(51,65,95,.6)" stroke-width="6" stroke-linecap="round"/>
  </g>

  <!-- Bed headboard + blanket -->
  <rect x="86" y="126" width="148" height="30" rx="10" fill="#1B2740"/>
  <path d="M74 240v-32c0-14 12-24 28-24h116c16 0 28 10 28 24v32Z" fill="#16223B"/>
  <path d="M74 214h172" stroke="rgba(72,229,194,.12)" stroke-width="2"/>

  <!-- Critical alarm glow -->
  <ellipse class="pa-aura" cx="160" cy="120" rx="120" ry="105" fill="url(#paAlarm)"/>

  <!-- ── PATIENT ────────────────────────────────────────── -->
  <g class="pa-chest">
    <path d="M96 240v-30c0-24 22-40 46-44h36c24 4 46 20 46 44v30Z" fill="url(#paGown)" opacity=".95"/>
    <path d="M160 168l-16 16 16 16 16-16Z" fill="rgba(11,19,43,.28)"/>
    <path d="M120 214h16" stroke="rgba(11,19,43,.22)" stroke-width="3" stroke-linecap="round"/>
  </g>

  <g class="pa-head-group">
    <rect x="146" y="146" width="28" height="26" rx="11" class="pa-skin"/>
    <ellipse cx="118" cy="124" rx="6.5" ry="10" class="pa-skin"/>
    <ellipse cx="202" cy="124" rx="6.5" ry="10" class="pa-skin"/>
    <ellipse cx="160" cy="120" rx="41" ry="46" class="pa-skin"/>

    <!-- Hair -->
    <g clip-path="url(#paHeadClip)">
      <path d="M119 112c0-30 18-44 41-44s41 14 41 44c0-13-9-20-19-22-8 8-46 10-53-2-7 5-10 11-10 24Z" fill="#2A2118"/>
    </g>

    <!-- Nasal cannula -->
    <path d="M141 138c8 7 30 7 38 0" stroke="rgba(226,232,240,.42)" stroke-width="2" fill="none"/>
    <circle cx="141" cy="138" r="2" fill="rgba(226,232,240,.45)"/>
    <circle cx="179" cy="138" r="2" fill="rgba(226,232,240,.45)"/>

    <!-- EYES — pupils follow the cursor -->
    <g class="pa-eyes-open">
      <ellipse cx="145" cy="118" rx="9.5" ry="7.5" fill="#FFFFFF"/>
      <ellipse cx="175" cy="118" rx="9.5" ry="7.5" fill="#FFFFFF"/>
      <g class="pa-pupil">
        <circle cx="145" cy="118" r="4.2" fill="#3B2B20"/>
        <circle cx="145" cy="118" r="2.1" fill="#12100E"/>
        <circle cx="146.6" cy="116.2" r="1.3" fill="#FFFFFF"/>
      </g>
      <g class="pa-pupil">
        <circle cx="175" cy="118" r="4.2" fill="#3B2B20"/>
        <circle cx="175" cy="118" r="2.1" fill="#12100E"/>
        <circle cx="176.6" cy="116.2" r="1.3" fill="#FFFFFF"/>
      </g>
      <rect class="pa-eyelid pa-skin" x="134" y="108" width="22" height="11" rx="4"/>
      <rect class="pa-eyelid pa-skin" x="164" y="108" width="22" height="11" rx="4"/>
    </g>

    <!-- Nose -->
    <path d="M160 122v10l-4 3" stroke="#B3775C" stroke-width="2" fill="none" stroke-linecap="round"/>

    <!-- Sweat -->
    <g class="pa-sweat">
      <ellipse cx="124" cy="100" rx="3.2" ry="5" fill="#7DD3FC"/>
      <ellipse cx="196" cy="105" rx="2.8" ry="4.4" fill="#7DD3FC"/>
    </g>

    <!-- ── EXPRESSIONS (brows + mouth; closed eyes where needed) ── -->
    <g class="pa-variant pa-neutral">
      <path d="M134 103h18M168 103h18" stroke="#2A2118" stroke-width="3.4" stroke-linecap="round"/>
      <path d="M150 146h20" stroke="#8E4436" stroke-width="3.4" stroke-linecap="round"/>
    </g>

    <g class="pa-variant pa-improving">
      <path d="M134 101h18M168 101h18" stroke="#2A2118" stroke-width="3.4" stroke-linecap="round"/>
      <path d="M148 144q12 7 24 0" stroke="#8E4436" stroke-width="3.4" fill="none" stroke-linecap="round"/>
    </g>

    <g class="pa-variant pa-recovered">
      <path d="M134 100h18M168 100h18" stroke="#2A2118" stroke-width="3.4" stroke-linecap="round"/>
      <path d="M144 142q16 14 32 0" stroke="#8E4436" stroke-width="3.6" fill="none" stroke-linecap="round"/>
      <ellipse cx="128" cy="132" rx="7" ry="4" fill="#E06A6A" opacity=".35"/>
      <ellipse cx="192" cy="132" rx="7" ry="4" fill="#E06A6A" opacity=".35"/>
    </g>

    <g class="pa-variant pa-pain">
      <path d="M134 98l18 8M186 98l-18 8" stroke="#2A2118" stroke-width="3.6" stroke-linecap="round"/>
      <path d="M136 119q9 -7 18 0M166 119q9 -7 18 0" stroke="#2A2118" stroke-width="2.8" fill="none" stroke-linecap="round"/>
      <path d="M147 148q6.5 -8 13 0t13 0" stroke="#8E4436" stroke-width="3.4" fill="none" stroke-linecap="round"/>
    </g>

    <g class="pa-variant pa-distress">
      <path d="M133 97q10 -6 19 -1M187 97q-10 -6 -19 -1" stroke="#2A2118" stroke-width="3.4" fill="none" stroke-linecap="round"/>
      <ellipse cx="160" cy="148" rx="9" ry="10.5" fill="#6E2A24"/>
    </g>

    <g class="pa-variant pa-critical">
      <path d="M134 104h18M168 104h18" stroke="#2A2118" stroke-width="3" stroke-linecap="round"/>
      <path d="M136 118h18M166 118h18" stroke="#2A2118" stroke-width="3" stroke-linecap="round"/>
      <ellipse cx="160" cy="150" rx="8" ry="10" fill="#54201C"/>
    </g>
  </g>
</svg>`;
    }

    const REACTIONS = ['neutral', 'pain', 'distress', 'critical', 'improving', 'recovered'];
    let patientHealth = 60;
    let reactionTimer = null;

    function setPatientReaction(state) {
        const next = REACTIONS.indexOf(state) !== -1 ? state : 'neutral';
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
        const svg = buildAvatarSVG();
        avatarHosts.forEach(h => { h.innerHTML = svg; });
        clearTimeout(reactionTimer);
        initEyeTracking();

        const p = (caseData && caseData.patient) || {};
        setText('patient-name-strip',
            `${p.name || 'ผู้ป่วย'}${p.age ? `, ${p.age}${p.sex || ''}` : ''}`);

        const acuity = String((caseData && caseData.patient && caseData.patient.acuity) || '').toUpperCase();
        const critical = (caseData && caseData.vitals || []).filter(v => v.severity === 'critical').length;

        // Baseline condition derives from the case's own acuity and vitals.
        let start = 70;
        if (acuity.indexOf('HIGH') !== -1 || acuity.indexOf('CRITICAL') !== -1) start = 32;
        else if (acuity.indexOf('URGENCY') !== -1) start = 50;
        start = Math.max(12, start - critical * 3);

        setPatientHealth(start);
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

        if (name === 'library')      renderLibraryPanel();
        if (name === 'stats')        renderStatsPanel();
        if (name === 'leaderboard')  renderLeaderboardPanel();
        if (name === 'achievements') renderAchievementsPanel();
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

    // ─── Free-Play Library ─────────────────────────────────────
    function renderLibraryPanel() {
        const host = byId('library-list');
        if (!host) return;

        if (!allCases.length) {
            host.innerHTML = stateBlock({ reason: 'empty' }, 'ยังไม่มีเคสในระบบ');
            return;
        }

        host.innerHTML = allCases.map((c, i) => {
            let steps = 0, pts = 0;
            Object.values(c.stages || {}).forEach(st =>
                Object.values(st.steps || {}).forEach(s => { steps++; pts += (s.point_value || 0); }));
            return `
                <div class="panel rounded-xl p-3 flex items-center gap-3">
                    <div class="w-10 h-10 rounded-lg bg-navy-700 grid place-items-center text-lg flex-shrink-0">🩺</div>
                    <div class="min-w-0 flex-1">
                        <p class="text-xs font-bold text-white truncate">${esc(c.case_title || c.case_id)}</p>
                        <p class="text-[.65rem] text-slate-500">${steps} steps · ${pts.toLocaleString('en-US')} pts · ${esc(c.difficulty || '')}</p>
                    </div>
                    <button class="primary-btn !min-h-[40px] !px-4 flex-shrink-0" data-library-index="${i}">เล่น</button>
                </div>`;
        }).join('');

        host.querySelectorAll('[data-library-index]').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.libraryIndex, 10);
                if (typeof onStartCase === 'function') onStartCase(allCases[idx]);
            });
        });
    }

    // ─── My Stats ──────────────────────────────────────────────
    async function renderStatsPanel() {
        const host = byId('stats-body');
        if (!host) return;
        host.innerHTML = loadingBlock('กำลังโหลดสถิติจาก Firestore…');

        const res = await window.DBService.getMyAttempts();
        if (!res.ok || res.rows.length === 0) {
            host.innerHTML = stateBlock(res, 'ยังไม่มีประวัติการเล่น — เล่นเคสให้จบสักครั้งแล้วกลับมาดูใหม่');
            return;
        }

        const rows = res.rows;
        const best = Math.max(...rows.map(r => pct(r.finalScore, r.maxScore)));
        const avg  = Math.round(rows.reduce((s, r) => s + pct(r.finalScore, r.maxScore), 0) / rows.length);
        const distinct = new Set(rows.map(r => r.caseId)).size;
        const fatals = rows.filter(r => r.isFatal).length;

        const card = (label, value, tone) => `
            <div class="panel rounded-xl p-3">
                <p class="text-[.58rem] font-bold tracking-widest text-slate-500 uppercase">${label}</p>
                <p class="text-lg font-mono font-extrabold ${tone || 'text-white'} mt-0.5">${value}</p>
            </div>`;

        host.innerHTML = `
            <div class="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
                ${card('Attempts', rows.length)}
                ${card('Best', best + '%', 'text-teal-400')}
                ${card('Average', avg + '%', 'text-gold-400')}
                ${card('Cases', distinct)}
                ${card('Fatal', fatals, fatals ? 'text-acuity-500' : 'text-white')}
            </div>
            <p class="text-[.6rem] font-bold tracking-widest text-slate-500 uppercase mb-2">ประวัติล่าสุด</p>
            <div class="flex flex-col gap-1.5">
                ${rows.slice(0, 12).map(r => {
                    const p = pct(r.finalScore, r.maxScore);
                    const when = r.completedAt && r.completedAt.seconds
                        ? new Date(r.completedAt.seconds * 1000).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })
                        : '—';
                    return `
                        <div class="panel rounded-lg p-2.5 flex items-center gap-3">
                            <span class="tag-pill !text-[.6rem] flex-shrink-0">${esc(r.caseId || '')}</span>
                            <span class="text-[.65rem] text-slate-500 flex-shrink-0 hidden sm:block">${esc(when)}</span>
                            <span class="text-[.65rem] text-slate-400 ml-auto">${r.completedSteps || 0}/${r.totalSteps || 0} steps</span>
                            ${r.isFatal ? '<span class="tag-pill !bg-acuity-500/12 !text-acuity-500 !border-acuity-500/35 !text-[.58rem]">FATAL</span>' : ''}
                            <span class="text-[.72rem] font-mono font-bold ${p >= 85 ? 'text-teal-400' : p >= 60 ? 'text-gold-400' : 'text-slate-400'} flex-shrink-0 w-20 text-right">
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
    const ACHIEVEMENTS = [
        { id: 'first',    icon: '🩺', name: 'First Case',      desc: 'เล่นจบเคสแรก',                     test: r => r.length >= 1 },
        { id: 'perfect',  icon: '💯', name: 'Perfect Score',   desc: 'ทำคะแนนเต็มในเคสใดก็ได้',           test: r => r.some(a => !a.isFatal && a.maxScore > 0 && a.finalScore === a.maxScore) },
        { id: 'sharp',    icon: '🎯', name: 'Sharp Shooter',   desc: 'ทำคะแนนถึง 80% ขึ้นไป',            test: r => r.some(a => pct(a.finalScore, a.maxScore) >= 80) },
        { id: 'noharm',   icon: '🛡', name: 'Do No Harm',      desc: 'เล่นจบ 3 ครั้งโดยไม่เจอ Fatal',     test: r => r.filter(a => !a.isFatal).length >= 3 },
        { id: 'explorer', icon: '📚', name: 'Case Explorer',   desc: 'เล่นครบ 2 เคสที่แตกต่างกัน',        test: r => new Set(r.map(a => a.caseId)).size >= 2 },
        { id: 'marathon', icon: '🔥', name: 'Marathon',        desc: 'เล่นสะสมครบ 5 ครั้ง',              test: r => r.length >= 5 }
    ];

    async function renderAchievementsPanel() {
        const host = byId('achievements-body');
        if (!host) return;
        host.innerHTML = loadingBlock('กำลังตรวจสอบความสำเร็จ…');

        const res = await window.DBService.getMyAttempts();
        if (!res.ok) {
            host.innerHTML = stateBlock(res, '');
            return;
        }

        const rows = res.rows;
        const unlocked = ACHIEVEMENTS.filter(a => a.test(rows)).length;

        host.innerHTML = `
            <div class="panel rounded-xl p-3 mb-3 flex items-center gap-3">
                <span class="text-[.6rem] font-bold tracking-widest text-slate-500 uppercase flex-shrink-0">Unlocked</span>
                <div class="flex-1 h-2 rounded-full bg-navy-700 overflow-hidden">
                    <div class="h-full rounded-full transition-all duration-500"
                         style="width:${pct(unlocked, ACHIEVEMENTS.length)}%; background:linear-gradient(90deg,#48E5C2,#17A98A);"></div>
                </div>
                <span class="text-xs font-mono font-bold text-teal-400 flex-shrink-0">${unlocked}/${ACHIEVEMENTS.length}</span>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                ${ACHIEVEMENTS.map(a => {
                    const on = a.test(rows);
                    return `
                        <div class="panel rounded-xl p-3 flex items-center gap-3 ${on ? '!border-gold-400/40' : 'opacity-55'}">
                            <div class="w-10 h-10 rounded-xl grid place-items-center text-xl flex-shrink-0
                                        ${on ? 'bg-gold-400/15 border border-gold-400/40' : 'bg-navy-700 border border-navy-600 grayscale'}">
                                ${on ? a.icon : '🔒'}
                            </div>
                            <div class="min-w-0">
                                <p class="text-xs font-bold ${on ? 'text-white' : 'text-slate-500'} truncate">${a.name}</p>
                                <p class="text-[.65rem] text-slate-500 leading-snug">${a.desc}</p>
                            </div>
                        </div>`;
                }).join('')}
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

    initEventListeners();

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
        getPatientHealth: () => patientHealth
    };
})();

if (typeof window !== 'undefined') {
    window.UIController = UIController;
}
