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
    const visited = new Set();
    let started = false;
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
        put('mission-progress', visited.size + ' / 3');
        const fill=byId('mission-progress-fill'); if(fill) fill.style.width=(visited.size/3*100)+'%';
        const host = byId('mission-list');
        if (host) host.innerHTML = Object.entries(rooms).map(([id, title]) =>
            `<li class="mission-item${visited.has(id) ? ' is-complete' : ''}"><span aria-hidden="true">${visited.has(id) ? '✓' : '○'}</span><div><strong>เยี่ยมชม${title}</strong><p>${visited.has(id) ? 'สำรวจแล้ว' : 'รอสำรวจ'}</p></div><button type="button" data-room="${id}">ไปที่ห้อง</button></li>`
        ).join('');
        put('mission-start', started ? 'สำรวจต่อ' : 'เริ่มภารกิจทดลอง');
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
        started = true;
        renderMissions();
        selectRoom('reception');
        const canvas = byId('clinic-room');
        if (canvas) {
            canvas.setAttribute('tabindex', '0');
            canvas.scrollIntoView?.({ behavior: 'auto', block: 'center' });
            canvas.focus({ preventScroll: true });
        }
        toast('โหมดทดลอง: สำรวจครบ 3 จุดได้โดยไม่มีคะแนนและไม่มีการบันทึกผล');
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
            case 'mission-reset': visited.clear(); started = false; renderMissions(); toast('เริ่มภารกิจทดลองใหม่แล้ว ไม่มีข้อมูลคะแนนถูกเปลี่ยนแปลง'); break;
            case 'motion-button': setPaused(!paused); break;
            case 'login-button': void authAction('login'); break;
            case 'logout-button': void authAction('logout'); break;
        }
    });
    window.addEventListener('clinic:visit', event => {
        const room = event.detail?.room;
        if (!Object.hasOwn(rooms, room)) return;
        document.querySelectorAll('[data-room]').forEach(el => el.classList.toggle('is-selected', el.dataset.room === room));
        put('room-title', rooms[room]);
        put('room-caption', captions[room]);
        if (!started || visited.has(room)) return;
        visited.add(room);
        renderMissions();
        toast(visited.size === 3 ? 'สำรวจครบแล้ว! นี่คือภารกิจทดลอง ไม่มีคะแนนหรือผลบันทึก' : 'สำรวจแล้ว ' + visited.size + ' / 3 จุด');
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
