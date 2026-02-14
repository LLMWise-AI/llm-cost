#!/usr/bin/env node

// llm-cost — Compare LLM API costs across providers (live pricing)
// https://llmwise.ai | MIT License

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// ─── Cache ──────────────────────────────────────────────────────

const CACHE_DIR = join(homedir(), ".llm-cost");
const CACHE_FILE = join(CACHE_DIR, "models.json");
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

function readCache() {
  try {
    if (!existsSync(CACHE_FILE)) return null;
    const raw = JSON.parse(readFileSync(CACHE_FILE, "utf-8"));
    if (Date.now() - raw.timestamp > CACHE_TTL_MS) return null;
    return raw.models;
  } catch {
    return null;
  }
}

function writeCache(models) {
  try {
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(CACHE_FILE, JSON.stringify({ timestamp: Date.now(), models }, null, 2));
  } catch {}
}

// ─── Fetch Live Pricing from OpenRouter ─────────────────────────

const PROVIDER_MAP = {
  "openai": "OpenAI", "anthropic": "Anthropic", "google": "Google",
  "deepseek": "DeepSeek", "meta-llama": "Meta", "x-ai": "xAI",
  "mistralai": "Mistral", "cohere": "Cohere", "qwen": "Qwen",
  "amazon": "Amazon", "nvidia": "NVIDIA", "microsoft": "Microsoft",
  "perplexity": "Perplexity", "ai21": "AI21", "together": "Together",
  "fireworks": "Fireworks", "groq": "Groq",
};

function extractProvider(modelId) {
  return PROVIDER_MAP[modelId.split("/")[0]] || modelId.split("/")[0];
}

function cleanName(name, provider) {
  if (name.startsWith(provider + ": ")) name = name.slice(provider.length + 2);
  return name;
}

