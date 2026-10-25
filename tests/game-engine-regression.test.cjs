'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const engineSource = fs.readFileSync(path.join(root, 'js/game-engine.js'), 'utf8');
const caseText = fs.readFileSync(path.join(root, 'data/case_001.json'), 'utf8');
const copy = value => JSON.parse(JSON.stringify(value));

// Run the production engine against the real, unmodified case in an isolated VM.
// No Firebase SDK, network, real authentication or user records are accessible here.
function createHarness() {
  const clinicalCase = JSON.parse(caseText);
  const rendered = [];
  const feedback = [];
  const summaries = [];
  const failures = [];
  const attempts = [];
  let currentStep = null;
  const render = step => { currentStep = step; rendered.push(step); };
  const UIController = {
    renderInfo: render,
    renderMCQ: render,
    renderMCQMulti: render,
    showFeedback: (...args) => feedback.push(copy(args)),
    showMultiFeedback: result => feedback.push(copy(result)),
    renderSummary: state => summaries.push(copy(state)),
    renderGameOver: (message, state) => failures.push({ message, state: copy(state) }),
    resetDTPTag() {},
    getDTPTag: () => 5
  };
  const AuthService = { getCurrentUser: () => ({ uid: 'unit-test-user', isAnonymous: false }) };
  const DBService = {
    saveCaseAttempt(payload) {
      attempts.push(copy(payload));
      return Promise.resolve({ id: 'mock-attempt-' + attempts.length });
    }
  };
  const window = { UIController, AuthService, DBService };
  vm.runInNewContext(engineSource, {
    window, UIController, AuthService, DBService,
    console: { log() {}, warn() {}, error() {} }, Date
  }, { filename: 'game-engine.js' });

  const engine = window.GameEngine;
  function answerCorrectly() {
    const step = currentStep;
    if (step.type === 'mcq_multi') {
      engine.evaluateMultiAnswer(step.correct_answers || step.choices.filter(c => c.is_correct).map(c => c.id));
    } else if (step.type === 'mcq') {
      engine.evaluateAnswer(step.correct_answer);
    }
  }
  function completePerfectRun() {
    let guard = 0;
    while (!engine.getState().isGameOver && guard++ < 30) {
      answerCorrectly();
      engine.proceedToNextStep();
    }
    assert(guard <= 15, 'case should terminate after its 15 steps');
  }
  assert.equal(engine.initGame(clinicalCase), true);
  return { engine, clinicalCase, rendered, feedback, summaries, failures, attempts,
    step: () => currentStep, answerCorrectly, completePerfectRun };
}

test('real 15-step case completes at 3200/3200 without mutating clinical content', async () => {
  const h = createHarness();
  assert.equal(h.engine.getState().totalSteps, 15);
  assert.equal(h.engine.getState().maxPossibleScore, 3200);
  h.completePerfectRun();
  await Promise.resolve();
  assert.equal(h.rendered.length, 15);
  assert.equal(h.feedback.length, 13);
  assert.equal(h.summaries.length, 1);
  assert.equal(h.failures.length, 0);
  assert.equal(h.engine.getState().currentScore, 3200);
  assert.equal(h.engine.getState().isGameOver, true);
  assert.deepEqual(h.clinicalCase, JSON.parse(caseText));
});

test('repeated answer submission during feedback cannot add points twice', () => {
  const h = createHarness();
  h.engine.proceedToNextStep();
  h.engine.proceedToNextStep();
  assert.equal(h.step().type, 'mcq_multi');
  h.answerCorrectly();
  const score = h.engine.getState().currentScore;
  assert.equal(score, 400);
  assert.equal(h.engine.getState().isWaitingForNext, true);
  h.answerCorrectly();
  h.engine.evaluateMultiAnswer(h.step().choices.map(c => c.id));
  assert.equal(h.engine.getState().currentScore, score);
  assert.equal(h.feedback.length, 1);
  assert.equal(h.attempts.length, 0);
});

test('completion saves case identity, version, final score and telemetry once', async () => {
  const h = createHarness();
  h.completePerfectRun();
  h.engine.proceedToNextStep();
  h.engine.evaluateMultiAnswer(['A']);
  await Promise.resolve();
  assert.equal(h.attempts.length, 1);
  const saved = h.attempts[0];
  assert.equal(saved.caseId, 'case_001');
  assert.equal(saved.caseVersion, h.clinicalCase.case_version);
  assert.equal(saved.finalScore, 3200);
  assert.equal(saved.maxScore, 3200);
  assert.equal(saved.totalSteps, 15);
  assert.equal(saved.completedSteps, 15);
  assert.equal(saved.isFatal, false);
  assert.equal(saved.schemaVersion, 2);
  assert.equal(saved.gradedSteps, 13);
  assert.equal(saved.perfectSteps, 13);
  assert.equal(saved.wrongPicks, 0);
  assert.equal(saved.stepLog.length, 13);
  assert.equal(saved.dtpTag, 5);
  assert.equal(saved.dtpCorrect, true);
});

test('fatal choice ends the real case, saves a fatal attempt and prevents further play', async () => {
  const h = createHarness();
  let guard = 0;
  while (!h.step().choices?.some(c => c.is_fatal) && guard++ < 15) {
    h.answerCorrectly();
    h.engine.proceedToNextStep();
  }
  const fatal = h.step().choices.find(c => c.is_fatal);
  assert(fatal, 'real case must expose its authored fatal option');
  const before = h.engine.getState();
  h.engine.evaluateMultiAnswer([fatal.id]);
  await Promise.resolve();
  assert.equal(h.engine.getState().isGameOver, true);
  assert.equal(h.engine.getState().currentScore, before.currentScore);
  assert.equal(h.failures.length, 1);
  assert.equal(h.summaries.length, 0);
  assert.equal(h.attempts.length, 1);
  const saved = h.attempts[0];
  assert.equal(saved.caseId, h.clinicalCase.case_id);
  assert.equal(saved.caseVersion, h.clinicalCase.case_version);
  assert.equal(saved.finalScore, before.currentScore);
  assert.equal(saved.maxScore, 3200);
  assert.equal(saved.completedSteps, before.currentStepIndex + 1);
  assert.equal(saved.isFatal, true);
  h.engine.evaluateMultiAnswer([fatal.id]);
  h.engine.proceedToNextStep();
  assert.equal(h.attempts.length, 1);
  assert.equal(h.engine.getState().currentStepIndex, before.currentStepIndex);
});

test('restarting after completion resets score and reaches the first authored step', () => {
  const h = createHarness();
  h.completePerfectRun();
  assert.equal(h.engine.initGame(h.clinicalCase), true);
  const state = h.engine.getState();
  assert.equal(state.currentStepIndex, 0);
  assert.equal(state.currentScore, 0);
  assert.equal(state.isGameOver, false);
  assert.equal(state.isWaitingForNext, false);
  assert.equal(h.step().type, 'info');
  assert.equal(h.attempts.length, 1);
});
