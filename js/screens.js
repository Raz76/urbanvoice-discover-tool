/* ============================================================
   URBANVOICE — SCREENS.JS
   Renders each step screen into the #screen-container.
   All screens are built as DOM via JS (no extra HTML files needed).
   ============================================================ */

'use strict';

const BOOKING_LINK = 'https://urbanvoice.ai/free-call';

// ----------------------------------------------------------------
// HELPER: Create a standard screen wrapper with header + back nav
// ----------------------------------------------------------------
function createScreenShell(id, { showBack = true } = {}) {
  // Remove any previously injected dynamic screen with same id
  const existing = document.getElementById(id);
  if (existing) existing.remove();

  const screen = document.createElement('div');
  screen.id = id;
  screen.className = 'screen active';

  const header = document.createElement('header');
  header.className = 'screen-header';
  header.innerHTML = `
    <img src="Brand/logo_11.png" alt="UrbanVoice" class="screen-logo" />
    ${showBack ? `<button class="btn-back" id="btn-back-${id}">← Back</button>` : ''}
  `;
  screen.appendChild(header);

  if (showBack) {
    setTimeout(() => {
      const btn = document.getElementById(`btn-back-${id}`);
      if (btn) btn.addEventListener('click', goBack);
    }, 0);
  }

  return screen;
}

// ----------------------------------------------------------------
// HELPER: Loading state HTML
// ----------------------------------------------------------------
function loadingHTML(title, sub, steps = []) {
  const stepsHTML = steps.map(s => `<div class="loading-step">${s}</div>`).join('');
  return `
    <div class="loading-screen">
      <div class="loading-spinner"></div>
      <p class="loading-title">${title}</p>
      <p class="loading-sub">${sub}</p>
      ${steps.length ? `<div class="loading-steps">${stepsHTML}</div>` : ''}
    </div>
  `;
}

// ----------------------------------------------------------------
// HELPER: Error state
// ----------------------------------------------------------------
function errorHTML(message, retryFn) {
  setTimeout(() => {
    const btn = document.getElementById('btn-retry');
    if (btn && retryFn) btn.addEventListener('click', retryFn);
  }, 0);

  return `
    <div class="loading-screen">
      <p style="font-size: 2rem;">⚠️</p>
      <p class="loading-title">Something Went Wrong</p>
      <p class="loading-sub" style="color: #ff6666;">${message}</p>
      <button class="btn-primary" id="btn-retry" style="margin-top: 16px;">Try Again</button>
    </div>
  `;
}

// ----------------------------------------------------------------
// HELPER: Pill CSS class maps
// ----------------------------------------------------------------
function freqPillClass(freq) {
  return { 'Low': 'pill-freq-low', 'Medium': 'pill-freq-medium', 'High': 'pill-freq-high', 'Very High': 'pill-freq-veryhigh' }[freq] || 'pill-freq-medium';
}

function trendPillClass(trend) {
  return { 'Declining': 'pill-trend-declining', 'Stable': 'pill-trend-stable', 'Growing': 'pill-trend-growing', 'Growing Fast': 'pill-trend-fast' }[trend] || 'pill-trend-stable';
}

// ----------------------------------------------------------------
// SCREEN: ANGLES / SEARCH (Step 1)
// Searches first. If enough signal → skips straight to problems.
// If too broad → shows narrower niche picker grounded in search results.
// ----------------------------------------------------------------
async function renderAnglesScreen(container) {
  const screen = createScreenShell('screen-angles', { showBack: false });
  const body = document.createElement('div');
  body.className = 'screen-body';
  body.innerHTML = loadingHTML(
    'Searching for Real Problems',
    `Scanning Reddit, Quora, and forums for complaints about "${STATE.rawIdea}"…`,
    ['Running real searches', 'Reading the results', 'Evaluating signal quality']
  );
  screen.appendChild(body);
  container.appendChild(screen);

  try {
    // Navigating back — angles already fetched, just re-render without searching again
    if (STATE.angles.length > 0) {
      renderAnglesContent(body, null);
      const backBtn = document.createElement('button');
      backBtn.className = 'btn-back';
      backBtn.textContent = '← Back';
      backBtn.addEventListener('click', goBack);
      screen.querySelector('.screen-header').appendChild(backBtn);
      return;
    }

    const result = await fetchSearchAndEvaluate(STATE.rawIdea);

    if (result.vague) {
      // Input is too generic — ask for more direction
      renderVagueScreen(body, screen);
      const btn = document.createElement('button');
      btn.className = 'btn-back';
      btn.textContent = '← Back';
      btn.addEventListener('click', goBack);
      screen.querySelector('.screen-header').appendChild(btn);
      return;
    }

    if (result.sufficient) {
      // Enough real signal — go straight to problems, no angle picker needed
      STATE.problems      = result.problems;
      STATE.nearMissNote  = result.nearMissNote || '';
      STATE.anglesSkipped = true;
      goTo('problems');
    } else if (result.angles && result.angles.length > 0) {
      // Too broad — show narrower niches grounded in what was actually found
      STATE.angles        = result.angles;
      STATE.anglesSkipped = false;
      renderAnglesContent(body, result.reason);
      // Now show back button
      const btn = document.createElement('button');
      btn.className = 'btn-back';
      btn.textContent = '← Back';
      btn.addEventListener('click', goBack);
      screen.querySelector('.screen-header').appendChild(btn);
    } else {
      // Results found but only social/meta commentary — no practical problems
      renderNoResultsScreen(body, screen, result.reason);
    }
  } catch (err) {
    renderNoResultsScreen(body, screen);
  }
}

