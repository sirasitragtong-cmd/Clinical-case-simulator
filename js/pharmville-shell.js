/** Presentation bridge for the original authenticated, scored app.
 * No case loading, answer keys, database calls or score calculations live here.
 */
(function () {
    'use strict';
    const scene = window.HospitalScene;
    const dialog = document.getElementById('pv-role-dialog');
    const gameArea = document.getElementById('game-content-area');
    const thai = () => !window.I18n || window.I18n.isThai();
    const labels = {
        pharmacist: ['เภสัชกร', 'Pharmacist'], doctor: ['แพทย์', 'Doctor'],
        nurse: ['พยาบาล', 'Nurse'], dentist: ['ทันตแพทย์', 'Dentist']
    };
    let activeView = 'login';
    scene?.setActive(false);

    document.querySelectorAll('[data-pv-th]').forEach(element => {
        element.textContent = thai() ? element.dataset.pvTh : element.dataset.pvEn;
    });
    function focusWork() {
        if (activeView !== 'game') return;
        scene?.selectStation('pharmacy');
        gameArea.setAttribute('tabindex', '-1');
        gameArea.scrollIntoView({ behavior: 'auto', block: 'center' });
        gameArea.focus({ preventScroll: true });
    }
    function openRole(role) {
        if (!labels[role]) return;
        if (role === 'pharmacist') {
            if (activeView === 'game') focusWork();
            else document.getElementById('quest-track').scrollIntoView({ behavior: 'auto', block: 'center' });
            return;
        }
        document.getElementById('pv-role-dialog-title').textContent = labels[role][thai() ? 0 : 1];
        if (!dialog.open) dialog.showModal();
    }
    document.querySelectorAll('[data-pv-role]').forEach(button => {
        button.addEventListener('click', () => openRole(button.dataset.pvRole));
    });
    document.getElementById('pv-open-work').addEventListener('click', focusWork);
    document.querySelectorAll('[data-pv-action]').forEach(button => {
        button.addEventListener('click', () => {
            if (activeView !== 'game') return;
            if (button.dataset.pvAction === 'pharmacy') return focusWork();
            scene?.selectStation('patient');
            // Reuse the real patient record controls and their existing answer locks.
            if (matchMedia('(max-width: 767px)').matches) window.UIController.openDrawer();
            else {
                const chart = document.getElementById('soap-content');
                chart.setAttribute('tabindex', '-1');
                chart.scrollIntoView({ behavior: 'auto', block: 'center' });
                chart.focus({ preventScroll: true });
            }
        });
    });
    window.addEventListener('pharmville:viewchange', event => {
        activeView = event.detail.view;
        scene?.setActive(activeView === 'game');
        if (dialog.open) dialog.close();
    });
    // Retry only an unavailable catalogue load; it does not bypass sign-in or start a case.
    document.addEventListener('click', event => {
        if (event.target.closest('[data-pv-retry-cases]')) {
            window.dispatchEvent(new CustomEvent('pharmville:retrycases'));
        }
    });
})();
