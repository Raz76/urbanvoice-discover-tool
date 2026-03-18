/* ============================================================
   URBANVOICE — API.JS
   All calls route through the Cloudflare Worker proxy.
   No API keys are stored or exposed in the browser.
   ============================================================ */

'use strict';

const WORKER_URL = 'https://wispy-salad-64ee.razvan-petrescu76.workers.dev';
const UV_SECRET  = '0a91b983bbe44f231f860a3affb77582acb853c4'; // shared secret — must match worker

// ----------------------------------------------------------------
// Core request helpers
// ----------------------------------------------------------------

function parseJSON(raw) {
  // Strip markdown code fences if present (```json ... ``` or ``` ... ```)
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  return JSON.parse(cleaned);
}

async function callAnthropic(systemPrompt, userPrompt) {
  const res = await fetch(WORKER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': UV_SECRET,
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Proxy error ${res.status}: ${err?.error?.message || res.statusText}`);
  }

  const data = await res.json();
  return data.content[0].text;
}

async function callSearch(query) {
  const res = await fetch(`${WORKER_URL}/search?q=${encodeURIComponent(query)}`, {
    headers: { 'x-api-key': UV_SECRET },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Search error ${res.status}: ${err?.error || res.statusText}`);
  }

  return await res.json();
}

// ----------------------------------------------------------------
// Helper: flatten worker search response into a clean array
// ----------------------------------------------------------------
function flattenResults(searchData) {
  return [
    ...(searchData.results?.reddit  || []),
    ...(searchData.results?.quora   || []),
    ...(searchData.results?.general || []),
  ].map(r => ({ source: r.source, title: r.title, snippet: r.snippet }));
}

// ----------------------------------------------------------------
// Pre-step: Generate diverse search angles from the user's problem hypothesis
// Returns: string[] of 3-4 search queries
// ----------------------------------------------------------------
async function generateSearchAngles(rawIdea) {
  const system = `You generate diverse search queries. Return ONLY valid JSON — no markdown, no explanation.`;
  const prompt = `The user is exploring this business idea or problem space: "${rawIdea}"

Generate 3-4 concise search queries (3-5 words each) to find online discussions that validate whether this is a real problem people face.

Cover different framings:
1. Problem/complaint language (e.g. "picky eater kids vegetables")
2. Who is affected (e.g. "parents children refuse vegetables")
3. What people search for help with (e.g. "kids healthy eating struggles")
4. Broad topic fallback (e.g. "vegetable meals toddlers")

Return: { "angles": ["query 1", "query 2", "query 3", "query 4"] }`;

  try {
    const raw = await callAnthropic(system, prompt);
    const result = parseJSON(raw);
    return Array.isArray(result.angles) && result.angles.length > 0
      ? result.angles.slice(0, 4)
      : [rawIdea];
  } catch {
    return [rawIdea];
  }
}