function renderNoResultsScreen(body, screen, reason) {
  const isSocialOnly = reason && reason.toLowerCase().includes('social');
  const title   = isSocialOnly ? 'No Practical Problems Found' : 'Not Enough Data Online';
  const desc    = isSocialOnly
    ? `We found online discussions about this topic, but they were mostly social commentary or opinions — not practical skill or knowledge gaps that a business could address. Try a more specific angle, like a technique, skill, or learning challenge within the topic.`
    : `We couldn't find enough public discussion about this topic to extract real problems. This usually means the topic is very niche, uses different terminology, or discussion happens in private communities.`;

  body.innerHTML = `
    <p class="screen-eyebrow">Step 1 of 6 — No Discussion Found</p>
    <h1 class="screen-title">${title}</h1>
    <p class="screen-desc">${desc}</p>
    <div class="refine-section">
      <p class="refine-label">Add more context and try again</p>
      <p style="font-size: 0.85rem; color: var(--text-faint); margin-bottom: 12px;">
        Describe your idea in more detail, or try a different angle. If your text is unrelated to the original idea, we'll start a fresh search.
      </p>
      <div class="refine-row">
        <input type="text" id="refine-input" class="refine-input"
          placeholder="e.g. 'home bakers who sell at markets' or try a completely different topic"
          autocomplete="off" />
        <button class="btn-primary" id="btn-refine">Search This →</button>
      </div>
    </div>
    <div style="margin-top: 20px; text-align: center;">
      <button class="btn-secondary" id="btn-try-different">← Try a Different Idea</button>
    </div>
  `;

  // Back to landing
  setTimeout(() => {
    document.getElementById('btn-try-different')?.addEventListener('click', () => {
      STATE.rawIdea = '';
      STATE.problems = [];
      STATE.angles = [];
      updateProgressDots(0);
      renderScreen('landing');
    });

    wireRefinementInput(body, screen);
  }, 0);
}

function renderVagueScreen(body, screen) {
  body.innerHTML = `
    <p class="screen-eyebrow">Step 1 of 6 — More Context Needed</p>
    <h1 class="screen-title">What Direction Are You Thinking?</h1>
    <p class="screen-desc">
      Your topic is quite broad on its own. Adding a bit more context helps us find real problems
      worth building around — for example, who you'd help, what they struggle with, or what type
      of business you're considering.
    </p>
    <div class="refine-section">
      <p class="refine-label">Tell us a bit more</p>
      <p style="font-size: 0.85rem; color: var(--text-faint); margin-bottom: 12px;">
        E.g. "bread baking for beginners who can't get the right texture" or "sourdough home bakers"
      </p>
      <div class="refine-row">
        <input type="text" id="refine-input" class="refine-input"
          placeholder="Add more detail about your idea or audience…"
          autocomplete="off" />
        <button class="btn-primary" id="btn-refine">Search This →</button>
      </div>
    </div>
    <div style="margin-top: 20px; text-align: center;">
      <button class="btn-secondary" id="btn-try-different">← Try a Different Idea</button>
    </div>
  `;

  setTimeout(() => {
    document.getElementById('btn-try-different')?.addEventListener('click', () => {
      STATE.rawIdea = '';
      STATE.problems = [];
      STATE.angles = [];
      STATE.nearMissNote = '';
      updateProgressDots(0);
      renderScreen('landing');
    });

    wireRefinementInput(body, screen);
  }, 0);
}

