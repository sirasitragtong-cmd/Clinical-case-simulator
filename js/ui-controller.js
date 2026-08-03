/**
 * ui-controller.js
 * Refactored by Antigravity | Reviewed & Approved by CTO
 */
const UIController = (function() {
    const views = {
        login: document.getElementById('login-view'),
        dashboard: document.getElementById('dashboard-view'),
        game: document.getElementById('game-view')
    };

    const gameArea = document.getElementById('game-content-area');

    // Central Event Delegation บน #game-content-area
    function initEventListeners() {
        if (!gameArea) {
            console.error('[UI Error] #game-content-area element not found in DOM.');
            return;
        }

        gameArea.addEventListener('click', function(event) {
            // Case 1: ดักจับคลิกตัวเลือก MCQ
            const choiceBtn = event.target.closest('.choice-btn');
            if (choiceBtn && !choiceBtn.disabled) {
                const selectedChoiceId = choiceBtn.dataset.choiceId;
                if (selectedChoiceId) {
                    GameEngine.evaluateAnswer(selectedChoiceId);
                }
                return;
            }

            // Case 2: ดักจับคลิกปุ่ม "ไปข้อถัดไป" (.next-step-btn)
            const nextBtn = event.target.closest('.next-step-btn');
            if (nextBtn) {
                GameEngine.proceedToNextStep();
                return;
            }
        });
    }

    function switchView(viewName) {
        Object.values(views).forEach(view => {
            if (view) {
                view.classList.remove('active-view');
                view.classList.add('hidden-view');
                view.style.display = 'none';
            }
        });

        const activeView = views[viewName];
        if (activeView) {
            activeView.classList.remove('hidden-view');
            activeView.classList.add('active-view');
            activeView.style.display = 'block';
        }
    }

    // Render Stage 1 (type: "info") พร้อมปุ่ม .next-step-btn
    function renderInfoStep(stepData) {
        let htmlContent = `<div class="info-step-container">`;
        
        if (Array.isArray(stepData.content)) {
            stepData.content.forEach(line => {
                htmlContent += `<p class="clinical-text">${line}</p>`;
            });
        }

        if (stepData.image_url) {
            htmlContent += `
                <div class="clinical-image-wrapper">
                    <img src="${stepData.image_url}" alt="Clinical Data" loading="lazy" />
                </div>
            `;
        }
        
        htmlContent += `
            <div class="action-container" style="margin-top: 20px;">
                <button class="next-step-btn primary-btn">อ่านเข้าใจแล้ว / ถัดไป &rarr;</button>
            </div>
        </div>`;
        
        gameArea.innerHTML = htmlContent;
    }

    // Render Stage 2-4 (type: "mcq")
    function renderMCQStep(stepData) {
        let htmlContent = `
            <div class="mcq-step-container">
                <h3 class="question-text">${stepData.question} <span class="points-badge">(${stepData.point_value || 0} pts)</span></h3>
                <div class="choices-container">
        `;

        stepData.choices.forEach(choice => {
            htmlContent += `
                <button class="choice-btn" data-choice-id="${choice.id}">
                    <span class="choice-label">${choice.id}.</span> ${choice.text}
                </button>
            `;
        });

        htmlContent += `</div><div id="feedback-area" style="margin-top: 20px;"></div></div>`;
        gameArea.innerHTML = htmlContent;
    }

    // Render Post-Answer Feedback
    function renderFeedback(isCorrect, feedbackMessage) {
        const feedbackArea = document.getElementById('feedback-area');
        if (!feedbackArea) return;

        // ล็อกตัวเลือก MCQ ทั้งหมดเพื่อป้องกันการกดซ้ำ
        const choiceBtns = gameArea.querySelectorAll('.choice-btn');
        choiceBtns.forEach(btn => btn.disabled = true);

        const statusClass = isCorrect ? 'feedback-success' : 'feedback-error';
        const statusTitle = isCorrect ? 'ถูกต้อง!' : 'ยังไม่ถูกต้อง';

        feedbackArea.innerHTML = `
            <div class="feedback-card ${statusClass}">
                <h4>${statusTitle}</h4>
                <p>${feedbackMessage}</p>
                <button class="next-step-btn primary-btn" style="margin-top: 15px;">ไปข้อถัดไป &rarr;</button>
            </div>
        `;
    }

    initEventListeners();

    return {
        navigateTo: switchView,
        showDashboard: function() { switchView('dashboard'); },
        renderInfo: renderInfoStep,
        renderMCQ: renderMCQStep,
        showFeedback: renderFeedback
    };
})();

// Explicit Window Export
if (typeof window !== 'undefined') {
    window.UIController = UIController;
}