// ----------------------------------------------------------------
// Step 1: Generate search angles from hypothesis, search in parallel, evaluate.
// Returns: { vague } | { sufficient, matchType, problems, nearMissNote? } | { sufficient: false, angles, reason }
// ----------------------------------------------------------------
async function fetchSearchAndEvaluate(rawIdea) {
  // Vagueness check — ≤ 2 generic words have no specific direction
  const wordCount = rawIdea.trim().split(/\s+/).length;
  if (wordCount <= 2) {
    return { vague: true };
  }

  // Generate diverse search angles from the problem hypothesis
  const searchAngles = await generateSearchAngles(rawIdea);

  // Run all angles in parallel
  const allSearchData = await Promise.all(
    searchAngles.map(q => callSearch(q).catch(() => ({ results: {} })))
  );

  // Flatten and deduplicate across all searches
  const seen = new Set();
  const allResults = [];
  for (const searchData of allSearchData) {
    for (const r of flattenResults(searchData)) {
      if (!seen.has(r.title)) {
        seen.add(r.title);
        allResults.push(r);
      }
    }
  }

  // Hard stop — not enough data found across all angles
  if (allResults.length < 4) {
    const err = new Error(`We couldn't find enough online discussion about "${rawIdea}". Try rephrasing with more specific terms.`);
    err.code = 'TOO_FEW';
    throw err;
  }

  const system = `You are a market research analyst. You evaluate real search results
and either extract problems or suggest refined niches. Return ONLY valid JSON — no markdown,
no explanation.`;

  const prompt = `The user is exploring this business idea or problem space: "${rawIdea}"

Search results (${allResults.length} found across multiple search angles):
${JSON.stringify(allResults, null, 2)}

TASK: Evaluate whether these results contain actionable complaint signal related to the user's idea.

SUFFICIENT = results contain specific frustrations people face, even if not an exact match for the user's phrasing.
TOO BROAD = results span multiple completely unrelated audiences or use cases.

If SUFFICIENT — extract up to 5 practical problems from what was found.
Also determine the match type:
- "direct": results clearly validate the user's stated idea
- "near_miss": real problems found, but they're adjacent to what the user described (e.g. user said X but results show related-but-different problem Y). Include a nearMissNote (1 sentence) explaining what was actually found vs what the user described.

Problems can come from ANY type of result — a complaint thread, a tutorial, a how-to guide, or a
tips article. A tutorial titled "How to fix dry cakes" is evidence that dry cakes are a real
problem. Extract the underlying problem, not just explicit complaints.

FILTER — only include problems where a course, coaching, template, or service could directly help:
INCLUDE: skill gaps, technique frustrations, knowledge gaps, tool/resource gaps, recipe failures.
EXCLUDE: social pressures ("people tell me to sell"), relationship dynamics,
opinions about the hobby, or meta-commentary. Never include a problem whose solution
is "talk to your friends differently."

Prioritise practical problems. If a mix of practical and social results exist, extract
only the practical ones. Do not pad with social/meta content.

Return when SUFFICIENT:
{
  "sufficient": true,
  "matchType": "direct" | "near_miss",
  "nearMissNote": "One sentence — only include this field on near_miss",
  "problems": [
    {
      "title": "Problem theme name (max 8 words)",
      "description": "2-3 sentences describing the problem",
      "quotes": ["Direct quote or paraphrase from a result", "Another quote"],
      "sources": ["Reddit", "Quora"],
      "frequency": "Low|Medium|High|Very High",
      "trend": "Declining|Stable|Growing|Growing Fast",
      "sourceCounts": { "reddit": 0, "quora": 0, "general": 0 }
    }
  ]
}
Return up to 5 problems. Every field must come from the actual results above — no invention.

Return when TOO BROAD — suggest narrower niches based ONLY on patterns visible in the results:
{
  "sufficient": false,
  "reason": "One sentence about audience breadth only (e.g. 'Results cover both professionals and hobbyists with different needs')",
  "angles": [
    { "title": "Narrower niche (max 6 words)", "description": "1-2 sentences grounded in what the search results suggest" }
  ]
}
Return exactly 5 angles. Each must be grounded in what appeared in the search results — no guessing.`;

  const raw = await callAnthropic(system, prompt);
  const result = parseJSON(raw);
  result._searchData = allSearchData[0];
  return result;
}

// ----------------------------------------------------------------
// Relatedness check — is a user's refinement related to the original idea?
// Returns: boolean
// ----------------------------------------------------------------
async function checkRefinementRelatedness(rawIdea, refinement) {
  const system = `You determine topic relatedness. Return ONLY valid JSON — no markdown, no explanation.`;
  const prompt = `Original topic: "${rawIdea}"
User's additional context: "${refinement}"

Is the additional context related to the original topic, or is it a completely different subject?
Return: { "related": true } or { "related": false }`;
  const raw = await callAnthropic(system, prompt);
  return parseJSON(raw).related === true;
}

