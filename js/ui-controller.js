/**
 * ui-controller.js
 * Medical RPG Simulator — View Switcher & Render Engine
 *
 * Contract with game-engine.js (unchanged):
 *   UIController.renderInfo(stepData)
 *   UIController.renderMCQ(stepData)
 *   UIController.showFeedback(isCorrect, message)
 *   UIController.navigateTo(viewName)   // 'login' | 'dashboard' | 'game'
 *
 * Note: the 'game' key maps to the #simulation-view element.
 */
const UIController = (function() {

    // ─── View Registry ─────────────────────────────────────────
    const views = {
        login:     document.getElementById('login-view'),
        dashboard: document.getElementById('dashboard-view'),
        game:      document.getElementById('simulation-view')
    };

    // ─── Element Registry ──────────────────────────────────────
    const gameArea       = document.getElementById('game-content-area');
    const decisionPanel  = document.getElementById('decision-panel');
    const decisionBody   = document.getElementById('decision-content');
    const stepDotsEl     = document.getElementById('step-dots');
    const vitalsHud      = document.getElementById('vitals-hud');
    const soapContent    = document.getElementById('soap-content');
    const questTrack     = document.getElementById('quest-track');

    let activeCase = null;
    let soapTab    = 'subjective';
    let paused     = false;

    // ─── Helpers ───────────────────────────────────────────────
    function esc(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // Decides where interactive decision content lives.
    // On xl screens the dedicated right panel is visible and owns it;
    // otherwise it falls back to the centre column.
    function decisionHost() {
        const panelVisible = decisionPanel && decisionPanel.offsetParent !== null;
        return panelVisible ? decisionBody : gameArea;
    }

    // ─── Event Delegation (both possible hosts) ────────────────
    function handleClick(event) {
        const choiceBtn = event.target.closest('.choice-btn');
        if (choiceBtn && !choiceBtn.disabled) {
            const id = choiceBtn.dataset.choiceId;
            if (id) GameEngine.evaluateAnswer(id);
            return;
        }
        const nextBtn = event.target.closest('.next-step-btn');
        if (nextBtn) {
            GameEngine.proceedToNextStep();
            return;
        }
    }

    function initEventListeners() {
        if (!gameArea) {
            console.error('[UI Error] #game-content-area not found in DOM.');
        } else {
            gameArea.addEventListener('click', handleClick);
        }
        if (decisionBody) decisionBody.addEventListener('click', handleClick);

        // SOAP tab switching
        document.querySelectorAll('.soap-tab').forEach(tab => {
            tab.addEventListener('click', function() {
                soapTab = tab.dataset.soap;
                document.querySelectorAll('.soap-tab').forEach(t => {
                    const on = t.dataset.soap === soapTab;
                    t.className = 'soap-tab flex-1 px-2 py-1.5 rounded-lg text-[.68rem] transition ' +
                        (on ? 'font-bold text-navy-900 bg-teal-400'
                            : 'font-semibold text-slate-400 hover:text-white hover:bg-navy-700/60');
                });
                renderPatientChart(activeCase);
            });
        });
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
        window.scrollTo(0, 0);
    }

    // ─── Case Header (simulation view) ─────────────────────────
    function renderCaseHeader(caseData) {
        if (!caseData) return;
        activeCase = caseData;

        const idBadge = document.getElementById('case-id-badge');
        if (idBadge) idBadge.textContent = String(caseData.case_id || 'case').toUpperCase().replace('_', ' ');

        const acuity = document.getElementById('case-acuity-badge');
        const level  = (caseData.patient && caseData.patient.acuity) || caseData.difficulty || '';
        if (acuity && level) acuity.textContent = `⚠ ${String(level).toUpperCase()}`;
    }

    // ─── Vitals HUD ────────────────────────────────────────────
    function renderVitals(caseData) {
        if (!vitalsHud) return;
        const vitals = (caseData && Array.isArray(caseData.vitals)) ? caseData.vitals : [];

        if (vitals.length === 0) {
            vitalsHud.innerHTML = '';
            return;
        }

        vitalsHud.innerHTML = vitals.map((v, i) => {
            const critical = v.severity === 'critical';
            const flagColor = critical ? 'text-acuity-500' : 'text-teal-400';
            const border = i < vitals.length - 1 ? 'border-r border-navy-700/60' : '';
            return `
                <div class="flex-1 px-4 py-1.5 text-center ${border}">
                    <p class="text-[.58rem] font-bold tracking-widest text-slate-500 uppercase">${esc(v.label)}</p>
                    <p class="text-sm font-mono font-bold text-white leading-tight">${esc(v.value)}</p>
                    <p class="text-[.55rem] font-semibold ${flagColor}">${critical ? '▲ ' : ''}${esc(v.flag)}</p>
                </div>`;
        }).join('');
    }

    // ─── Patient Chart (left SOAP panel) ───────────────────────
    function renderPatientChart(caseData) {
        if (!soapContent) return;
        if (caseData) activeCase = caseData;
        const data = activeCase;
        if (!data) return;

        // Identity block
        const p = data.patient || {};
        const setText = (id, val) => { const el = document.getElementById(id); if (el && val) el.textContent = val; };
        setText('patient-name', `${p.name || 'ผู้ป่วย'}${p.age ? `, ${p.age}${p.sex || ''}` : ''}`);
        setText('patient-cc', p.chief_complaint || data.case_title || '');
        setText('patient-meta', `${data.case_id || ''} · ${(data.tags || []).join(' · ')}`);
        const pill = document.getElementById('patient-acuity-pill');
        if (pill && p.acuity) pill.textContent = p.acuity;

        // Resolve the two info steps as Subjective / Objective sources
        const stages = data.stages || {};
        const firstStage = stages[Object.keys(stages)[0]] || { steps: {} };
        const infoSteps = Object.values(firstStage.steps || {}).filter(s => s.type === 'info');

        function contentBlock(step, emptyMsg) {
            if (!step || !Array.isArray(step.content)) {
                return `<p class="text-slate-500 text-[.72rem] leading-relaxed">${emptyMsg}</p>`;
            }
            // step.content is trusted authored HTML from the case file (uses <strong>)
            return step.content.map(line => `<p class="clinical-text">${line}</p>`).join('');
        }

        if (soapTab === 'subjective') {
            soapContent.innerHTML = contentBlock(infoSteps[0], 'ไม่มีข้อมูล Subjective');
        } else if (soapTab === 'objective') {
            soapContent.innerHTML = contentBlock(infoSteps[1], 'ไม่มีข้อมูล Objective');
        } else {
            const tags = (data.tags || []).map(t => `<span class="tag-pill">${esc(t)}</span>`).join(' ');
            soapContent.innerHTML = `
                <div class="space-y-3">
                    <div>
                        <p class="text-[.6rem] font-bold tracking-widest text-slate-500 uppercase mb-1.5">Case Profile</p>
                        <p class="text-xs font-semibold text-white leading-relaxed">${esc(data.case_title || '')}</p>
                    </div>
                    <div>
                        <p class="text-[.6rem] font-bold tracking-widest text-slate-500 uppercase mb-1.5">Difficulty</p>
                        <span class="tag-pill !text-gold-400 !border-gold-400/30 !bg-gold-400/10">${esc(data.difficulty || '—')}</span>
                    </div>
                    <div>
                        <p class="text-[.6rem] font-bold tracking-widest text-slate-500 uppercase mb-1.5">Topics</p>
                        <div class="flex flex-wrap gap-1.5">${tags || '<span class="text-slate-500 text-[.72rem]">—</span>'}</div>
                    </div>
                    <div class="pt-2 border-t border-navy-700/50">
                        <p class="text-[.68rem] text-slate-500 leading-relaxed">
                            แนวทางเวชปฏิบัติเฉพาะเคสยังไม่ได้บรรจุในไฟล์ข้อมูล — เพิ่มฟิลด์
                            <code class="text-teal-400">cpg</code> ใน case JSON เพื่อแสดงที่นี่
                        </p>
                    </div>
                </div>`;
        }
    }

    // ─── Step Progress Dots ────────────────────────────────────
    function buildStepDots(total) {
        if (!stepDotsEl || !total) return;
        stepDotsEl.innerHTML = Array.from({ length: total },
            () => `<span class="step-dot flex-shrink-0"></span>`).join('');
    }

    function syncStepDots(currentIndex, total) {
        if (!stepDotsEl) return;
        const dots = stepDotsEl.querySelectorAll('.step-dot');
        if (dots.length !== total) buildStepDots(total);
        stepDotsEl.querySelectorAll('.step-dot').forEach((dot, i) => {
            dot.classList.remove('done', 'current');
            if (i < currentIndex) dot.classList.add('done');
            else if (i === currentIndex) dot.classList.add('current');
        });
    }

    // ─── Decision Panel Header Sync ────────────────────────────
    function syncDecisionHeader(state, caseData) {
        const chip   = document.getElementById('decision-step-chip');
        const stage  = document.getElementById('decision-stage-chip');
        const points = document.getElementById('decision-points-chip');

        if (chip) chip.textContent = `Step ${state.currentStepIndex + 1}/${state.totalSteps}`;

        if (stage && caseData && state.currentStageId) {
            const s = (caseData.stages || {})[state.currentStageId];
            stage.textContent = s && s.title ? s.title : state.currentStageId;
        }

        if (points && caseData && state.currentStageId && state.currentStepId) {
            const st = ((caseData.stages || {})[state.currentStageId] || { steps: {} }).steps[state.currentStepId];
            points.textContent = `⚡ ${(st && st.point_value) || 0} pts`;
        }
    }

    // ─── Render: Info Step ─────────────────────────────────────
    function renderInfoStep(stepData) {
        // Info steps are chart data — always shown in the centre column.
        const lines = Array.isArray(stepData.content) ? stepData.content : [];

        let html = `
            <div class="animate-fade-in">
                <div class="flex items-center gap-2 mb-3">
                    <span class="tag-pill !bg-teal-400/12 !text-teal-400 !border-teal-400/35">📋 CLINICAL DATA</span>
                    <span class="text-[.68rem] text-slate-500">อ่านข้อมูลก่อนดำเนินการต่อ</span>
                </div>
                <div class="panel rounded-xl p-4 space-y-0">
                    ${lines.map(l => `<p class="clinical-text">${l}</p>`).join('')}
                </div>`;

        if (stepData.image_url) {
            html += `
                <div class="mt-3 rounded-xl overflow-hidden border border-navy-700/60">
                    <img src="${esc(stepData.image_url)}" alt="Clinical Data" loading="lazy" class="w-full" />
                </div>`;
        }

        html += `
                <div class="mt-4 flex justify-end">
                    <button class="next-step-btn primary-btn">อ่านเข้าใจแล้ว / ถัดไป →</button>
                </div>
            </div>`;

        gameArea.innerHTML = html;

        // Keep the decision panel meaningful during info steps
        if (decisionBody && decisionHost() === decisionBody) {
            decisionBody.innerHTML = `
                <div class="h-full flex flex-col items-center justify-center text-center gap-2 py-8">
                    <span class="text-2xl">🩺</span>
                    <p class="text-xs font-semibold text-slate-300">กำลังรวบรวมข้อมูล</p>
                    <p class="text-[.7rem] text-slate-500 leading-relaxed max-w-[15rem]">
                        Clinical Decision Engine จะเปิดใช้งานเมื่อถึงขั้นตอนการตัดสินใจ
                    </p>
                </div>`;
        }
    }

    // ─── Render: MCQ Step ──────────────────────────────────────
    function renderMCQStep(stepData) {
        const host = decisionHost();
        const pts  = stepData.point_value || 0;
        const perChoice = stepData.choices && stepData.choices.length
            ? Math.round(pts / 1) : pts;

        const choices = (stepData.choices || []).map(c => `
            <button class="choice-btn" data-choice-id="${esc(c.id)}">
                <span class="choice-key">${esc(c.id)}</span>
                <span class="flex-1">
                    <span class="block">${esc(c.text)}</span>
                </span>
                <span class="text-[.62rem] font-bold text-gold-400 flex-shrink-0 mt-.5">+${perChoice}</span>
            </button>`).join('');

        const body = `
            <div class="animate-fade-in flex flex-col gap-3">
                <div>
                    <p class="text-[.6rem] font-bold tracking-widest text-teal-400 uppercase mb-1.5">Clinical Decision</p>
                    <h3 class="text-sm font-bold text-white leading-relaxed">${esc(stepData.question)}</h3>
                    <p class="text-[.68rem] text-slate-500 mt-1.5">ⓘ เลือก 1 คำตอบที่เหมาะสมที่สุด</p>
                </div>
                <div class="flex flex-col gap-2">${choices}</div>
                <div id="feedback-area"></div>
            </div>`;

        host.innerHTML = body;

        // If the decision panel owns the question, keep the centre column
        // showing step context so the workspace never looks empty.
        if (host === decisionBody && gameArea) {
            gameArea.innerHTML = `
                <div class="h-full flex flex-col items-center justify-center text-center gap-2.5 py-6 animate-fade-in">
                    <span class="tag-pill !bg-gold-400/12 !text-gold-400 !border-gold-400/35">⚡ ${pts} pts</span>
                    <p class="text-sm font-bold text-white max-w-md leading-relaxed">${esc(stepData.question)}</p>
                    <p class="text-[.7rem] text-slate-500">เลือกคำตอบที่แผง Clinical Decision Engine ด้านขวา →</p>
                </div>`;
        }
    }

    // ─── Render: Feedback ──────────────────────────────────────
    function renderFeedback(isCorrect, feedbackMessage) {
        const host = decisionHost();
        const feedbackArea = host.querySelector('#feedback-area')
            || document.getElementById('feedback-area');
        if (!feedbackArea) return;

        // Lock every choice across both possible hosts
        document.querySelectorAll('.choice-btn').forEach(btn => { btn.disabled = true; });

        const tone = isCorrect
            ? { cls: 'border-teal-400/50 bg-teal-400/10', text: 'text-teal-400', icon: '✓', title: 'ถูกต้อง!' }
            : { cls: 'border-acuity-500/50 bg-acuity-500/10', text: 'text-acuity-500', icon: '✕', title: 'ยังไม่ถูกต้อง' };

        feedbackArea.innerHTML = `
            <div class="rounded-xl border ${tone.cls} p-3.5 mt-1 animate-slide-up">
                <div class="flex items-center gap-2 mb-1.5">
                    <span class="w-5 h-5 rounded-full grid place-items-center text-[.7rem] font-bold ${tone.text} border border-current">${tone.icon}</span>
                    <h4 class="text-xs font-extrabold ${tone.text}">${tone.title}</h4>
                </div>
                <p class="text-[.72rem] text-slate-300 leading-relaxed">${esc(feedbackMessage)}</p>
                <button class="next-step-btn primary-btn w-full mt-3">Submit Clinical Decision → ถัดไป</button>
            </div>`;

        feedbackArea.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // ─── Dashboard: Quest Map ──────────────────────────────────
    // Renders one node per stage in the case file.
    function renderQuestMap(caseData) {
        if (!questTrack) return;

        if (!caseData || !caseData.stages) {
            questTrack.innerHTML = `<p class="text-xs text-slate-500 py-6 px-2">กำลังโหลดแผนที่ภารกิจ…</p>`;
            return;
        }

        const stageIds = Object.keys(caseData.stages);
        const nodes = stageIds.map((sid, i) => {
            const stage = caseData.stages[sid];
            const stepCount = Object.keys(stage.steps || {}).length;
            const stagePts = Object.values(stage.steps || {})
                .reduce((sum, s) => sum + (s.point_value || 0), 0);

            const isCurrent = i === 0;
            const isLocked  = i > 0;

            const ring = isCurrent
                ? 'border-teal-400/70 animate-quest-glow'
                : 'border-navy-600';

            const badge = isCurrent
                ? `<span class="absolute -top-2 left-1/2 -translate-x-1/2 whitespace-nowrap px-2 py-.5 rounded-full text-[.55rem] font-extrabold text-navy-900 bg-teal-400">⚡ CURRENT QUEST</span>`
                : '';

            const icon = isCurrent
                ? `<div class="w-11 h-11 rounded-full border-2 border-teal-400 grid place-items-center text-teal-400 bg-teal-400/10">▶</div>`
                : `<div class="w-11 h-11 rounded-full border-2 border-navy-600 grid place-items-center text-slate-600 bg-navy-800">🔒</div>`;

            return `
                <div class="quest-node ${isLocked ? 'locked' : ''} relative flex-shrink-0 w-44 rounded-xl border ${ring} bg-navy-800/70 p-3 pt-4 text-center">
                    ${badge}
                    <div class="flex justify-center mb-2">${icon}</div>
                    <p class="text-[.58rem] font-bold tracking-widest text-slate-500 uppercase">Stage ${String(i + 1).padStart(3, '0')}</p>
                    <p class="text-xs font-extrabold text-white leading-tight mt-.5 truncate" title="${esc(stage.title || sid)}">${esc(stage.title || sid)}</p>
                    <p class="text-[.62rem] text-slate-500 mt-1 font-mono">${stepCount} steps · ${stagePts} pts</p>
                    <p class="text-[.62rem] mt-1.5 font-semibold ${isCurrent ? 'text-teal-400' : 'text-slate-600'}">
                        ${isCurrent ? 'พร้อมเริ่ม' : 'ผ่านด่านก่อนหน้าเพื่อปลดล็อก'}
                    </p>
                </div>`;
        }).join('<div class="flex items-center flex-shrink-0"><div class="w-5 h-px bg-navy-600"></div></div>');

        questTrack.innerHTML = nodes;
    }

    // ─── Dashboard: Active Quest Detail ────────────────────────
    function renderQuestDetail(caseData, config) {
        if (!caseData) return;
        activeCase = caseData;

        const stages = caseData.stages || {};
        let totalSteps = 0, totalPts = 0;
        Object.values(stages).forEach(st => {
            Object.values(st.steps || {}).forEach(s => {
                totalSteps++;
                totalPts += (s.point_value || 0);
            });
        });

        const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

        set('quest-title', caseData.case_title || `Case ${caseData.case_id}`);
        set('quest-steps', totalSteps);
        set('quest-max-points', totalPts.toLocaleString('en-US'));

        const p = caseData.patient || {};
        if (p.chief_complaint) {
            set('quest-summary',
                `${p.name || 'ผู้ป่วย'} อายุ ${p.age || '—'} ปี` +
                (p.occupation ? ` (${p.occupation})` : '') +
                ` — ${p.chief_complaint}. ` +
                `ดำเนินการตามกระบวนการ SOAP: รวบรวมข้อมูล ระบุปัญหา ประเมิน และวางแผนการรักษา`);
        }

        const acuityTag = document.getElementById('quest-acuity-tag');
        if (acuityTag && p.acuity) acuityTag.textContent = String(p.acuity).toUpperCase();

        const vitalFlag = document.getElementById('quest-vital-flag');
        if (vitalFlag && Array.isArray(caseData.vitals)) {
            const crit = caseData.vitals.find(v => v.severity === 'critical');
            if (crit) vitalFlag.textContent = `${crit.label} ${crit.value} ${crit.flag}`;
        }

        // Ward progress reflects the single available case honestly (nothing cleared yet)
        set('ward-cleared', 0);
        set('ward-stars', 0);
        set('ward-score', 0);
        set('ward-accuracy', '—');
        const bar = document.getElementById('ward-progress-bar');
        if (bar) bar.style.width = '0%';
    }

    // ─── Render: End-of-Case Screens ───────────────────────────
    // Shared shell for both the fatal and the completion outcome.
    function renderEndScreen(opts) {
        const pct = opts.maxScore > 0 ? Math.round((opts.score / opts.maxScore) * 100) : 0;
        const stars = pct >= 85 ? 3 : pct >= 60 ? 2 : pct >= 35 ? 1 : 0;
        const starRow = Array.from({ length: 3 }, (_, i) =>
            `<span class="text-2xl ${i < stars ? 'text-gold-400' : 'text-navy-600'}">★</span>`).join('');

        const html = `
            <div class="h-full flex flex-col items-center justify-center text-center gap-3 py-8 px-4 animate-slide-up">
                <div class="w-16 h-16 rounded-2xl grid place-items-center text-3xl border ${opts.ringClass}">
                    ${opts.icon}
                </div>
                <span class="tag-pill ${opts.tagClass}">${opts.tag}</span>
                <h3 class="text-lg font-extrabold text-white">${esc(opts.title)}</h3>
                <p class="text-xs text-slate-400 leading-relaxed max-w-md">${esc(opts.message)}</p>

                <div class="flex items-center gap-1 mt-1">${starRow}</div>

                <div class="panel rounded-xl px-5 py-3 mt-1">
                    <p class="text-[.6rem] font-bold tracking-widest text-slate-500 uppercase">Final Score</p>
                    <p class="text-xl font-mono font-extrabold text-gold-400 mt-.5">
                        ${opts.score}<span class="text-slate-600 text-sm">/${opts.maxScore}</span>
                        <span class="text-xs text-slate-400 ml-1.5">(${pct}%)</span>
                    </p>
                    <p class="text-[.65rem] text-slate-500 mt-1">
                        ทำได้ ${opts.completedSteps} / ${opts.totalSteps} ขั้นตอน
                    </p>
                </div>

                <button id="btn-end-return" class="primary-btn mt-2">← กลับสู่ Campaign Map</button>
                <p class="text-[.62rem] text-slate-600 mt-1">${esc(opts.footnote || '')}</p>
            </div>`;

        if (gameArea) gameArea.innerHTML = html;
        if (decisionBody && decisionHost() === decisionBody) {
            decisionBody.innerHTML = `
                <div class="h-full flex flex-col items-center justify-center text-center gap-2 py-8">
                    <span class="text-2xl">${opts.icon}</span>
                    <p class="text-xs font-semibold text-slate-300">เคสจบแล้ว</p>
                    <p class="text-[.7rem] text-slate-500">ดูผลสรุปที่คอลัมน์กลาง</p>
                </div>`;
        }

        const back = document.getElementById('btn-end-return');
        if (back) back.addEventListener('click', () => switchView('dashboard'));
    }

    function renderGameOver(fatalMessage, state) {
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

    // ─── Pause overlay state ───────────────────────────────────
    function setPaused(value) {
        paused = value;
        const host = decisionHost();
        if (!host) return;
        host.style.opacity = paused ? '.35' : '1';
        host.style.pointerEvents = paused ? 'none' : 'auto';
    }

    initEventListeners();

    // ─── Public API ────────────────────────────────────────────
    return {
        // Engine contract
        navigateTo: switchView,
        showDashboard: function() { switchView('dashboard'); },
        renderInfo: renderInfoStep,
        renderMCQ: renderMCQStep,
        showFeedback: renderFeedback,

        // Simulation chrome
        renderCaseHeader,
        renderVitals,
        renderPatientChart,
        buildStepDots,
        syncStepDots,
        syncDecisionHeader,
        setPaused,
        renderGameOver,
        renderSummary,

        // Dashboard
        renderQuestMap,
        renderQuestDetail
    };
})();

// Explicit Window Export
if (typeof window !== 'undefined') {
    window.UIController = UIController;
}