function formatCtx(n) {
  if (!n) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

async function fetchLivePricing() {
  const res = await fetch("https://openrouter.ai/api/v1/models", {
    headers: { "User-Agent": "llm-cost-cli/1.2.0" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`OpenRouter API returned ${res.status}`);
  const { data } = await res.json();

  const models = [];
  const seen = new Set();

  for (const m of data) {
    const inputPerToken = parseFloat(m.pricing?.prompt || "0");
    const outputPerToken = parseFloat(m.pricing?.completion || "0");
    if (inputPerToken === 0 && outputPerToken === 0) continue;
    if (seen.has(m.id)) continue;
    // Skip OpenRouter meta-models (routing products, not real LLMs)
    if (m.id.startsWith("openrouter/")) continue;
    seen.add(m.id);

    const provider = extractProvider(m.id);
    const inputMods = m.architecture?.input_modalities || ["text"];
    const outputMods = m.architecture?.output_modalities || ["text"];
    const params = m.supported_parameters || [];

    models.push({
      id: m.id,
      provider,
      name: cleanName(m.name || m.id.split("/").pop(), provider),
      input: parseFloat((inputPerToken * 1_000_000).toFixed(4)),
      output: parseFloat((outputPerToken * 1_000_000).toFixed(4)),
      context: m.context_length || 0,
      maxOutput: m.top_provider?.max_completion_tokens || 0,
      // Modalities
      vision: inputMods.includes("image"),
      audio: inputMods.includes("audio"),
      video: inputMods.includes("video"),
      imageOut: outputMods.includes("image"),
      // Capabilities
      tools: params.includes("tools"),
      reasoning: params.includes("reasoning") || params.includes("include_reasoning"),
      structuredOutput: params.includes("structured_outputs"),
      // Extra pricing
      cacheRead: m.pricing?.input_cache_read ? parseFloat((parseFloat(m.pricing.input_cache_read) * 1_000_000).toFixed(4)) : null,
      cacheWrite: m.pricing?.input_cache_write ? parseFloat((parseFloat(m.pricing.input_cache_write) * 1_000_000).toFixed(4)) : null,
      thinkingCost: m.pricing?.internal_reasoning ? parseFloat((parseFloat(m.pricing.internal_reasoning) * 1_000_000).toFixed(4)) : null,
      description: (m.description || "").slice(0, 200),
    });
  }

  models.sort((a, b) => a.provider.localeCompare(b.provider) || a.input - b.input);
  return models;
}

// ─── Fallback Data ──────────────────────────────────────────────

const FALLBACK_MODELS = [
  { id: "openai/gpt-4.1",           provider: "OpenAI",    name: "GPT-4.1",           input: 2.00,  output: 8.00,  context: 1047576, maxOutput: 32768, vision: true, tools: true, reasoning: false, structuredOutput: true },
  { id: "openai/gpt-4.1-mini",      provider: "OpenAI",    name: "GPT-4.1 Mini",      input: 0.40,  output: 1.60,  context: 1047576, maxOutput: 32768, vision: true, tools: true, reasoning: false, structuredOutput: true },
  { id: "openai/gpt-4.1-nano",      provider: "OpenAI",    name: "GPT-4.1 Nano",      input: 0.10,  output: 0.40,  context: 1047576, maxOutput: 32768, vision: true, tools: true, reasoning: false, structuredOutput: true },
  { id: "openai/o3",                 provider: "OpenAI",    name: "o3",                 input: 10.00, output: 40.00, context: 200000,  maxOutput: 100000, vision: true, tools: true, reasoning: true, structuredOutput: true },
  { id: "openai/o4-mini",            provider: "OpenAI",    name: "o4-mini",            input: 1.10,  output: 4.40,  context: 200000,  maxOutput: 100000, vision: true, tools: true, reasoning: true, structuredOutput: true },
  { id: "anthropic/claude-sonnet-4.5",provider: "Anthropic",name: "Claude Sonnet 4.5",  input: 3.00,  output: 15.00, context: 1000000, maxOutput: 64000, vision: true, tools: true, reasoning: true, structuredOutput: true },
  { id: "anthropic/claude-haiku-3.5",provider: "Anthropic", name: "Claude Haiku 3.5",   input: 0.80,  output: 4.00,  context: 200000,  maxOutput: 8192, vision: true, tools: true, reasoning: false, structuredOutput: false },
  { id: "google/gemini-2.5-pro",     provider: "Google",    name: "Gemini 2.5 Pro",     input: 1.25,  output: 10.00, context: 1048576, maxOutput: 65536, vision: true, tools: true, reasoning: true, structuredOutput: true },
  { id: "google/gemini-2.5-flash",   provider: "Google",    name: "Gemini 2.5 Flash",   input: 0.15,  output: 0.60,  context: 1048576, maxOutput: 65536, vision: true, tools: true, reasoning: true, structuredOutput: true },
  { id: "deepseek/deepseek-chat",    provider: "DeepSeek",  name: "DeepSeek V3",        input: 0.27,  output: 1.10,  context: 131072,  maxOutput: 8192, vision: false, tools: true, reasoning: false, structuredOutput: false },
  { id: "deepseek/deepseek-r1",      provider: "DeepSeek",  name: "DeepSeek R1",        input: 0.55,  output: 2.19,  context: 163840,  maxOutput: 8192, vision: false, tools: false, reasoning: true, structuredOutput: false },
  { id: "x-ai/grok-3",              provider: "xAI",       name: "Grok 3",             input: 3.00,  output: 15.00, context: 131072,  maxOutput: 8192, vision: false, tools: true, reasoning: false, structuredOutput: false },
  { id: "x-ai/grok-3-mini",         provider: "xAI",       name: "Grok 3 Mini",        input: 0.30,  output: 0.50,  context: 131072,  maxOutput: 8192, vision: false, tools: true, reasoning: true, structuredOutput: false },
  { id: "mistralai/mistral-large",   provider: "Mistral",   name: "Mistral Large",      input: 2.00,  output: 6.00,  context: 128000,  maxOutput: 8192, vision: false, tools: true, reasoning: false, structuredOutput: true },
  { id: "mistralai/mistral-small",   provider: "Mistral",   name: "Mistral Small",      input: 0.10,  output: 0.30,  context: 128000,  maxOutput: 8192, vision: false, tools: true, reasoning: false, structuredOutput: true },
];

// ─── Resolve Models ─────────────────────────────────────────────

async function getModels(forceRefresh = false) {
  if (!forceRefresh) {
    const cached = readCache();
    if (cached) return { models: cached, source: "cache" };
  }
  try {
    const models = await fetchLivePricing();
    writeCache(models);
    return { models, source: "live" };
  } catch {
    try {
      if (existsSync(CACHE_FILE)) {
        const raw = JSON.parse(readFileSync(CACHE_FILE, "utf-8"));
        return { models: raw.models, source: "stale-cache" };
      }
    } catch {}
    return { models: FALLBACK_MODELS, source: "fallback" };
  }
}

// ─── Formatting Helpers ─────────────────────────────────────────

function estimateTokens(text) {
  return Math.max(1, Math.ceil(text.length / 4));
}

function calculateCost(model, inputTokens, outputTokens) {
  const inputCost = (inputTokens / 1_000_000) * model.input;
  const outputCost = (outputTokens / 1_000_000) * model.output;
  return { inputCost, outputCost, totalCost: inputCost + outputCost };
}

function formatUSD(n) {
  if (n < 0.0001) return "<$0.0001";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 1) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

function formatTokens(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function pad(str, width, align = "left") {
  const s = String(str);
  if (s.length >= width) return s;
  const diff = width - s.length;
  return align === "right" ? " ".repeat(diff) + s : s + " ".repeat(diff);
}

function capsBadge(model) {
  const tags = [];
  if (model.vision) tags.push("vision");
  if (model.audio) tags.push("audio");
  if (model.video) tags.push("video");
  if (model.imageOut) tags.push("img-out");
  if (model.reasoning) tags.push("reasoning");
  if (model.tools) tags.push("tools");
  if (model.structuredOutput) tags.push("json");
  return tags.join(",");
}

// ─── Table Printing ─────────────────────────────────────────────

function printTable(rows, options = {}) {
  const { monthly, showCaps } = options;

  const headers = ["Model", "Provider", "Input/1M", "Output/1M", "Context", "Est. Cost"];
  if (monthly) headers.push("Monthly");
  if (showCaps) headers.push("Capabilities");

  const colWidths = headers.map((h) => h.length);

  const formatted = rows.map((r) => {
    const cols = [
      r.name, r.provider,
      formatUSD(r.input), formatUSD(r.output),
      formatCtx(r.context),
      formatUSD(r.totalCost),
    ];
    if (monthly) cols.push(formatUSD(r.monthlyCost));
    if (showCaps) cols.push(capsBadge(r));

    cols.forEach((c, i) => {
      colWidths[i] = Math.max(colWidths[i], c.length);
    });
    return cols;
  });

  const line = "+" + colWidths.map((w) => "-".repeat(w + 2)).join("+") + "+";
  const headerLine = "|" + headers.map((h, i) => " " + pad(h, colWidths[i]) + " ").join("|") + "|";

  console.log();
  console.log(line);
  console.log(headerLine);
  console.log(line);
  formatted.forEach((cols) => {
    const row = "|" + cols.map((c, i) => {
      const align = (i >= 2 && i <= 5) || (i === 6 && monthly) ? "right" : "left";
      return " " + pad(c, colWidths[i], align) + " ";
    }).join("|") + "|";
    console.log(row);
  });
  console.log(line);
}

// ─── Model Detail View ─────────────────────────────────────────

function printModelDetail(model) {
  console.log();
  console.log(`  ${model.name} (${model.provider})`);
  console.log(`  ${"─".repeat(50)}`);
  console.log(`  ID:              ${model.id}`);
  console.log(`  Input:           ${formatUSD(model.input)} / 1M tokens`);
  console.log(`  Output:          ${formatUSD(model.output)} / 1M tokens`);
  if (model.cacheRead)    console.log(`  Cache read:      ${formatUSD(model.cacheRead)} / 1M tokens`);
  if (model.cacheWrite)   console.log(`  Cache write:     ${formatUSD(model.cacheWrite)} / 1M tokens`);
  if (model.thinkingCost) console.log(`  Thinking/CoT:    ${formatUSD(model.thinkingCost)} / 1M tokens`);
  console.log(`  Context window:  ${formatCtx(model.context)} tokens`);
  if (model.maxOutput)    console.log(`  Max output:      ${formatCtx(model.maxOutput)} tokens`);
  console.log();
  console.log(`  Capabilities`);
  console.log(`  ${"─".repeat(50)}`);
  console.log(`  Vision:          ${model.vision ? "yes" : "no"}`);
  console.log(`  Audio input:     ${model.audio ? "yes" : "no"}`);
  console.log(`  Video input:     ${model.video ? "yes" : "no"}`);
  console.log(`  Image output:    ${model.imageOut ? "yes" : "no"}`);
  console.log(`  Tool calling:    ${model.tools ? "yes" : "no"}`);
  console.log(`  Reasoning/CoT:   ${model.reasoning ? "yes" : "no"}`);
  console.log(`  Structured JSON: ${model.structuredOutput ? "yes" : "no"}`);
  if (model.cacheRead) {
    console.log();
    console.log(`  Cache Savings`);
    console.log(`  ${"─".repeat(50)}`);
    const savings = ((1 - model.cacheRead / model.input) * 100).toFixed(0);
    console.log(`  Cache read is ${savings}% cheaper than regular input`);
    console.log(`  Use prompt caching for repeated system prompts / context`);
  }
  if (model.description) {
    console.log();
    console.log(`  ${model.description}${model.description.length >= 200 ? "..." : ""}`);
  }
  console.log();
}

// ─── "Best For" Recommendations ─────────────────────────────────

function printBestFor(models) {
  console.log();
  console.log("  Best model for each use case (cheapest that qualifies)");
  console.log(`  ${"─".repeat(55)}`);

  const categories = [
    { label: "Cheapest overall",       filter: () => true },
    { label: "Cheapest with vision",   filter: (m) => m.vision },
    { label: "Cheapest with tools",    filter: (m) => m.tools },
    { label: "Cheapest reasoning/CoT", filter: (m) => m.reasoning },
    { label: "Cheapest JSON output",   filter: (m) => m.structuredOutput },
    { label: "Cheapest ≥128K context", filter: (m) => m.context >= 128_000 },
    { label: "Cheapest ≥1M context",   filter: (m) => m.context >= 1_000_000 },
    { label: "Cheapest with audio",    filter: (m) => m.audio },
    { label: "Biggest context window",  filter: () => true, sort: (a, b) => b.context - a.context },
    { label: "Biggest max output",     filter: () => true, sort: (a, b) => (b.maxOutput || 0) - (a.maxOutput || 0) },
  ];

  for (const cat of categories) {
    const filtered = models.filter(cat.filter);
    if (filtered.length === 0) {
      console.log(`  ${pad(cat.label, 28)} —`);
      continue;
    }
    if (cat.sort) {
      filtered.sort(cat.sort);
    } else {
      // Sort by total cost (input + output at 1:1 ratio)
      filtered.sort((a, b) => (a.input + a.output) - (b.input + b.output));
    }
    const best = filtered[0];
    const detail = cat.sort
      ? (cat.label.includes("context") ? formatCtx(best.context) : formatCtx(best.maxOutput))
      : `${formatUSD(best.input)} in / ${formatUSD(best.output)} out`;
    console.log(`  ${pad(cat.label, 28)} ${pad(best.name, 28)} ${detail}`);
  }
  console.log();
}

// ─── CLI Argument Parsing ─────────────────────────────────────

function parseArgs(argv) {
  const args = {
    prompt: null,
    inputTokens: null,
    outputTokens: null,
    models: null,
    providers: null,
    monthly: null,
    sort: "cost",
    json: false,
    cheap: false,
    help: false,
    version: false,
    list: false,
    refresh: false,
    top: null,
    detail: null,
    vision: false,
    tools: false,
    reasoning: false,
    minContext: null,
    caps: false,
    bestFor: false,
  };

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--version" || arg === "-v") args.version = true;
    else if (arg === "--json") args.json = true;
    else if (arg === "--cheap") args.cheap = true;
    else if (arg === "--list" || arg === "-l") args.list = true;
    else if (arg === "--refresh" || arg === "-r") args.refresh = true;
    else if (arg === "--vision") args.vision = true;
    else if (arg === "--tools") args.tools = true;
    else if (arg === "--reasoning") args.reasoning = true;
    else if (arg === "--caps") args.caps = true;
    else if (arg === "--best-for" || arg === "--best") args.bestFor = true;
    else if ((arg === "--tokens" || arg === "-t") && argv[i + 1])
      args.inputTokens = parseInt(argv[++i], 10);
    else if ((arg === "--output-tokens" || arg === "-o") && argv[i + 1])
      args.outputTokens = parseInt(argv[++i], 10);
    else if ((arg === "--models" || arg === "-m") && argv[i + 1])
      args.models = argv[++i].split(",").map((s) => s.trim().toLowerCase());
    else if ((arg === "--providers" || arg === "-p") && argv[i + 1])
      args.providers = argv[++i].split(",").map((s) => s.trim().toLowerCase());
    else if (arg === "--monthly" && argv[i + 1])
      args.monthly = parseInt(argv[++i], 10);
    else if ((arg === "--sort" || arg === "-s") && argv[i + 1])
      args.sort = argv[++i].toLowerCase();
    else if (arg === "--top" && argv[i + 1])
      args.top = parseInt(argv[++i], 10);
    else if ((arg === "--detail" || arg === "-d") && argv[i + 1])
      args.detail = argv[++i].toLowerCase();
    else if (arg === "--context" && argv[i + 1])
      args.minContext = parseInt(argv[++i], 10);
    else if (!arg.startsWith("-"))
      args.prompt = arg;
    i++;
  }

  return args;
}

// ─── Help ─────────────────────────────────────────────────────

function printHelp() {
  console.log(`
  llm-cost — Compare LLM API costs across providers (live pricing)

  USAGE
    llm-cost "Your prompt here"
    llm-cost --tokens 500 --output-tokens 2000
    llm-cost --monthly 10000 -p openai,anthropic

  OPTIONS
    -t, --tokens <n>         Input token count (or auto-estimate from prompt)
    -o, --output-tokens <n>  Expected output tokens (default: 2x input)
    -m, --models <list>      Filter to specific models (comma-separated)
    -p, --providers <list>   Filter by provider (openai,anthropic,google,...)
        --monthly <n>        Show monthly cost for N requests
        --cheap              Show only the 5 cheapest models
        --top <n>            Show top N cheapest models
    -s, --sort <key>         Sort by: cost (default), input, output, name, context
        --json               Output as JSON
    -l, --list               List all models and pricing
    -r, --refresh            Force refresh pricing data (bypass cache)
    -h, --help               Show this help
    -v, --version            Show version

  FILTERS
        --vision             Only models that accept images
        --tools              Only models with function/tool calling
        --reasoning          Only models with reasoning/chain-of-thought
        --context <n>        Only models with ≥N context window (e.g. 128000)

  DETAIL
    -d, --detail <model>     Show full details for a model (pricing, caps, cache)
        --caps               Show capabilities column in table
        --best-for           Show cheapest model for each use case

  PRICING
    Live pricing from OpenRouter API (200+ models).
    Cached locally for 6 hours. Use --refresh to update.
    Prices are per 1M tokens in USD.

  EXAMPLES
    llm-cost "Explain quantum computing"
    llm-cost --tokens 1000 -o 4000
    llm-cost --monthly 50000 -p openai,anthropic
    llm-cost --vision --cheap                    # cheapest vision models
    llm-cost --reasoning --caps                  # reasoning models with capabilities
    llm-cost --detail claude-sonnet-4.5          # full model breakdown
    llm-cost --best-for                          # recommendations by use case
    llm-cost --context 1000000 --sort context    # 1M+ context models
    llm-cost --tools --json --top 10

  Built by LLMWise — https://llmwise.ai
`);
}

// ─── List Models ──────────────────────────────────────────────

function listModels(models, filterProviders, source) {
  if (filterProviders) {
    models = models.filter((m) =>
      filterProviders.some((p) => m.provider.toLowerCase().includes(p))
    );
  }

  console.log();
  console.log(`  ${models.length} models — pricing per 1M tokens (USD) [${source}]`);
  console.log();

  const byProvider = {};
  models.forEach((m) => {
    if (!byProvider[m.provider]) byProvider[m.provider] = [];
    byProvider[m.provider].push(m);
  });

  for (const [provider, provModels] of Object.entries(byProvider)) {
    console.log(`  ${provider} (${provModels.length})`);
    provModels.forEach((m) => {
      const inStr = pad(formatUSD(m.input), 10, "right");
      const outStr = pad(formatUSD(m.output), 10, "right");
      const ctx = pad(formatCtx(m.context), 6, "right");
      const caps = [];
      if (m.vision) caps.push("V");
      if (m.audio) caps.push("A");
      if (m.reasoning) caps.push("R");
      if (m.tools) caps.push("T");
      const capsStr = caps.length ? ` [${caps.join("")}]` : "";
      console.log(`    ${pad(m.name, 36)} ${inStr} in  ${outStr} out  ${ctx}${capsStr}`);
    });
    console.log();
  }

  console.log("  [V]ision  [A]udio  [R]easoning  [T]ools");
  console.log();
}

// ─── Source Label ──────────────────────────────────────────────

function sourceLabel(source) {
  const labels = {
    "live": "live from OpenRouter",
    "cache": "cached",
    "stale-cache": "stale cache (offline)",
    "fallback": "offline fallback",
  };
  return labels[source] || source;
}

// ─── Main ─────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.version) { console.log("llm-cost v1.2.0"); return; }
  if (args.help) { printHelp(); return; }

  // Fetch models
  const { models: allModels, source } = await getModels(args.refresh);

  if (args.list) {
    listModels(allModels, args.providers, sourceLabel(source));
    return;
  }

  // Best-for recommendations
  if (args.bestFor) {
    printBestFor(allModels);
    return;
  }

  // Detail view
  if (args.detail) {
    const match = allModels.find((m) =>
      m.id.toLowerCase().includes(args.detail) || m.name.toLowerCase().includes(args.detail)
    );
    if (!match) {
      console.error(`\n  No model found matching "${args.detail}". Use --list to see all.\n`);
      process.exit(1);
    }
    printModelDetail(match);
    return;
  }

  // Determine token counts
  let inputTokens = args.inputTokens;
  let outputTokens = args.outputTokens;

  if (args.prompt && !inputTokens) inputTokens = estimateTokens(args.prompt);
  if (!inputTokens) inputTokens = 200;
  if (!outputTokens) outputTokens = Math.max(300, inputTokens * 2);

  // Filter models
  let models = allModels;

  if (args.models) {
    models = models.filter((m) =>
      args.models.some((f) => m.id.toLowerCase().includes(f) || m.name.toLowerCase().includes(f))
    );
  }
  if (args.providers) {
    models = models.filter((m) =>
      args.providers.some((p) => m.provider.toLowerCase().includes(p))
    );
  }
  if (args.vision) models = models.filter((m) => m.vision);
  if (args.tools) models = models.filter((m) => m.tools);
  if (args.reasoning) models = models.filter((m) => m.reasoning);
  if (args.minContext) models = models.filter((m) => m.context >= args.minContext);

  if (models.length === 0) {
    console.error("\n  No models matched your filter. Use --list to see all models.\n");
    process.exit(1);
  }

  // Calculate costs
  const results = models.map((m) => {
    const { inputCost, outputCost, totalCost } = calculateCost(m, inputTokens, outputTokens);
    return {
      ...m,
      inputCost, outputCost, totalCost,
      monthlyCost: args.monthly ? totalCost * args.monthly : 0,
    };
  });

  // Sort
  const sorters = {
    input: (a, b) => a.input - b.input,
    output: (a, b) => a.output - b.output,
    name: (a, b) => a.name.localeCompare(b.name),
    context: (a, b) => b.context - a.context,
  };
  results.sort(sorters[args.sort] || ((a, b) => a.totalCost - b.totalCost));

  // Top N / cheap
  let display = results;
  if (args.top) display = results.slice(0, args.top);
  else if (args.cheap) display = results.slice(0, 5);

  // JSON output
  if (args.json) {
    const out = {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      source: sourceLabel(source),
      ...(args.monthly ? { monthly_requests: args.monthly } : {}),
      models: display.map((m) => ({
        id: m.id, provider: m.provider, name: m.name,
        input_per_1m: m.input, output_per_1m: m.output,
        context_window: m.context, max_output: m.maxOutput || undefined,
        estimated_cost: parseFloat(m.totalCost.toFixed(6)),
        ...(args.monthly ? { monthly_cost: parseFloat(m.monthlyCost.toFixed(2)) } : {}),
        capabilities: {
          vision: m.vision || false,
          audio: m.audio || false,
          tools: m.tools || false,
          reasoning: m.reasoning || false,
          structured_output: m.structuredOutput || false,
        },
        ...(m.cacheRead ? { cache_read_per_1m: m.cacheRead } : {}),
        ...(m.cacheWrite ? { cache_write_per_1m: m.cacheWrite } : {}),
        ...(m.thinkingCost ? { thinking_per_1m: m.thinkingCost } : {}),
      })),
    };
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  // Print header
  console.log();
  console.log(`  Input: ${formatTokens(inputTokens)} tokens | Output: ${formatTokens(outputTokens)} tokens${args.monthly ? ` | ${formatTokens(args.monthly)} requests/mo` : ""}`);
  console.log(`  Pricing: ${sourceLabel(source)} | ${display.length} models`);

  // Print table
  printTable(display, { monthly: args.monthly, showCaps: args.caps });

  // Cheapest callout
  if (results.length > 1) {
    const cheapest = results[0];
    const priciest = results[results.length - 1];
    const ratio = priciest.totalCost / cheapest.totalCost;
    console.log(`  Cheapest: ${cheapest.name} (${formatUSD(cheapest.totalCost)}) — ${ratio.toFixed(0)}x less than ${priciest.name}`);

    if (args.monthly) {
      console.log(`  Monthly: ${cheapest.name} saves ${formatUSD(priciest.monthlyCost - cheapest.monthlyCost)}/mo vs ${priciest.name}`);
    }
  }

  console.log(`\n  Auto-route to cheapest model → https://llmwise.ai\n`);
}

main();