// ----------------------------------------------------------------
// Step 2b: Search + extract problems for a specific refined angle
// (only called when user had to pick a narrower niche)
// Returns: Array of { title, description, quotes, sources, frequency, trend, sourceCounts }
// ----------------------------------------------------------------
async function fetchProblems(angle) {
  const searchData = await callSearch(angle);

  const allResults = [
    ...(searchData.results?.reddit  || []),
    ...(searchData.results?.quora   || []),
    ...(searchData.results?.general || []),
  ].map(r => ({ source: r.source, title: r.title, snippet: r.snippet }));

  if (allResults.length === 0) {
    throw new Error(`No discussions found for "${angle}". Try going back and picking a different niche.`);
  }

  const system = `You are a market research analyst who extracts real problems from
web search results. Return ONLY valid JSON — no markdown, no explanation.`;

  const prompt = `Here are real search results for the niche: "${angle}"

${JSON.stringify(allResults, null, 2)}

Extract practical problems from ALL types of content — complaint threads, tutorials, how-to
guides, and tips articles all count. A tutorial about "how to fix X" is evidence that X is
a real problem people face.

FILTER — only include problems a course, coaching, template, or service could directly solve:
INCLUDE: skill gaps, technique frustrations, knowledge gaps, tool/resource gaps, workflow problems.
EXCLUDE: social pressures ("people tell me to sell"), relationship dynamics, opinions about
the hobby, or meta-commentary. Never include a problem whose fix is "talk to your friends differently."

Identify up to 5 broad, distinct practical problem themes.
Every field must come from the actual results above — do not invent quotes or sources.

Return a JSON array of the qualifying objects (up to 5):
[
  {
    "title": "Problem theme name (max 8 words)",
    "description": "2-3 sentences describing the problem",
    "quotes": ["Direct quote or paraphrase from a result", "Another quote"],
    "sources": ["Reddit", "Quora"],
    "frequency": "Low|Medium|High|Very High",
    "trend": "Declining|Stable|Growing|Growing Fast",
    "sourceCounts": { "reddit": 0, "quora": 0, "general": 0 }
  },
  ...
]`;

  const raw = await callAnthropic(system, prompt);
  return parseJSON(raw);
}

// ----------------------------------------------------------------
// Step 4: Suggest business ideas (solutions)
// Returns: Array of { title, description }
// ----------------------------------------------------------------
async function fetchSolutions(problem, angle) {
  const system = `You are a startup advisor specializing in solo founder businesses.
Return ONLY valid JSON — no markdown, no explanation.`;

  const prompt = `Problem identified in the "${angle}" market:
"${problem.title}: ${problem.description}"

Suggest 5 realistic business ideas a solo non-technical person could start online
with no employees and no coding.

ONLY suggest these types: paid coaching or consulting, online course or workshop,
paid newsletter or community, niche blog or content site with affiliate income,
done-for-you service (e.g. setup, audit, template creation). Small physical product
stores (not large catalogues) are also acceptable.

Do NOT suggest: apps, software, marketplaces, SMS services, directories requiring
large datasets, or anything requiring developers.

Ground each idea in the specific problem and audience from the search results.
Do not invent generic business types — make each idea specific to this niche.

Note: these are research-based suggestions only. Results are not guaranteed.

Return a JSON array of exactly 5 objects:
[
  {
    "title": "Business idea name",
    "description": "2 sentences: what it is and how it makes money"
  },
  ...
]`;

  const raw = await callAnthropic(system, prompt);
  return parseJSON(raw);
}

