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
    function renderInfoStep(stepData) {
        const lines = Array.isArray(stepData.content) ? stepData.content : [];
        let html = `
            <div class="animate-fade-in">
                <div class="flex items-center gap-2 mb-3">
                    <span class="tag-pill !bg-teal-400/12 !text-teal-400 !border-teal-400/35">📋 CLINICAL DATA</span>
                </div>
                <div class="panel rounded-xl p-3">
                    ${lines.map(l => `<p class="clinical-text">${l}</p>`).join('')}
                </div>`;

        if (stepData.image_url) {
            html += `<div class="mt-3 rounded-xl overflow-hidden border border-navy-700/60">
                        <img src="${esc(stepData.image_url)}" alt="Clinical Data" loading="lazy" class="w-full" />
                     </div>`;
        }

        html += `
                <div class="submit-dock">
                    <button class="next-step-btn primary-btn w-full">อ่านเข้าใจแล้ว / ถัดไป →</button>
                </div>
            </div>`;

        gameArea.innerHTML = html;
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

        renderEndScreen({
            icon: '🎓',
            ringClass: 'border-teal-400/50 bg-teal-400/10',
            tag: '✓ CASE COMPLETED',
            tagClass: '!bg-teal-400/12 !text-teal-400 !border-teal-400/35',
            title: 'เคสสำเร็จ!',
            message: 'คุณดำเนินการครบทุกขั้นตอนของกระบวนการ SOAP แล้ว',
            score: state.currentScore,
            maxScore: state.maxPossibleScore,
            completedSteps: state.totalSteps,
            totalSteps: state.totalSteps,
            footnote: 'ผลคะแนนถูกบันทึกเมื่อเข้าสู่ระบบด้วยบัญชี Google'
        });
    }

    // ─── Dashboard: Case Map ───────────────────────────────────
    // Every case in the registry is playable; no artificial locks.
    function renderCaseMap(cases, onStart) {
        allCases = cases || [];
        onStartCase = onStart;
        if (!questTrack) return;

        if (!cases || cases.length === 0) {
            questTrack.innerHTML = `<p class="text-xs text-slate-500 py-6">ไม่พบข้อมูลเคส — ตรวจสอบไฟล์ใน data/</p>`;
            return;
        }

        questTrack.innerHTML = cases.map((c, i) => {
            let steps = 0, pts = 0;
            Object.values(c.stages || {}).forEach(st => {
                Object.values(st.steps || {}).forEach(s => {
                    steps++;
                    pts += (s.point_value || 0);
                });
            });

            const p = c.patient || {};
            const acuity = p.acuity || c.difficulty || '';
            const isHigh = /HIGH|CRITICAL/i.test(acuity);

            return `
                <div class="quest-node panel rounded-2xl p-4 flex flex-col gap-2 border-navy-600 hover:border-teal-400/50">
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="tag-pill !bg-navy-700 !text-slate-300">STAGE ${String(i + 1).padStart(3, '0')}</span>
                        <span class="tag-pill ${isHigh
                            ? '!bg-acuity-500/12 !text-acuity-500 !border-acuity-500/35'
                            : '!bg-gold-400/12 !text-gold-400 !border-gold-400/35'}">${esc(acuity)}</span>
                    </div>

                    <h3 class="text-sm font-extrabold text-white leading-snug">${esc(c.case_title || c.case_id)}</h3>

                    <p class="text-[.7rem] text-slate-400 leading-relaxed line-clamp-3">
                        ${esc(p.chief_complaint || '')}
                    </p>

                    <div class="flex flex-wrap gap-1.5">
                        ${(c.tags || []).map(t => `<span class="tag-pill !text-[.6rem]">${esc(t)}</span>`).join('')}
                    </div>

                    <div class="flex items-center gap-3 text-[.68rem] text-slate-400 mt-1">
                        <span>☰ <strong class="text-white">${steps}</strong> steps</span>
                        <span>★ <strong class="text-gold-400">${pts.toLocaleString('en-US')}</strong> pts</span>
                    </div>

                    <button class="primary-btn w-full mt-2" data-case-index="${i}">
                        ▶ START
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

    function eyesOpen(cx) {
        return `<ellipse cx="${cx}" cy="86" rx="7.5" ry="6.5" fill="#FFFFFF"/>
                <circle cx="${cx}" cy="86" r="3.4" fill="#2A2118"/>
                <circle cx="${cx + 1.6}" cy="84.2" r="1.1" fill="#FFFFFF"/>
                <rect class="pa-eyelid pa-skin" x="${cx - 8}" y="79" width="16" height="8" rx="3"/>`;
    }
    function eyesSquint(cx) {
        return `<path d="M${cx - 8} 87q8 -6 16 0" stroke="#2A2118" stroke-width="2.6" fill="none" stroke-linecap="round"/>`;
    }
    function eyesClosed(cx) {
        return `<path d="M${cx - 8} 86h16" stroke="#2A2118" stroke-width="2.6" stroke-linecap="round"/>`;
    }
    function eyesWide(cx) {
        return `<ellipse cx="${cx}" cy="86" rx="8.5" ry="8" fill="#FFFFFF"/>
                <circle cx="${cx}" cy="86" r="3.2" fill="#2A2118"/>`;
    }
    function eyesHappy(cx) {
        return `<path d="M${cx - 8} 88q8 -9 16 0" stroke="#2A2118" stroke-width="2.8" fill="none" stroke-linecap="round"/>`;
    }

    function buildAvatarSVG() {
        return `
<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Patient">
  <defs>
    <radialGradient id="paAura">
      <stop offset="40%" stop-color="#E63946" stop-opacity=".45"/>
      <stop offset="100%" stop-color="#E63946" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="paGown" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#3FD6B4"/><stop offset="100%" stop-color="#15907A"/>
    </linearGradient>
  </defs>

  <ellipse class="pa-aura" cx="100" cy="105" rx="95" ry="90" fill="url(#paAura)"/>
  <rect x="24" y="122" width="152" height="42" rx="20" fill="rgba(51,65,95,.40)"/>

  <g class="pa-chest">
    <path d="M50 200v-24c0-21 17-36 36-40h28c19 4 36 19 36 40v24Z" fill="url(#paGown)" opacity=".92"/>
    <path d="M100 136 85 151l15 14 15-14Z" fill="rgba(11,19,43,.30)"/>
    <path d="M74 168h14" stroke="rgba(11,19,43,.25)" stroke-width="3" stroke-linecap="round"/>
  </g>

  <rect x="88" y="110" width="24" height="28" rx="10" class="pa-skin"/>
  <ellipse cx="63" cy="92" rx="6" ry="9.5" class="pa-skin"/>
  <ellipse cx="137" cy="92" rx="6" ry="9.5" class="pa-skin"/>
  <ellipse cx="100" cy="88" rx="37" ry="41" class="pa-skin"/>

  <path d="M63 84c0-25 17-40 37-40s37 15 37 40c0-11-8-17-17-19-7 7-41 9-47-2-6 4-10 10-10 21Z" fill="#2A2118"/>

  <path d="M77 103c7 7 39 7 46 0" stroke="rgba(226,232,240,.45)" stroke-width="2" fill="none"/>
  <circle cx="77" cy="103" r="2" fill="rgba(226,232,240,.5)"/>
  <circle cx="123" cy="103" r="2" fill="rgba(226,232,240,.5)"/>

  <g class="pa-sweat">
    <ellipse cx="68" cy="74" rx="3" ry="4.6" fill="#7DD3FC"/>
    <ellipse cx="133" cy="79" rx="2.6" ry="4" fill="#7DD3FC"/>
  </g>

  <path d="M162 182c15-18 19-44 10-66" stroke="rgba(72,229,194,.40)" stroke-width="2.5" fill="none" stroke-linecap="round"/>
  <circle cx="170" cy="112" r="4.5" fill="rgba(72,229,194,.55)"/>

  <!-- NEUTRAL -->
  <g class="pa-variant pa-neutral">
    <path d="M79 73h15M106 73h15" stroke="#2A2118" stroke-width="3.2" stroke-linecap="round"/>
    ${eyesOpen(86)}${eyesOpen(114)}
    <path d="M92 109h16" stroke="#9C4A3C" stroke-width="3.2" stroke-linecap="round"/>
  </g>

  <!-- PAIN -->
  <g class="pa-variant pa-pain">
    <path d="M79 70l15 6M121 70l-15 6" stroke="#2A2118" stroke-width="3.4" stroke-linecap="round"/>
    ${eyesSquint(86)}${eyesSquint(114)}
    <path d="M89 111q5.5 -7 11 0t11 0" stroke="#9C4A3C" stroke-width="3.2" fill="none" stroke-linecap="round"/>
  </g>

  <!-- DISTRESS -->
  <g class="pa-variant pa-distress">
    <path d="M78 68q8 -5 16 -1M122 68q-8 -5 -16 -1" stroke="#2A2118" stroke-width="3.2" fill="none" stroke-linecap="round"/>
    ${eyesWide(86)}${eyesWide(114)}
    <ellipse cx="100" cy="111" rx="8" ry="9" fill="#7A2E28"/>
  </g>

  <!-- CRITICAL -->
  <g class="pa-variant pa-critical">
    <path d="M79 74h15M106 74h15" stroke="#2A2118" stroke-width="2.8" stroke-linecap="round"/>
    ${eyesClosed(86)}${eyesClosed(114)}
    <ellipse cx="100" cy="112" rx="7" ry="8.5" fill="#5E2723"/>
  </g>

  <!-- IMPROVING -->
  <g class="pa-variant pa-improving">
    <path d="M79 72h15M106 72h15" stroke="#2A2118" stroke-width="3.2" stroke-linecap="round"/>
    ${eyesOpen(86)}${eyesOpen(114)}
    <path d="M91 108q9 5 18 0" stroke="#9C4A3C" stroke-width="3.2" fill="none" stroke-linecap="round"/>
  </g>

  <!-- RECOVERED -->
  <g class="pa-variant pa-recovered">
    <path d="M79 71h15M106 71h15" stroke="#2A2118" stroke-width="3.2" stroke-linecap="round"/>
    ${eyesHappy(86)}${eyesHappy(114)}
    <path d="M88 106q12 10 24 0" stroke="#9C4A3C" stroke-width="3.4" fill="none" stroke-linecap="round"/>
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

    function initPatientAvatar(caseData) {
        if (avatarHosts.length === 0) return;
        const svg = buildAvatarSVG();
        avatarHosts.forEach(h => { h.innerHTML = svg; });
        clearTimeout(reactionTimer);

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
