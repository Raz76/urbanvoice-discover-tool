/* ============================================================
   URBANVOICE — APP.JS
   Central state manager and navigation controller.
   All screen transitions and step progression flow through here.
   ============================================================ */

'use strict';

// ----------------------------------------------------------------
// GLOBAL STATE
// ----------------------------------------------------------------
const STATE = {
  currentStep: 0,
  rawIdea: '',
  selectedAngle: null,
  selectedProblem: null,
  selectedSolution: null,
  selectedBrand: null,
  userEmail: '',
  angles: [],
  problems: [],
  solutions: [],
  validations: [],   // pre-computed array of 5 validation objects (one per solution)
  validation: null,  // the selected solution's validation (set on card click)
  brandOptions: [],
  emailUnlocked: false,
  anglesSkipped: false,
  nearMissNote: '',
};

const STEPS = [
  null,          // 0: landing
  'angles',      // 1: search + evaluate (or niche picker if too broad)
  'problems',    // 2: problem picker
  'solutions',   // 3: solution picker (validation pre-computed here)
  'validation',  // 4: validation detail — instant, data already cached
  'brand',       // 5: brand identity
  'summary',     // 6: final summary
];

// ----------------------------------------------------------------
// RATE LIMITING
// 3 runs/day without email, 10/day after email given
// ----------------------------------------------------------------
const FREE_DAILY_LIMIT  = 3;
const EMAIL_DAILY_LIMIT = 10;

function getStoredEmail() {
  return localStorage.getItem('uv_email') || '';
}

function saveStoredEmail(email) {
  localStorage.setItem('uv_email', email);
}

function getRateData() {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const saved = JSON.parse(localStorage.getItem('uv_rate') || '{}');
    if (saved.date !== today) return { date: today, count: 0 };
    return saved;
  } catch {
    return { date: today, count: 0 };
  }
}

function incrementRuns() {
  const r = getRateData();
  r.count++;
  localStorage.setItem('uv_rate', JSON.stringify(r));
}

function isRateLimited() {
  const r = getRateData();
  const limit = getStoredEmail() ? EMAIL_DAILY_LIMIT : FREE_DAILY_LIMIT;
  return r.count >= limit;
}

function getRateLimitInfo() {
  const r    = getRateData();
  const hasEmail = !!getStoredEmail();
  const limit = hasEmail ? EMAIL_DAILY_LIMIT : FREE_DAILY_LIMIT;
  return { count: r.count, limit, hasEmail, remaining: Math.max(0, limit - r.count) };
}

// ----------------------------------------------------------------
// NAVIGATION
// ----------------------------------------------------------------
function goTo(stepName) {
  const stepIndex = STEPS.indexOf(stepName);
  STATE.currentStep = stepIndex;
  updateProgressDots(stepIndex);
  renderScreen(stepName);
}

function goBack() {
  // If going back from problems and angles was skipped, return to landing
  // (there's no angles screen to go back to — the search was auto-sufficient)
  if (STATE.currentStep === STEPS.indexOf('problems') && STATE.anglesSkipped) {
    STATE.currentStep = 0;
    updateProgressDots(0);
    renderScreen('landing');
    return;
  }

  const prev = STATE.currentStep - 1;
  if (prev <= 0) {
    STATE.currentStep = 0;
    updateProgressDots(0);
    renderScreen('landing');
    return;
  }
  const prevStep = STEPS[prev];
  goTo(prevStep);
}

// ----------------------------------------------------------------
// PROGRESS DOTS
// ----------------------------------------------------------------
function updateProgressDots(activeIndex) {
  const bar       = document.getElementById('progress-bar');
  const container = document.getElementById('progress-dots');

  if (activeIndex <= 0) {
    bar.classList.add('hidden');
    return;
  }

  bar.classList.remove('hidden');
  container.innerHTML = '';

  for (let i = 1; i < STEPS.length; i++) {
    const dot = document.createElement('div');
    dot.className = 'progress-dot';
    if (i < activeIndex) dot.classList.add('done');
    if (i === activeIndex) dot.classList.add('active');
    container.appendChild(dot);
  }
}

// ----------------------------------------------------------------
// SCREEN ROUTER
// ----------------------------------------------------------------
function renderScreen(stepName) {
  const container = document.getElementById('screen-container');
  container.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));

  switch (stepName) {
    case null:
    case 'landing':   showLandingScreen();              break;
    case 'angles':    renderAnglesScreen(container);    break;
    case 'problems':  renderProblemsScreen(container);  break;
    case 'solutions': renderSolutionsScreen(container); break;
    case 'validation':renderValidationScreen(container);break;
    case 'brand':     renderBrandScreen(container);     break;
    case 'summary':   renderSummaryScreen(container);   break;
    default: console.warn('Unknown step:', stepName);
  }
}