// ----------------------------------------------------------------
// Step 4b: Validate all 5 solutions at once using one set of searches
// Returns: Array of 5 validation objects (same order as solutions)
// ----------------------------------------------------------------
async function fetchValidationForAll(solutions, problem, angle) {
  // Run 4 searches ONCE — all solutions share the same market/problem context
  const [competitors, pricing, complaints, demand] = await Promise.all([
    callSearch(`${angle} alternatives competitors`).catch(() => ({ results: {} })),
    callSearch(`${angle} pricing how much cost`).catch(() => ({ results: {} })),
    callSearch(`${angle} ${problem.title} complaints`).catch(() => ({ results: {} })),
    callSearch(`${angle} ${problem.title} solution`).catch(() => ({ results: {} })),
  ]);

  const compress = (data, label) => ({
    category: label,
    results: [
      ...(data.results?.reddit  || []),
      ...(data.results?.quora   || []),
      ...(data.results?.general || []),
    ].slice(0, 4).map(r => ({ source: r.source, title: r.title, snippet: r.snippet })),
  });

  const searchContext = [
    compress(competitors, 'competitors'),
    compress(pricing,     'pricing'),
    compress(complaints,  'complaints'),
    compress(demand,      'demand'),
  ];

  const system = `You are a startup validation analyst. Analyze real market data and
score business ideas honestly. Return ONLY valid JSON — no markdown, no explanation.`;

  const prompt = `Market niche: "${angle}"
Problem: "${problem.title} — ${problem.description}"

5 proposed business ideas for this market:
${solutions.map((s, i) => `${i + 1}. ${s.title}: ${s.description}`).join('\n')}

Real market research data:
${JSON.stringify(searchContext, null, 2)}

Score each idea 1-10 using this rubric:

DEMAND (up to 4 points):
Are people actively discussing this problem in the search data? Many threads/discussions = 3-4 pts. Some = 2. Very few = 0-1.

COMMERCIAL FIT (up to 3 points):
Does this business model naturally fit how people in this niche spend money?
Coaching/consulting in skill-based niches = 2-3 pts. Online courses = 2-3 pts. Newsletters/blogs = 1-2 pts. Done-for-you services = 2-3 pts.

MARKET EVIDENCE (up to 3 points):
Existing paid solutions or competitors visible in search data = +1 pt (confirms people pay).
Pricing data found for similar services = +1 pt.
Active paid communities, courses, or coaching visible in results = +1 pt.
IMPORTANT: Absence of competitor data does NOT mean no competition exists — local or niche competitors don't appear in generic searches. Do NOT penalise for missing competitor data; only award points when evidence IS present.

CRITICAL RULE: Absence of pricing or competitor data does NOT mean the market won't pay. Demand score applies independently. Only score below 4 if the data actively suggests the problem is trivial or that free alternatives fully satisfy users.

Score comparatively — the 5 ideas should have meaningfully different scores based on how well each business model fits this specific audience and problem.

Return a JSON array of exactly 5 objects, same order as the ideas above:
[
  {
    "opportunityScore": 7,
    "monetizable": true,
    "willingnessToPay": "Low|Medium|High",
    "estimatedPriceRange": "$X – $Y / month",
    "currentAlternatives": ["real examples from search data"],
    "verdict": "One honest sentence grounded in the data."
  },
  ...
]`;

  const raw = await callAnthropic(system, prompt);
  return parseJSON(raw);
}

// ----------------------------------------------------------------
// Step 6: Generate brand identity options
// Returns: Array of { name, targetAudience, positioning, tagline }
// ----------------------------------------------------------------
async function fetchBrandOptions(problem, solution, angle) {
  const system = `You are a brand strategist. Return ONLY valid JSON — no markdown,
no explanation.`;

  const prompt = `We're building a solution for this validated opportunity:
- Market: "${angle}"
- Problem: "${problem.title}"
- Solution: "${solution.title}"

Suggest 3 distinct brand identity options. Each should feel like a real brand,
not a generic placeholder.

Return a JSON array of exactly 3 objects:
[
  {
    "name": "BrandName",
    "targetAudience": "Specific description of who this is for",
    "positioning": "One sentence: what it is and why it's different",
    "tagline": "Short punchy tagline (max 7 words)"
  },
  ...
]`;

  const raw = await callAnthropic(system, prompt);
  return parseJSON(raw);
}
