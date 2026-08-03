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
        closeDrawer
    };
})();

if (typeof window !== 'undefined') {
    window.UIController = UIController;
}
