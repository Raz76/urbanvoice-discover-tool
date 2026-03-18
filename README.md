# UrbanVoice — Problem Discovery Engine

A web app that helps entrepreneurs validate business ideas by finding real problems people are complaining about online — before building anything.

**Live demo:** _[add your URL here]_

---

## What It Does

The user enters a business idea or topic (e.g. "cake baking for beginners" or "fitness for people with heart conditions"). The app then:

1. **Generates diverse search angles** from the input using Claude AI, treating it as a problem hypothesis rather than a literal query
2. **Searches Reddit, Quora, and forums** in parallel via Serper.dev to find real discussions
3. **Extracts pain points** from the results — actual quotes from real people, with frequency and trend signals
4. **Suggests no-code business ideas** matched to the chosen problem (coaching, courses, services — not apps)
5. **Validates each idea** against market data — willingness to pay, price range, existing alternatives
6. **Generates brand identity options** with names, taglines, and positioning
7. **Produces a downloadable PDF report** summarising the full discovery

Edge cases handled:
- **Too vague** (e.g. "bread") → asks for more direction before searching
- **Near-miss** → finds related problems and informs the user with context
- **Too broad** → surfaces narrower niches grounded in what was actually found

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML, CSS, JavaScript (no framework, no build step) |
| AI | Anthropic Claude API (claude-sonnet) via Cloudflare Worker proxy |
| Search | Serper.dev Google Search API (Reddit, Quora, general web) |
| Backend | Cloudflare Workers (serverless — handles API proxying, keeps keys off the client) |
| PDF | Browser print API (print-to-PDF via a formatted popup window) |

---

## Architecture

```
Browser (HTML/CSS/JS)
    │
    ├── POST /          → Cloudflare Worker → Anthropic Claude API
    └── GET  /search    → Cloudflare Worker → Serper.dev Search API
```

All API keys are kept server-side in the Cloudflare Worker. The browser only holds a shared secret used to authenticate requests to the worker.

The frontend is three JS modules:
- **`api.js`** — all API calls, search logic, Claude prompts
- **`screens.js`** — renders each step as DOM (no templating library)
- **`app.js`** — state management, navigation, rate limiting

---

## Key Design Decisions

- **No framework** — the UI is simple enough that React/Vue would be overhead. Plain DOM manipulation keeps it fast and dependency-free.
- **Serverless proxy** — Cloudflare Workers keep API keys off the client and add a rate-limiting layer without needing a dedicated backend.
- **Parallel search** — multiple search queries run simultaneously via `Promise.all()` to maximise result coverage and reduce latency.
- **Problem hypothesis approach** — user input is treated as a hypothesis to validate, not a search query. Claude generates multiple search angles from it, then evaluates whether results confirm, near-miss, or disprove the hypothesis.

---

## Running Locally

No build step required. Just open `index.html` in a browser.

To use the live API, the Cloudflare Worker must be deployed with valid Anthropic and Serper API keys. To set up your own:

1. Create a [Cloudflare Worker](https://workers.cloudflare.com/)
2. Paste the worker code (see `/worker` directory or contact me)
3. Add your `ANTHROPIC_API_KEY` and `SERPER_API_KEY`
4. Update `WORKER_URL` in `js/api.js` to point to your worker