function renderAnglesContent(body, reason) {
  body.innerHTML = `
    <p class="screen-eyebrow">Step 1 of 6 — Narrow Your Focus</p>
    <h1 class="screen-title">Your Topic Is Broad — Let's Narrow It</h1>
    <p class="screen-desc">
      Your search returned discussions across too many different audiences to extract one clear problem.
      Pick a specific direction below, or add more context to narrow it down.
    </p>
    ${reason ? `<p style="font-size:0.8rem; color: var(--text-faint); font-style: italic; margin-bottom: 20px;">${reason}</p>` : ''}
    <div class="choice-grid" id="angles-grid"></div>
    <div style="margin-top: 28px; display: flex; justify-content: flex-end;">
      <button class="btn-primary" id="btn-angles-next" disabled>Search This Niche →</button>
    </div>

    <div class="refine-section">
      <p class="refine-label">Or add more context yourself</p>
      <p style="font-size: 0.85rem; color: var(--text-faint); margin-bottom: 12px;">
        Type more detail about what you're looking for. If it's unrelated to the original idea, we'll start fresh.
      </p>
      <div class="refine-row">
        <input type="text" id="refine-input" class="refine-input"
          placeholder="e.g. 'specifically people who sell baked goods from home'"
          autocomplete="off" />
        <button class="btn-secondary" id="btn-refine">Search This →</button>
      </div>
    </div>
  `;

  const grid = document.getElementById('angles-grid');
  STATE.angles.forEach((angle, i) => {
    const card = document.createElement('div');
    card.className = 'choice-card';
    card.innerHTML = `
      <div class="choice-card-number">${i + 1}</div>
      <div class="choice-card-content">
        <div class="choice-card-title">${angle.title}</div>
        <div class="choice-card-desc">${angle.description}</div>
      </div>
    `;
    card.addEventListener('click', () => {
      document.querySelectorAll('#angles-grid .choice-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      STATE.selectedAngle = angle.title;
      document.getElementById('btn-angles-next').disabled = false;
    });
    grid.appendChild(card);
  });

  document.getElementById('btn-angles-next').addEventListener('click', () => {
    if (!STATE.selectedAngle) return;
    STATE.problems = [];
    goTo('problems');
  });

  wireRefinementInput(body);
}

// ----------------------------------------------------------------
// Shared refinement input wiring
// Used on both "too broad" and "nothing found" screens
// ----------------------------------------------------------------
function wireRefinementInput(body, screen) {
  const btn   = document.getElementById('btn-refine');
  const input = document.getElementById('refine-input');
  if (!btn || !input) return;

  const submit = async () => {
    const refinement = input.value.trim();
    if (!refinement) return;

    // Show loading
    body.innerHTML = loadingHTML(
      'Searching With Your Context',
      'Checking relevance and running new searches…',
      ['Evaluating your input', 'Running search', 'Analyzing results']
    );

    try {
      const isRelated = await checkRefinementRelatedness(STATE.rawIdea, refinement);

      if (isRelated) {
        // Refine the existing idea
        STATE.rawIdea = `${STATE.rawIdea} ${refinement}`;
      } else {
        // Completely new idea — reset state
        STATE.rawIdea       = refinement;
        STATE.selectedAngle = null;
        STATE.selectedProblem = null;
        STATE.selectedSolution = null;
        STATE.selectedBrand = null;
        STATE.solutions     = [];
        STATE.validation    = null;
        STATE.brandOptions  = [];
      }

      // Clear search caches and re-run
      STATE.angles      = [];
      STATE.problems    = [];
      STATE.nearMissNote = '';

      const result = await fetchSearchAndEvaluate(STATE.rawIdea);

      if (result.vague) {
        renderVagueScreen(body, screen);
        return;
      }

      if (result.sufficient) {
        STATE.problems      = result.problems;
        STATE.nearMissNote  = result.nearMissNote || '';
        STATE.anglesSkipped = true;
        goTo('problems');
      } else {
        STATE.angles        = result.angles;
        STATE.anglesSkipped = false;
        renderAnglesContent(body, result.reason);
      }

    } catch (err) {
      if (err.code === 'TOO_FEW') {
        renderNoResultsScreen(body, screen);
      } else {
        body.innerHTML = errorHTML(err.message, () => wireRefinementInput(body, screen));
      }
    }
  };

  btn.addEventListener('click', submit);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
}

// ----------------------------------------------------------------
// SCREEN: PROBLEMS (Step 2)
// ----------------------------------------------------------------
async function renderProblemsScreen(container) {
  const screen = createScreenShell('screen-problems');
  const body = document.createElement('div');
  body.className = 'screen-body';

  // Problems may already be set (came straight from initial search evaluation)
  if (STATE.problems.length > 0) {
    screen.appendChild(body);
    container.appendChild(screen);
    renderProblemsContent(body);
    return;
  }

  // User picked a specific angle — search + extract for that niche
  body.innerHTML = loadingHTML(
    'Searching for Real Problems',
    `Scanning discussions about "${STATE.selectedAngle}"…`,
    ['Searching Reddit', 'Searching Quora', 'Analyzing patterns']
  );
  screen.appendChild(body);
  container.appendChild(screen);

  try {
    STATE.problems = await fetchProblems(STATE.selectedAngle);
    renderProblemsContent(body);
  } catch (err) {
    body.innerHTML = errorHTML(err.message, () => goTo('problems'));
  }
}

function renderProblemsContent(body) {
  const nearMissBanner = STATE.nearMissNote ? `
    <div class="near-miss-banner">
      <p class="near-miss-title">We found related problems</p>
      <p class="near-miss-desc">We didn't find direct evidence for exactly what you described, but real online discussion exists around closely related problems: <em>${STATE.nearMissNote}</em></p>
    </div>
  ` : '';

  body.innerHTML = `
    <p class="screen-eyebrow">Step 2 of 6 — Detected Pain Points</p>
    <h1 class="screen-title">What Are People Actually Complaining About?</h1>
    <p class="screen-desc">
      These are real pain points extracted from online discussions — not business ideas.
      Choose the one that resonates most with you. The next step will map business
      opportunities around it.
    </p>
    ${nearMissBanner}
    <div class="choice-grid" id="problems-grid"></div>
    <div style="margin-top: 28px; display: flex; justify-content: flex-end;">
      <button class="btn-primary" id="btn-problems-next" disabled>
        I Want to Solve This →
      </button>
    </div>
  `;

  const grid = document.getElementById('problems-grid');

  STATE.problems.forEach((problem, i) => {
    const quotesHTML = (problem.quotes || []).slice(0, 2)
      .map(q => `<div class="problem-quote">"${q}"</div>`)
      .join('');
    const sourceBadges = (problem.sources || [])
      .map(s => `<span class="badge badge-${s}">${s}</span>`)
      .join('');

    const card = document.createElement('div');
    card.className = 'choice-card';
    card.innerHTML = `
      <div class="choice-card-number">${i + 1}</div>
      <div class="choice-card-content">
        <div class="choice-card-title">${problem.title}</div>
        <div class="choice-card-desc">${problem.description}</div>
        ${quotesHTML ? `<div class="problem-quotes">${quotesHTML}</div>` : ''}
        <div class="problem-meta">
          <span class="pill ${freqPillClass(problem.frequency)}">${problem.frequency} frequency</span>
          <span class="pill ${trendPillClass(problem.trend)}">${problem.trend}</span>
          <span style="flex: 1;"></span>
          ${sourceBadges}
        </div>
      </div>
    `;
    card.addEventListener('click', () => {
      document.querySelectorAll('#problems-grid .choice-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      STATE.selectedProblem = problem;
      document.getElementById('btn-problems-next').disabled = false;
    });
    grid.appendChild(card);
  });

  document.getElementById('btn-problems-next').addEventListener('click', () => {
    if (!STATE.selectedProblem) return;
    // Reset solutions + validations so a different problem always gets fresh results
    STATE.solutions = [];
    STATE.validations = [];
    STATE.validation = null;
    goTo('solutions');
  });
}

// ----------------------------------------------------------------
// SCREEN: SOLUTIONS (Step 3)
// ----------------------------------------------------------------
async function renderSolutionsScreen(container) {
  const screen = createScreenShell('screen-solutions');
  const body = document.createElement('div');
  body.className = 'screen-body';
  body.innerHTML = loadingHTML(
    'Finding and Validating Business Ideas',
    'Researching the market and scoring each opportunity…',
    ['Analyzing the problem', 'Brainstorming ideas', 'Running market research', 'Scoring each opportunity']
  );
  screen.appendChild(body);
  container.appendChild(screen);
  await loadAndRenderSolutions(body);
}

async function loadAndRenderSolutions(body) {
  try {
    if (STATE.solutions.length === 0) {
      STATE.solutions = await fetchSolutions(STATE.selectedProblem, STATE.selectedAngle);
    }
    if (STATE.validations.length === 0) {
      STATE.validations = await fetchValidationForAll(
        STATE.solutions, STATE.selectedProblem, STATE.selectedAngle
      );
    }
    renderSolutionsContent(body);
  } catch (err) {
    body.innerHTML = errorHTML(err.message, () => goTo('solutions'));
  }
}

function renderSolutionsContent(body) {
  body.innerHTML = `
    <p class="screen-eyebrow">Step 3 of 6 — Business Ideas</p>
    <h1 class="screen-title">Here's What You Could Build</h1>
    <p class="screen-desc">
      Five research-based business ideas matched to the problem you chose. Each is
      pre-validated against real market data. Results are indicative, not guaranteed.
      Pick the idea that fits you best.
    </p>
    <div class="choice-grid" id="solutions-grid"></div>
    <div style="margin-top: 28px; display: flex; justify-content: flex-end;">
      <button class="btn-primary" id="btn-solutions-next" disabled>
        See Full Validation →
      </button>
    </div>
  `;

  const grid = document.getElementById('solutions-grid');

  // Inject low-score warning if all validation scores are below 7
  const allLow = STATE.validations.length > 0 &&
    STATE.validations.every(v => (v?.opportunityScore ?? 0) < 7);

  if (allLow) {
    const callout = document.createElement('div');
    callout.className = 'low-scores-callout';
    callout.innerHTML = `
      <p class="low-scores-title">⚠️ Low Market Opportunity Detected</p>
      <p class="low-scores-desc">
        All business ideas for this problem score below 7/10 based on current market data.
        This doesn't mean the idea is impossible — but the research signals limited commercial
        potential right now. You may get better results by going back and picking a different problem.
      </p>
      <button class="btn-secondary" id="btn-try-different-problem">← Try a Different Problem</button>
    `;
    grid.insertAdjacentElement('afterend', callout);
    setTimeout(() => {
      document.getElementById('btn-try-different-problem')?.addEventListener('click', goBack);
    }, 0);
  }

  STATE.solutions.forEach((solution, i) => {
    const v = STATE.validations[i];
    const score = v?.opportunityScore ?? '—';
    const scoreColor = score >= 7 ? '#50c878' : score >= 5 ? '#f0c040' : '#9090cc';
    const card = document.createElement('div');
    card.className = 'choice-card';
    card.innerHTML = `
      <div class="choice-card-number">${i + 1}</div>
      <div class="choice-card-content">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; gap: 12px;">
          <div class="choice-card-title">${solution.title}</div>
          <div style="font-family: var(--font-head); font-size: 1.4rem; color: ${scoreColor}; flex-shrink: 0;">${score}<span style="font-size: 0.9rem; color: var(--text-faint);">/10</span></div>
        </div>
        <div class="choice-card-desc">${solution.description}</div>
      </div>
    `;
    card.addEventListener('click', () => {
      document.querySelectorAll('#solutions-grid .choice-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      STATE.selectedSolution = solution;
      STATE.validation = STATE.validations[i]; // set pre-computed validation for this solution
      document.getElementById('btn-solutions-next').disabled = false;
    });
    grid.appendChild(card);
  });

  document.getElementById('btn-solutions-next').addEventListener('click', () => {
    if (!STATE.selectedSolution) return;
    goTo('validation');
  });
}

// ----------------------------------------------------------------
// SCREEN: VALIDATION RESULT (Step 5)
// ----------------------------------------------------------------
function renderValidationScreen(container) {
  const screen = createScreenShell('screen-validation');
  const body = document.createElement('div');
  body.className = 'screen-body';

  const v = STATE.validation;
  const barWidth = Math.round((v.opportunityScore / 10) * 100);
  const altItems = (v.currentAlternatives || [])
    .map(a => `<li style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 6px;">${a}</li>`)
    .join('');

  body.innerHTML = `
    <p class="screen-eyebrow">Step 4 of 6 — Validation Report</p>
    <h1 class="screen-title">Here's the Market Reality</h1>
    <p class="screen-desc">
      Based on real data from G2, Product Hunt, Reddit, and pricing pages — not guesses.
    </p>

    <div class="card" style="margin-bottom: 20px;">
      <p style="font-size: 0.72rem; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-faint); margin-bottom: 12px;">Opportunity Score</p>
      <div class="opp-score">
        <div class="opp-score-value">${v.opportunityScore}<span style="font-size: 1.2rem; color: var(--text-muted);">/10</span></div>
        <div class="opp-score-bar">
          <div class="opp-score-fill" id="score-fill" style="width: 0%;"></div>
        </div>
      </div>
    </div>

    <div class="validation-grid">
      <div class="val-stat">
        <div class="val-stat-label">Monetizable</div>
        <div class="val-stat-value">${v.monetizable ? '✓ Yes' : '✗ Unclear'}</div>
      </div>
      <div class="val-stat">
        <div class="val-stat-label">Willingness to Pay</div>
        <div class="val-stat-value">${v.willingnessToPay}</div>
      </div>
      <div class="val-stat" style="grid-column: 1 / -1;">
        <div class="val-stat-label">Estimated Price Range</div>
        <div class="val-stat-value">${v.estimatedPriceRange}</div>
      </div>
    </div>

    ${altItems ? `
    <div style="margin-top: 20px;">
      <p style="font-size: 0.72rem; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-faint); margin-bottom: 10px;">What People Use Instead</p>
      <ul style="list-style: disc; padding-left: 20px;">${altItems}</ul>
    </div>` : ''}

    <div class="val-verdict">${v.verdict}</div>

    <div class="consult-banner">
      <span>Want someone to build this for you?</span>
      <a href="${BOOKING_LINK}" target="_blank" class="consult-banner-link">Book a Free Strategy Call →</a>
    </div>

    <div style="margin-top: 32px; display: flex; justify-content: flex-end;">
      <button class="btn-primary" id="btn-validation-next">Build My Brand Identity →</button>
    </div>
  `;

  screen.appendChild(body);
  container.appendChild(screen);

  // Animate score bar after paint
  requestAnimationFrame(() => {
    setTimeout(() => {
      const fill = document.getElementById('score-fill');
      if (fill) fill.style.width = `${barWidth}%`;
    }, 80);
  });

  document.getElementById('btn-validation-next').addEventListener('click', () => {
    goTo('brand');
  });
}

// ----------------------------------------------------------------
// SCREEN: BRAND (Step 6)
// ----------------------------------------------------------------
async function renderBrandScreen(container) {
  const screen = createScreenShell('screen-brand');
  const body = document.createElement('div');
  body.className = 'screen-body';
  body.innerHTML = loadingHTML(
    'Creating Brand Identities',
    'Building 3 distinct brand options for your idea…',
    ['Analyzing your market position', 'Crafting brand voices', 'Writing taglines']
  );
  screen.appendChild(body);
  container.appendChild(screen);

  try {
    if (STATE.brandOptions.length === 0) {
      STATE.brandOptions = await fetchBrandOptions(
        STATE.selectedProblem,
        STATE.selectedSolution,
        STATE.selectedAngle
      );
    }
    renderBrandContent(body);
  } catch (err) {
    body.innerHTML = errorHTML(err.message, () => goTo('brand'));
  }
}

function renderBrandContent(body) {
  body.innerHTML = `
    <p class="screen-eyebrow">Step 5 of 6 — Brand Identity</p>
    <h1 class="screen-title">What Should Your Brand Be?</h1>
    <p class="screen-desc">
      Three AI-suggested directions based on your idea. Pick one, enter your own, or
      skip this step — you can always name your brand later.
    </p>
    <div class="brand-cards" id="brand-grid"></div>

    <!-- Own brand input (hidden until toggled) -->
    <div id="own-brand-section" style="display: none; margin-top: 16px;">
      <div class="own-brand-card">
        <label class="own-brand-label" for="own-brand-input">Your Brand Name</label>
        <input type="text" id="own-brand-input" class="own-brand-input" placeholder="e.g. LaunchPad, Nestly, Taskr…" maxlength="60" autocomplete="off" />
        <p class="own-brand-hint">Just the name is fine — we'll note it in your report.</p>
      </div>
    </div>

    <div class="brand-actions">
      <button class="btn-secondary" id="btn-own-brand">Use My Own Brand Name</button>
      <div style="display: flex; gap: 12px; align-items: center;">
        <button class="btn-secondary" id="btn-brand-skip">Skip for Now</button>
        <button class="btn-primary" id="btn-brand-next" disabled>See My Full Report →</button>
      </div>
    </div>
  `;

  const grid = document.getElementById('brand-grid');

  STATE.brandOptions.forEach(brand => {
    const card = document.createElement('div');
    card.className = 'brand-card';
    card.innerHTML = `
      <div class="brand-name">${brand.name}</div>
      <div class="brand-meta">
        <strong style="color: var(--text); font-size: 0.9rem;">"${brand.tagline}"</strong><br>
        <span>For: ${brand.targetAudience}</span><br>
        <span style="color: var(--text-faint); font-size: 0.82rem; display: block; margin-top: 4px;">${brand.positioning}</span>
      </div>
    `;
    card.addEventListener('click', () => {
      // Deselect all cards and clear own-brand input
      document.querySelectorAll('#brand-grid .brand-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      STATE.selectedBrand = brand;
      // Hide own-brand section if open
      document.getElementById('own-brand-section').style.display = 'none';
      document.getElementById('btn-own-brand').textContent = 'Use My Own Brand Name';
      document.getElementById('btn-brand-next').disabled = false;
    });
    grid.appendChild(card);
  });

  // Toggle own brand input
  document.getElementById('btn-own-brand').addEventListener('click', () => {
    const section = document.getElementById('own-brand-section');
    const isOpen = section.style.display !== 'none';
    if (isOpen) {
      section.style.display = 'none';
      document.getElementById('btn-own-brand').textContent = 'Use My Own Brand Name';
      // Clear custom selection if a card is selected
      if (!document.querySelector('#brand-grid .brand-card.selected')) {
        STATE.selectedBrand = null;
        document.getElementById('btn-brand-next').disabled = true;
      }
    } else {
      // Deselect cards
      document.querySelectorAll('#brand-grid .brand-card').forEach(c => c.classList.remove('selected'));
      section.style.display = 'block';
      document.getElementById('btn-own-brand').textContent = '← Back to Suggestions';
      document.getElementById('own-brand-input').focus();
    }
  });

  // Enable next when own-brand input has text
  document.getElementById('own-brand-input').addEventListener('input', (e) => {
    const val = e.target.value.trim();
    if (val.length > 0) {
      STATE.selectedBrand = { name: val, tagline: '', targetAudience: '', positioning: 'Custom brand' };
      document.getElementById('btn-brand-next').disabled = false;
    } else {
      STATE.selectedBrand = null;
      document.getElementById('btn-brand-next').disabled = true;
    }
  });

  // Skip — set brand to null and proceed
  document.getElementById('btn-brand-skip').addEventListener('click', () => {
    STATE.selectedBrand = null;
    goTo('summary');
  });

  document.getElementById('btn-brand-next').addEventListener('click', () => {
    if (!STATE.selectedBrand) return;
    goTo('summary');
  });
}

// ----------------------------------------------------------------
// SCREEN: SUMMARY (Step 7)
// ----------------------------------------------------------------
function renderSummaryScreen(container) {
  const screen = createScreenShell('screen-summary', { showBack: true });
  const body = document.createElement('div');
  body.className = 'screen-body';

  const v = STATE.validation;

  body.innerHTML = `
    <p class="screen-eyebrow">Step 6 of 6 — Your Discovery Report</p>
    <h1 class="screen-title">You're Ready to Build</h1>
    <p class="screen-desc">
      Here's everything you discovered. This is your validated business blueprint.
    </p>

    <div class="card">
      <div class="summary-section">
        <div class="summary-label">Your Idea</div>
        <div class="summary-value">${STATE.rawIdea}</div>
      </div>
      ${STATE.selectedAngle ? `
      <div class="summary-section">
        <div class="summary-label">Niche</div>
        <div class="summary-value">${STATE.selectedAngle}</div>
      </div>` : ''}
      <div class="summary-section">
        <div class="summary-label">Problem to Solve</div>
        <div class="summary-value">
          <strong>${STATE.selectedProblem?.title || '—'}</strong><br>
          <span style="color: var(--text-muted); font-size: 0.9rem;">${STATE.selectedProblem?.description || ''}</span>
        </div>
      </div>
      <div class="summary-section">
        <div class="summary-label">Business Idea</div>
        <div class="summary-value">
          <strong>${STATE.selectedSolution?.title || '—'}</strong><br>
          <span style="color: var(--text-muted); font-size: 0.9rem;">${STATE.selectedSolution?.description || ''}</span>
        </div>
      </div>
      ${v ? `
      <div class="summary-section">
        <div class="summary-label">Opportunity Score</div>
        <div class="summary-value" style="font-family: var(--font-head); font-size: 1.8rem; color: var(--accent);">${v.opportunityScore}<span style="font-size: 1rem; color: var(--text-muted);">/10</span></div>
      </div>
      <div class="summary-section">
        <div class="summary-label">Estimated Price Range</div>
        <div class="summary-value">${v.estimatedPriceRange}</div>
      </div>
      <div class="summary-section">
        <div class="summary-label">Validation Verdict</div>
        <div class="val-verdict" style="margin-top: 8px;">${v.verdict}</div>
      </div>` : ''}
      ${STATE.selectedBrand ? `
      <div class="summary-section">
        <div class="summary-label">Brand Identity</div>
        <div class="summary-value">
          <span style="font-family: var(--font-head); font-size: 1.6rem; color: var(--accent);">${STATE.selectedBrand.name}</span><br>
          <em style="color: var(--text-muted);">"${STATE.selectedBrand.tagline}"</em><br>
          <span style="color: var(--text-faint); font-size: 0.85rem;">${STATE.selectedBrand.positioning}</span>
        </div>
      </div>` : ''}
    </div>

    <div class="consult-cta">
      <p class="consult-cta-eyebrow">Work With Us</p>
      <h2 class="consult-cta-title">Ready to Turn This Into a Real Business?</h2>
      <ul class="consult-cta-list">
        <li>We validate your idea further and map the full product roadmap</li>
        <li>We design, build, and launch your no-code MVP in weeks — not months</li>
        <li>You stay focused on customers. We handle the rest.</li>
      </ul>
      <a href="${BOOKING_LINK}" target="_blank" class="btn-cta-primary consult-cta-btn">Book a Free Strategy Call →</a>
      <p class="consult-cta-note">30 minutes. No pitch. Just a clear plan for your next steps.</p>
    </div>

    <div class="cta-block">
      <button class="btn-cta-primary" id="btn-start-over">↺ Discover Another Idea</button>
      <button class="btn-download" id="btn-download-pdf">⬇ Download PDF Report</button>
    </div>

    <!-- PDF email gate (shown inline if email not yet collected) -->
    <div id="pdf-gate" class="email-gate" style="margin-top: 24px; display: none;">
      <div class="email-gate-title">Get Your Full PDF Report</div>
      <p class="email-gate-sub">
        Enter your email to download your validated business blueprint as a PDF.
        You'll only need to do this once.
      </p>
      <div class="email-gate-row">
        <input type="email" id="pdf-email-input" class="email-gate-input" placeholder="your@email.com" autocomplete="email" />
        <button class="btn-primary" id="btn-pdf-email-submit">Send My Report →</button>
      </div>
    </div>
  `;

  screen.appendChild(body);
  container.appendChild(screen);

  document.getElementById('btn-start-over').addEventListener('click', () => {
    Object.assign(STATE, {
      currentStep: 0,
      rawIdea: '', selectedAngle: null, selectedProblem: null,
      selectedSolution: null, selectedBrand: null, userEmail: '',
      angles: [], problems: [], solutions: [], validations: [], validation: null,
      brandOptions: [], emailUnlocked: false, anglesSkipped: false,
      nearMissNote: '',
    });
    updateProgressDots(0);
    renderScreen('landing');
  });

  document.getElementById('btn-download-pdf').addEventListener('click', () => {
    const savedEmail = getStoredEmail();
    if (savedEmail) {
      generatePDF();
    } else {
      // Show inline email gate
      document.getElementById('pdf-gate').style.display = 'block';
      document.getElementById('btn-download-pdf').style.display = 'none';
      document.getElementById('pdf-email-input').focus();
    }
  });

  // Wire email gate submit
  setTimeout(() => {
    const submitBtn   = document.getElementById('btn-pdf-email-submit');
    const emailInput  = document.getElementById('pdf-email-input');
    if (!submitBtn) return;

    const submit = () => {
      const email = emailInput.value.trim();
      if (!email || !email.includes('@')) {
        emailInput.style.borderColor = '#ff4444';
        return;
      }
      saveStoredEmail(email);
      STATE.userEmail     = email;
      STATE.emailUnlocked = true;
      document.getElementById('pdf-gate').style.display = 'none';
      generatePDF();
    };

    submitBtn.addEventListener('click', submit);
    emailInput.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
  }, 0);
}

// ----------------------------------------------------------------
// PDF GENERATION — opens a formatted print window
// ----------------------------------------------------------------
function generatePDF() {
  const v = STATE.validation;
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const altList = v?.currentAlternatives?.length
    ? v.currentAlternatives.map(a => `<li>${a}</li>`).join('')
    : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>UrbanVoice Report — ${STATE.rawIdea}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
      font-size: 12pt;
      color: #1a1a2e;
      padding: 48px;
      max-width: 760px;
      margin: 0 auto;
    }
    .header {
      border-bottom: 3px solid #ff6a00;
      padding-bottom: 20px;
      margin-bottom: 32px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .brand { font-size: 22pt; font-weight: 900; letter-spacing: 0.04em; color: #ff6a00; }
    .report-meta { font-size: 9pt; color: #888; text-align: right; }
    .section {
      margin-bottom: 28px;
      padding-bottom: 24px;
      border-bottom: 1px solid #e8e8f0;
    }
    .section:last-of-type { border-bottom: none; }
    .label {
      font-size: 8pt;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #999;
      margin-bottom: 6px;
    }
    .value { font-size: 11pt; color: #1a1a2e; line-height: 1.6; }
    .value strong { font-size: 12pt; }
    .score {
      font-size: 32pt;
      font-weight: 900;
      color: #ff6a00;
      line-height: 1;
    }
    .verdict {
      background: #fff5ee;
      border-left: 4px solid #ff6a00;
      padding: 14px 18px;
      font-style: italic;
      color: #333;
      margin-top: 8px;
      border-radius: 0 6px 6px 0;
    }
    .brand-name {
      font-size: 24pt;
      font-weight: 900;
      color: #ff6a00;
      letter-spacing: 0.06em;
    }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 8px; }
    .stat { background: #f5f5fa; padding: 14px; border-radius: 6px; }
    .stat-label { font-size: 8pt; font-weight: 700; color: #999; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 4px; }
    .stat-value { font-size: 11pt; font-weight: 600; color: #1a1a2e; }
    ul { padding-left: 20px; margin-top: 6px; }
    li { margin-bottom: 4px; font-size: 10pt; color: #555; }
    .footer {
      margin-top: 48px;
      padding-top: 16px;
      border-top: 1px solid #e8e8f0;
      font-size: 8pt;
      color: #bbb;
      text-align: center;
    }
    @media print {
      body { padding: 0; }
      @page { margin: 2cm; }
    }
  </style>
</head>
<body>

  <div class="header">
    <div class="brand">URBANVOICE</div>
    <div class="report-meta">
      Problem Discovery Report<br>
      Generated ${date}
    </div>
  </div>

  <div class="section">
    <div class="label">Idea Explored</div>
    <div class="value"><strong>${STATE.rawIdea}</strong></div>
    ${STATE.selectedAngle ? `<div class="value" style="margin-top:6px; color:#888;">Niche: ${STATE.selectedAngle}</div>` : ''}
  </div>

  <div class="section">
    <div class="label">Problem Identified</div>
    <div class="value">
      <strong>${STATE.selectedProblem?.title || '—'}</strong><br>
      ${STATE.selectedProblem?.description || ''}
    </div>
    ${STATE.selectedProblem?.quotes?.length ? `
    <div style="margin-top: 12px;">
      ${STATE.selectedProblem.quotes.map(q => `<div style="font-style:italic; color:#666; font-size:10pt; margin-bottom:6px; padding-left:12px; border-left:3px solid #ff6a00;">"${q}"</div>`).join('')}
    </div>` : ''}
  </div>

  <div class="section">
    <div class="label">Business Idea</div>
    <div class="value">
      <strong>${STATE.selectedSolution?.title || '—'}</strong><br>
      ${STATE.selectedSolution?.description || ''}
    </div>
    ${STATE.selectedSolution?.score ? `<div style="margin-top:8px; font-size:9pt; color:#888;">Opportunity score: <strong>${STATE.selectedSolution.score}/10</strong></div>` : ''}
  </div>

  ${v ? `
  <div class="section">
    <div class="label">Market Validation</div>
    <div class="score">${v.opportunityScore}<span style="font-size:16pt; color:#999;">/10</span></div>
    <div class="grid" style="margin-top: 16px;">
      <div class="stat">
        <div class="stat-label">Monetizable</div>
        <div class="stat-value">${v.monetizable ? '✓ Yes' : '✗ Unclear'}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Willingness to Pay</div>
        <div class="stat-value">${v.willingnessToPay}</div>
      </div>
      <div class="stat" style="grid-column: 1 / -1;">
        <div class="stat-label">Estimated Price Range</div>
        <div class="stat-value">${v.estimatedPriceRange}</div>
      </div>
    </div>
    ${altList ? `
    <div style="margin-top:16px;">
      <div class="label">Current Alternatives</div>
      <ul>${altList}</ul>
    </div>` : ''}
    <div class="verdict">${v.verdict}</div>
  </div>` : ''}

  ${STATE.selectedBrand ? `
  <div class="section">
    <div class="label">Brand Identity</div>
    <div class="brand-name">${STATE.selectedBrand.name}</div>
    <div class="value" style="margin-top: 8px;">
      <em>"${STATE.selectedBrand.tagline}"</em><br>
      <span style="color:#888; font-size:10pt;">For: ${STATE.selectedBrand.targetAudience}</span><br>
      <span style="color:#666; font-size:10pt; margin-top:4px; display:block;">${STATE.selectedBrand.positioning}</span>
    </div>
  </div>` : ''}

  <div class="section">
    <div class="label">What's Next?</div>
    <p style="margin-bottom:12px; line-height:1.7; font-size:11pt;">
      You've identified a real problem, chosen a business model, and validated the market.
      Most people stop here. UrbanVoice helps you go from this blueprint to a live product.
    </p>
    <ul style="margin-bottom:20px;">
      <li>Full product roadmap and feature prioritization</li>
      <li>No-code MVP design and build — live in weeks, not months</li>
      <li>Launch strategy and first-customer acquisition</li>
    </ul>
    <div style="background:#fff5ee; border:2px solid #ff6a00; border-radius:8px; padding:20px; text-align:center;">
      <div style="font-size:12pt; font-weight:700; color:#1a1a2e; margin-bottom:6px;">Book a Free 30-Minute Strategy Call</div>
      <div style="font-size:10pt; color:#888; margin-bottom:12px;">No pitch. No pressure. Just a clear plan for your next steps.</div>
      <a href="https://urbanvoice.ai/free-call" style="color:#ff6a00; font-weight:700; font-size:12pt; text-decoration:none;">urbanvoice.ai/free-call</a>
    </div>
  </div>

  <div class="footer">
    Generated by UrbanVoice.AI — Problem Discovery Engine &nbsp;|&nbsp; urbanvoice.ai
  </div>

</body>
</html>`;

  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 600);
}