// ----------------------------------------------------------------
// LANDING SCREEN
// ----------------------------------------------------------------
function showLandingScreen() {
  const screen    = document.getElementById('screen-landing');
  screen.classList.add('active');

  const input     = document.getElementById('idea-input');
  const btn       = document.getElementById('btn-discover');
  const charCount = document.getElementById('char-count');

  if (STATE.rawIdea) {
    input.value = STATE.rawIdea;
    charCount.textContent = STATE.rawIdea.length;
    btn.disabled = STATE.rawIdea.trim().length < 3;
  }

  // Show usage counter on landing
  renderUsageCounter();

  input.addEventListener('input', () => {
    charCount.textContent = input.value.length;
    btn.disabled = input.value.trim().length < 3;
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !btn.disabled) handleDiscover();
  });

  btn.addEventListener('click', handleDiscover);
}

function renderUsageCounter() {
  const info = getRateLimitInfo();
  const existing = document.getElementById('usage-counter');
  if (existing) existing.remove();

  const el = document.createElement('p');
  el.id = 'usage-counter';
  el.className = 'usage-counter';

  if (info.hasEmail) {
    el.textContent = `${info.remaining} of ${info.limit} searches remaining today`;
  } else {
    el.textContent = `${info.remaining} free search${info.remaining !== 1 ? 'es' : ''} remaining today`;
  }

  // Small reset link for testing — click to wipe daily count and stored email
  const resetLink = document.createElement('span');
  resetLink.textContent = ' [reset]';
  resetLink.style.cssText = 'font-size:0.75rem; color: var(--text-faint); cursor:pointer; text-decoration:underline; margin-left:6px;';
  resetLink.title = 'Reset usage counter (testing only)';
  resetLink.addEventListener('click', () => {
    localStorage.removeItem('uv_rate');
    localStorage.removeItem('uv_email');
    STATE.userEmail = '';
    STATE.emailUnlocked = false;
    renderUsageCounter();
  });
  el.appendChild(resetLink);

  const footer = document.querySelector('.landing-footer');
  if (footer) footer.insertAdjacentElement('beforebegin', el);
}

async function handleDiscover() {
  const input = document.getElementById('idea-input');
  const idea  = input.value.trim();
  if (!idea || idea.length < 3) return;

  if (isRateLimited()) {
    showRateLimitModal();
    return;
  }

  STATE.rawIdea = idea;
  incrementRuns();
  goTo('angles');
}

// ----------------------------------------------------------------
// RATE LIMIT MODAL
// ----------------------------------------------------------------
function showRateLimitModal() {
  const hasEmail = !!getStoredEmail();
  const existing = document.getElementById('rate-modal');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'rate-modal';
  overlay.className = 'modal-overlay';

  if (hasEmail) {
    overlay.innerHTML = `
      <div class="modal">
        <h2 class="modal-title">Daily Limit Reached</h2>
        <p class="modal-desc">
          You've used all ${EMAIL_DAILY_LIMIT} searches for today. Come back tomorrow —
          your limit resets at midnight.
        </p>
        <button class="btn-primary" id="btn-rate-close" style="width:100%;">Got It</button>
      </div>
    `;
  } else {
    overlay.innerHTML = `
      <div class="modal">
        <h2 class="modal-title">Daily Limit Reached</h2>
        <p class="modal-desc">
          You've used your ${FREE_DAILY_LIMIT} free searches for today.
          Enter your email to unlock ${EMAIL_DAILY_LIMIT} searches per day.
        </p>
        <div class="modal-field">
          <label for="rate-email-input">Your Email</label>
          <input type="email" id="rate-email-input" placeholder="your@email.com" />
        </div>
        <button class="btn-primary" id="btn-rate-unlock" style="width:100%; margin-top:8px;">Unlock More Searches</button>
        <p class="modal-note" style="margin-top:12px;">Or come back tomorrow for 3 more free searches.</p>
        <button class="btn-secondary" id="btn-rate-close" style="width:100%; margin-top:8px;">Maybe Later</button>
      </div>
    `;
  }

  document.body.appendChild(overlay);

  document.getElementById('btn-rate-close').addEventListener('click', () => overlay.remove());

  if (!hasEmail) {
    document.getElementById('btn-rate-unlock').addEventListener('click', () => {
      const emailInput = document.getElementById('rate-email-input');
      const email = emailInput.value.trim();
      if (!email || !email.includes('@')) {
        emailInput.style.borderColor = '#ff4444';
        return;
      }
      saveStoredEmail(email);
      STATE.userEmail = email;
      STATE.emailUnlocked = true;
      overlay.remove();
      // Reset today's count to 0 so they can proceed
      const r = getRateData();
      r.count = 0;
      localStorage.setItem('uv_rate', JSON.stringify(r));
      renderUsageCounter();
    });
  }
}

// ----------------------------------------------------------------
// INIT
// ----------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  // Pre-fill email from localStorage if returning user
  const storedEmail = getStoredEmail();
  if (storedEmail) {
    STATE.userEmail     = storedEmail;
    STATE.emailUnlocked = true;
  }
  showLandingScreen();
});
