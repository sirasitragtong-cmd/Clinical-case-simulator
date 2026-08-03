/**
 * game-engine.js
 * Dynamic Step Sequencer Engine
 * Refactored by Antigravity | Reviewed & Approved by CTO
 * 
 * Architecture: Linear Traversal Graph ("Train Track Array")
 * - Flattens all Stages/Steps into a single ordered sequence at init time.
 * - Traversal is O(1) index increment — no if-else routing needed.
 * - Supports any number of stages/steps without code modification.
 */
const GameEngine = (function() {

    // ─── Private State ─────────────────────────────────────────
    let state = {
        caseData: null,
        stepSequence: [],       // Flattened linear track: [{ stageId, stepId }, ...]
        currentStepIndex: 0,    // Train position on the track
        currentScore: 0,
        maxPossibleScore: 0,
        isGameOver: false,
        isWaitingForNext: false, // Two-Phase lock (post-answer feedback)
        mistakeHistory: {}      // { stepId: [choiceId, ...] }
    };

    // ─── Step Sequence Builder ─────────────────────────────────
    // Scans caseJson.stages and flattens every step into a linear array.
    // Order is determined by the natural key order of stages → steps.
    function buildStepSequence(caseJson) {
        const sequence = [];
        const stages = caseJson.stages;

        if (!stages || typeof stages !== 'object') {
            console.error('[Sequencer Error] caseJson.stages is missing or invalid.');
            return sequence;
        }

        // Iterate stages in key order
        const stageKeys = Object.keys(stages);
        stageKeys.forEach(stageId => {
            const stage = stages[stageId];
            if (!stage || !stage.steps || typeof stage.steps !== 'object') {
                console.warn(`[Sequencer Warning] Stage "${stageId}" has no valid steps. Skipping.`);
                return;
            }

            // Iterate steps within this stage in key order
            const stepKeys = Object.keys(stage.steps);
            stepKeys.forEach(stepId => {
                sequence.push({ stageId, stepId });
            });
        });

        console.log(`[Sequencer Log] Built track with ${sequence.length} stations across ${stageKeys.length} stages.`);
        return sequence;
    }

    // ─── Read-only state snapshot (shared by getState + end screens) ───
    function getStateSnapshot() {
        return {
            currentStepIndex: state.currentStepIndex,
            totalSteps: state.stepSequence.length,
            currentScore: state.currentScore,
            maxPossibleScore: state.maxPossibleScore,
            isGameOver: state.isGameOver,
            isWaitingForNext: state.isWaitingForNext,
            currentStageId: state.currentStageId,
            currentStepId: state.currentStepId
        };
    }

    // ─── Render Pipeline ───────────────────────────────────────
    // Reads the current step reference and dispatches to the correct UI renderer.
    function renderCurrentStep() {
        if (state.isGameOver) return;

        const ref = state.stepSequence[state.currentStepIndex];
        if (!ref) {
            console.error(`[Render Error] No step reference at index ${state.currentStepIndex}.`);
            return;
        }

        // Retrieve actual step data from caseData
        const stage = state.caseData.stages[ref.stageId];
        if (!stage || !stage.steps) {
            console.error(`[Render Error] Stage "${ref.stageId}" not found in caseData.`);
            return;
        }

        const stepData = stage.steps[ref.stepId];
        if (!stepData) {
            console.error(`[Render Error] Step "${ref.stepId}" not found in stage "${ref.stageId}".`);
            return;
        }

        // Update internal navigation pointers (for evaluateAnswer compatibility)
        state.currentStageId = ref.stageId;
        state.currentStepId = ref.stepId;

        console.log(`[Engine Flow] Rendering station ${state.currentStepIndex + 1}/${state.stepSequence.length}: ${ref.stageId} → ${ref.stepId} (type: ${stepData.type})`);

        // Dispatch to appropriate UI renderer based on step type
        switch (stepData.type) {
            case 'info':
                UIController.renderInfo(stepData);
                break;
            case 'mcq':
                UIController.renderMCQ(stepData);
                break;
            case 'mcq_multi':
                UIController.renderMCQMulti(stepData);
                break;
            default:
                console.warn(`[Render Warning] Unknown step type "${stepData.type}" at index ${state.currentStepIndex}. Rendering as info.`);
                UIController.renderInfo(stepData);
                break;
        }
    }

    // ─── Game Initialization ───────────────────────────────────
    function initGame(caseJson) {
        // Schema Guard: Validate top-level structure
        if (!caseJson || typeof caseJson !== 'object' || !caseJson.case_id || !caseJson.stages) {
            console.error('[Engine Schema Error] Invalid case JSON structure.', caseJson);
            return false;
        }

        // Build the linear track from case data
        const sequence = buildStepSequence(caseJson);
        if (sequence.length === 0) {
            console.error('[Engine Schema Error] Step sequence is empty. Cannot start game.');
            return false;
        }

        // Calculate max possible score
        let maxScore = 0;
        sequence.forEach(ref => {
            const step = caseJson.stages[ref.stageId].steps[ref.stepId];
            if (step && (step.type === 'mcq' || step.type === 'mcq_multi') && step.point_value) {
                maxScore += step.point_value;
            }
        });

        // Reset all state
        state.caseData = caseJson;
        state.stepSequence = sequence;
        state.currentStepIndex = 0;
        state.currentScore = 0;
        state.maxPossibleScore = maxScore;
        state.isGameOver = false;
        state.isWaitingForNext = false;
        state.mistakeHistory = {};
        state.currentStageId = null;
        state.currentStepId = null;

        console.log(`[Engine Log] Game initialized for case: ${caseJson.case_id} | Total stations: ${sequence.length} | Max score: ${maxScore}`);

        // Render the first step
        renderCurrentStep();
        return true;
    }

    // ─── Answer Evaluation (MCQ) ───────────────────────────────
    function evaluateAnswer(selectedChoiceId) {
        // Guard: Prevent evaluation during invalid states
        if (state.isGameOver || state.isWaitingForNext) return;

        if (!state.caseData || !state.currentStageId || !state.currentStepId) {
            console.error('[Engine Schema Error] Missing navigation state context.');
            return;
        }

        const stepData = state.caseData.stages[state.currentStageId].steps[state.currentStepId];
        if (!stepData || !Array.isArray(stepData.choices)) {
            console.error(`[Engine Schema Error] Step data invalid for step: ${state.currentStepId}`);
            return;
        }

        const selectedChoice = stepData.choices.find(c => c.id === selectedChoiceId);
        if (!selectedChoice) {
            console.error(`[Engine Schema Error] Choice "${selectedChoiceId}" not found.`);
            return;
        }

        // Fatal Handling
        if (selectedChoice.is_fatal) {
            state.isGameOver = true;
            handleGameOver(stepData.feedback ? stepData.feedback.fatal_message : "Fatal Error Committed.");
            return;
        }

        // Standard MCQ Evaluation
        const isCorrect = (selectedChoiceId === stepData.correct_answer);
        const feedbackMsg = stepData.feedback
            ? (isCorrect ? stepData.feedback.correct : stepData.feedback.incorrect)
            : "";

        if (isCorrect) {
            state.currentScore += (stepData.point_value || 0);
            console.log(`[Score Update] +${stepData.point_value || 0} → Total: ${state.currentScore}/${state.maxPossibleScore}`);
        } else {
            if (!state.mistakeHistory[state.currentStepId]) {
                state.mistakeHistory[state.currentStepId] = [];
            }
            state.mistakeHistory[state.currentStepId].push(selectedChoiceId);
        }

        // Enter Two-Phase lock: wait for user to acknowledge feedback
        state.isWaitingForNext = true;
        UIController.showFeedback(isCorrect, feedbackMsg);
    }

    // ─── Answer Evaluation (Multi-select, partial credit) ──────
    // selectedIds: array of choice ids the learner submitted.
    // Scoring: point_per_correct for each correct id selected.
    // The UI caps selections at select_count, so "select everything"
    // cannot farm full marks.
    function evaluateMultiAnswer(selectedIds) {
        if (state.isGameOver || state.isWaitingForNext) return;

        if (!state.caseData || !state.currentStageId || !state.currentStepId) {
            console.error('[Engine Schema Error] Missing navigation state context.');
            return;
        }

        const stepData = state.caseData.stages[state.currentStageId].steps[state.currentStepId];
        if (!stepData || !Array.isArray(stepData.choices)) {
            console.error(`[Engine Schema Error] Step data invalid for step: ${state.currentStepId}`);
            return;
        }

        const selected = Array.isArray(selectedIds) ? selectedIds : [];
        if (selected.length === 0) return;

        // Fatal guard: any selected fatal choice ends the case immediately.
        const fatalPick = stepData.choices.find(c => c.is_fatal && selected.indexOf(c.id) !== -1);
        if (fatalPick) {
            state.isGameOver = true;
            handleGameOver(stepData.feedback ? stepData.feedback.fatal_message : 'Fatal Error Committed.');
            return;
        }

        const answerKey = Array.isArray(stepData.correct_answers)
            ? stepData.correct_answers
            : stepData.choices.filter(c => c.is_correct).map(c => c.id);

        const hits   = selected.filter(id => answerKey.indexOf(id) !== -1);
        const misses = selected.filter(id => answerKey.indexOf(id) === -1);

        const perCorrect = stepData.point_per_correct
            || Math.round((stepData.point_value || 0) / Math.max(answerKey.length, 1));
        const earned = hits.length * perCorrect;

        state.currentScore += earned;

        const allCorrect = hits.length === answerKey.length && misses.length === 0;
        const noneCorrect = hits.length === 0;

        if (!allCorrect) {
            if (!state.mistakeHistory[state.currentStepId]) {
                state.mistakeHistory[state.currentStepId] = [];
            }
            misses.forEach(id => state.mistakeHistory[state.currentStepId].push(id));
        }

        console.log(`[Score Update] ${hits.length}/${answerKey.length} correct → +${earned} → Total: ${state.currentScore}/${state.maxPossibleScore}`);

        const fb = stepData.feedback || {};
        const message = allCorrect ? fb.correct
                      : noneCorrect ? fb.incorrect
                      : (fb.partial || fb.incorrect);

        state.isWaitingForNext = true;
        UIController.showMultiFeedback({
            allCorrect,
            earned,
            possible: answerKey.length * perCorrect,
            hits,
            misses,
            answerKey,
            message
        });
    }

    // ─── Step Transition (Sequencer Core) ──────────────────────
    function proceedToNextStep() {
        if (state.isGameOver) return;

        // Release Two-Phase lock
        state.isWaitingForNext = false;

        const nextIndex = state.currentStepIndex + 1;

        if (nextIndex < state.stepSequence.length) {
            // Advance the train to the next station
            state.currentStepIndex = nextIndex;
            console.log(`[Engine Flow] Advancing to station ${nextIndex + 1}/${state.stepSequence.length}`);
            renderCurrentStep();
        } else {
            // End of track — case complete
            console.log(`[Engine Flow] All ${state.stepSequence.length} stations completed.`);
            completeCase();
        }
    }

    // ─── Case Completion ───────────────────────────────────────
    function completeCase() {
        console.log(`[Engine Complete] Case "${state.caseData.case_id}" finished.`);
        console.log(`[Final Score] ${state.currentScore}/${state.maxPossibleScore}`);
        console.log(`[Mistake Log]`, JSON.stringify(state.mistakeHistory));

        saveProgressToFirestore();

        state.isGameOver = true;
        if (window.UIController && typeof UIController.renderSummary === 'function') {
            UIController.renderSummary(getStateSnapshot());
        }
    }

    // ─── Game Over (Fatal) ─────────────────────────────────────
    function handleGameOver(fatalMessage) {
        console.warn(`[Engine Alert] GAME OVER: ${fatalMessage}`);
        saveProgressToFirestore();

        if (window.UIController && typeof UIController.renderGameOver === 'function') {
            UIController.renderGameOver(fatalMessage, getStateSnapshot());
        }
    }

    // ─── Firestore Persistence ─────────────────────────────────
    function saveProgressToFirestore() {
        const payload = {
            caseId: state.caseData ? state.caseData.case_id : 'case_001',
            finalScore: state.currentScore,
            maxScore: state.maxPossibleScore,
            completedSteps: state.currentStepIndex + 1,
            totalSteps: state.stepSequence.length,
            mistakeHistory: state.mistakeHistory,
            isFatal: state.isGameOver
        };

        console.log('[DB Sync] Persisting current state to Firestore...', payload);

        if (window.DBService && typeof window.DBService.saveCaseAttempt === 'function') {
            window.DBService.saveCaseAttempt(payload)
                .then(docRef => {
                    if (docRef) {
                        console.log('[DB Sync] Case attempt recorded in Firestore with Doc ID:', docRef.id);
                    }
                })
                .catch(err => {
                    console.error('[DB Sync Error] Failed to persist attempt:', err);
                });
        } else {
            console.warn('[DB Sync Warning] DBService.saveCaseAttempt unavailable.');
        }
    }

    // ─── Public API ────────────────────────────────────────────
    return {
        initGame,
        evaluateAnswer,
        evaluateMultiAnswer,
        proceedToNextStep,

        // Utility: Manual step override (for debugging / admin tools)
        setActiveStep: (stageId, stepId) => {
            const idx = state.stepSequence.findIndex(
                ref => ref.stageId === stageId && ref.stepId === stepId
            );
            if (idx !== -1) {
                state.currentStepIndex = idx;
                state.isWaitingForNext = false;
                renderCurrentStep();
            } else {
                console.error(`[Engine Error] Step "${stepId}" in stage "${stageId}" not found in sequence.`);
            }
        },

        // Utility: Read-only state snapshot (for UI bindings / debug)
        getState: getStateSnapshot
    };
})();

// Explicit Window Export
if (typeof window !== 'undefined') {
    window.GameEngine = GameEngine;
}
