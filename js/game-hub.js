/** PharmVille sandbox hub. No clinical data, scores, or persistence. */
(function () {
    'use strict';
    const byId = id => document.getElementById(id);
    const rooms = { reception: 'จุดต้อนรับ', exam: 'ห้องตรวจ', pharmacy: 'ห้องเภสัชกร' };
    const captions = {
        reception: 'ทำความรู้จักจุดเริ่มต้นของพื้นที่ทดลอง',
        exam: 'สำรวจพื้นที่และทดลองการเดินทางระหว่างห้อง',
        pharmacy: 'พื้นที่หลักสำหรับโหมดเภสัชกร — ยังไม่มีเคสให้เล่น'
    };
    const roles = { pharmacist: 'เภสัชกร', doctor: 'แพทย์', nurse: 'พยาบาล', dentist: 'ทันตแพทย์' };
    const tasks = [
        { room: 'reception', title: 'รับบัตรคิว', action: 'ตรวจบัตรคิวเรียบร้อย', done: 'ตรวจบัตรคิวแล้ว' },
        { room: 'exam', title: 'เตรียมพื้นที่รับบริการ', action: 'ยืนยันว่าห้องพร้อม', done: 'เตรียมห้องแล้ว' },
        { room: 'pharmacy', title: 'ส่งมอบชุดเรียนรู้', action: 'ส่งมอบชุดเรียนรู้เปล่า', done: 'ส่งมอบชุดเรียนรู้แล้ว' }
    ];
    let completed = 0;
    let started = false;
    let arrivedRoom = null;
    let travelTarget = null;
    let paused = false;
    let authBusy = false;
    const put = (id, text) => { const el = byId(id); if (el) el.textContent = text; };
    let toastTimer;
    const toast = text => { put('toast', text); const el=byId('toast'); if(el){el.hidden=false; clearTimeout(toastTimer); toastTimer=setTimeout(()=>{el.hidden=true;},5000);} };

    function showInfo(title, copy) {
        put('dialog-title', title);
        put('dialog-copy', copy);
        const dialog = byId('info-dialog');
        if (dialog && typeof dialog.showModal === 'function') {
            if (!dialog.open) dialog.showModal();
        } else toast(title + ' — ' + copy);
    }

    function navigate(view) {
        if (!['hub', 'missions', 'stages', 'ranking'].includes(view)) return;
        document.querySelectorAll('[data-panel]').forEach(panel => {
            const active = panel.dataset.panel === view;
            panel.classList.toggle('is-active', active);
            panel.hidden = !active;
            panel.inert = !active;
        });
        document.querySelectorAll('[data-view]').forEach(button => {
            const active = button.dataset.view === view;
            button.classList.toggle('is-active', active);
            if (active) button.setAttribute('aria-current', 'page');
            else button.removeAttribute('aria-current');
        });
        window.ClinicRoom?.setActive?.(view === 'hub');
    }

    function renderMissions() {
        put('mission-progress', completed + ' / 3');
        const fill = byId('mission-progress-fill');
        if (fill) fill.style.width = (completed / 3 * 100) + '%';
        const host = byId('mission-list');
        if (host) host.innerHTML = tasks.map((task, i) =>
            `<li class="mission-item${i < completed ? ' is-complete' : ''}${started && i === completed ? ' is-current' : ''}"><span aria-hidden="true">${i < completed ? '✓' : i + 1}</span><div><strong>${task.title}</strong><p>${i < completed ? task.done : rooms[task.room]}</p></div><button type="button" data-room="${task.room}">ไปที่ห้อง</button></li>`
        ).join('');
        const task = tasks[completed];
        const ready = started && task && arrivedRoom === task.room;
        const action = byId('service-button');
        if (action) {
            action.disabled = !ready;
            action.textContent = completed === 3 ? 'ภารกิจรอบนี้เสร็จแล้ว' : ready ? task.action : 'รอคนไข้ถึงจุดบริการ';
        }
        put('mission-start', completed === 3 ? 'เล่นรอบใหม่' : started ? 'ไปยังภารกิจถัดไป' : 'เริ่มรับคนไข้');
        put('tour-button', completed === 3 ? 'เล่นอีกรอบ' : started ? 'ไปยังจุดบริการ' : 'เริ่มเล่น');
        let status = 'กดเริ่มรับคนไข้ แล้วพาไปจุดบริการตามลำดับ';
        if (completed === 3) status = 'ดูแลครบ 3 จุดแล้ว! เล่นรอบใหม่ได้ ไม่มีคะแนนหรือผลบันทึก';
        else if (started) status = ready
            ? 'ถึง' + rooms[task.room] + 'แล้ว · กด “' + task.action + '” เพื่อทำภารกิจ'
            : travelTarget ? 'คนไข้กำลังเดินไป' + rooms[travelTarget] + ' · ภารกิจปัจจุบัน: ' + task.title
            : 'ภารกิจต่อไป: ' + task.title + ' · พาคนไข้ไป' + rooms[task.room];
        put('game-status', status);
    }

    function resetRound() {
        completed = 0;
        started = false;
        arrivedRoom = null;
        travelTarget = null;
        window.ClinicRoom?.reset?.();
        document.querySelectorAll('[data-room]').forEach(el => el.classList.toggle('is-selected', false));
        put('room-title', 'พร้อมต้อนรับคนไข้คนต่อไป');
        put('room-caption', 'เริ่มรอบใหม่ได้เมื่อพร้อม · เกมทดลองการจัดการพื้นที่ ไม่มีเนื้อหาการรักษา');
        renderMissions();
    }

    function completeService() {
        const task = tasks[completed];
        if (!started || !task || arrivedRoom !== task.room) return;
        completed++;
        arrivedRoom = null;
        travelTarget = null;
        renderMissions();
        if (completed === tasks.length) {
            showInfo('จบรอบแล้ว! ครบทั้ง 3 จุด', 'ตรวจบัตรคิว เตรียมห้อง และส่งมอบชุดเรียนรู้ครบแล้ว กดเล่นรอบใหม่เพื่อเริ่มอีกครั้ง เกมนี้ไม่มีการรักษาหรือการให้คะแนน');
            toast('ภารกิจสำเร็จ 3 / 3 · ไม่มีการบันทึกคะแนน');
        } else toast(task.done + ' · ต่อไปที่' + rooms[tasks[completed].room]);
    }

    function selectRoom(room) {
        if (!Object.hasOwn(rooms, room)) return;
        navigate('hub');
        document.querySelectorAll('[data-room]').forEach(el => el.classList.toggle('is-selected', el.dataset.room === room));
        put('room-title', rooms[room]);
        put('room-caption', captions[room]);
        window.ClinicRoom?.selectRoom?.(room);
    }

    function setPaused(value) {
        paused = Boolean(value);
        window.ClinicRoom?.setPaused?.(paused);
        const button = byId('motion-button');
        if (button) {
            button.textContent = paused ? 'เล่นภาพเคลื่อนไหว' : 'พักภาพเคลื่อนไหว';
            button.setAttribute('aria-pressed', String(paused));
        }
    }

    function startSandbox() {
        if (completed === tasks.length) resetRound();
        if (!started) {
            window.ClinicRoom?.reset?.();
            arrivedRoom = null;
            travelTarget = null;
            started = true;
        }
        renderMissions();
        selectRoom(tasks[completed].room);
        const canvas = byId('clinic-room');
        if (canvas) {
            canvas.setAttribute('tabindex', '0');
            canvas.scrollIntoView?.({ behavior: 'auto', block: 'center' });
            canvas.focus({ preventScroll: true });
        }
    }

    function renderSession() {
        const user = window.AuthService?.getCurrentUser?.();
        const signedIn = Boolean(user && !user.isAnonymous);
        put('player-name', signedIn ? (user.displayName || 'ผู้เล่น') : 'ผู้เยี่ยมชม');
        if (byId('login-button')) byId('login-button').hidden = signedIn;
        if (byId('logout-button')) byId('logout-button').hidden = !signedIn;
    }

    async function authAction(action) {
        if (authBusy) return;
        const service = window.AuthService;
        const method = action === 'login' ? 'loginWithGoogle' : 'logout';
        if (!service || typeof service[method] !== 'function') {
            showInfo('บัญชีผู้เล่น', 'ระบบบัญชียังไม่พร้อม คุณสามารถสำรวจโหมดทดลองได้ทันที');
            return;
        }
        authBusy = true;
        ['login-button', 'logout-button'].forEach(id => { if (byId(id)) byId(id).disabled = true; });
        try {
            await service[method]();
            renderSession();
            toast(action === 'login' ? 'เข้าสู่ระบบแล้ว — โหมดทดลองยังไม่มีการบันทึกคะแนน' : 'ออกจากระบบแล้ว');
        } catch (_) {
            toast('ดำเนินการบัญชีไม่สำเร็จ กรุณาลองอีกครั้ง หรือสำรวจต่อในโหมดผู้เยี่ยมชม');
        } finally {
            authBusy = false;
            ['login-button', 'logout-button'].forEach(id => { if (byId(id)) byId(id).disabled = false; });
        }
    }

    document.addEventListener('click', event => {
        const button = event.target.closest('button');
        if (!button || button.disabled) return;
        if (button.dataset.view) return navigate(button.dataset.view);
        if (button.dataset.room) return selectRoom(button.dataset.room);
        if (button.dataset.stage) return showInfo('เคสที่ ' + button.dataset.stage + ' — ยังไม่เปิด', 'พื้นที่นี้เตรียมไว้สำหรับเนื้อหาในอนาคต ขณะนี้ยังไม่มีเคส คำถาม หรือคะแนน');
        if (button.dataset.role) {
            if (button.dataset.role === 'pharmacist') return selectRoom('pharmacy');
            if (Object.hasOwn(roles, button.dataset.role)) return showInfo(roles[button.dataset.role] + ' — ยังไม่เปิดให้เล่น', 'ขณะนี้เปิดเฉพาะพื้นที่ทดลองของเภสัชกร');
            return;
        }
        switch (button.id) {
            case 'tour-button': case 'mission-start': startSandbox(); break;
            case 'mission-reset': resetRound(); toast('รีเซ็ตรอบแล้ว กดเริ่มรับคนไข้เมื่อพร้อม'); break;
            case 'service-button': completeService(); break;
            case 'motion-button': setPaused(!paused); break;
            case 'login-button': void authAction('login'); break;
            case 'logout-button': void authAction('logout'); break;
        }
    });
    window.addEventListener('clinic:travel', event => {
        const room = event.detail?.room;
        if (!Object.hasOwn(rooms, room)) return;
        travelTarget = room;
        arrivedRoom = null;
        renderMissions();
    });
    window.addEventListener('clinic:visit', event => {
        const room = event.detail?.room;
        if (!Object.hasOwn(rooms, room) || room !== travelTarget) return;
        travelTarget = null;
        arrivedRoom = room;
        document.querySelectorAll('[data-room]').forEach(el => el.classList.toggle('is-selected', el.dataset.room === room));
        put('room-title', rooms[room]);
        put('room-caption', captions[room]);
        renderMissions();
        if (!started || completed === tasks.length) return;
        const task = tasks[completed];
        toast(room === task.room ? 'ถึงจุดบริการแล้ว · ' + task.action : 'จุดนี้ยังไม่ใช่ภารกิจปัจจุบัน ไปที่' + rooms[task.room] + 'ก่อน');
    });

    const stages = byId('stage-list');
    if (stages) stages.innerHTML = [1, 2].map(n => `<button type="button" class="stage-card" data-stage="${n}"><span class="stage-number">0${n}</span><strong>เคสที่ ${n}</strong><span>ยังไม่เปิด · รอเพิ่มเนื้อหา</span></button>`).join('');
    const ranking = byId('ranking-list');
    if (ranking) ranking.innerHTML = '<div class="empty-state"><strong>ยังไม่มีอันดับคะแนน</strong><p>โหมดทดลองไม่มีคะแนนและไม่บันทึกผลการเล่น</p></div>';
    renderMissions();
    renderSession();
    navigate('hub');
    paused = Boolean(window.ClinicRoom?.isPaused?.() ?? window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
    setPaused(paused);
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
    if (window.authReadyPromise) Promise.resolve(window.authReadyPromise).then(renderSession).catch(() => toast('ระบบบัญชีไม่พร้อม แต่ยังสำรวจโหมดทดลองได้'));
})();
