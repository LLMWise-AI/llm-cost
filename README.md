# llm-cost

**Compare LLM API costs across every provider. Live pricing. One command.**

```
npx llm-cost --tokens 1000 -o 4000 -p openai,anthropic,google
```

```
  Input: 1.0K tokens | Output: 4.0K tokens
  Pricing: live from OpenRouter | 42 models

+--------------------------+-----------+----------+-----------+---------+-----------+
| Model                    | Provider  | Input/1M | Output/1M | Context | Est. Cost |
+--------------------------+-----------+----------+-----------+---------+-----------+
| GPT-4.1 Nano             | OpenAI    |  $0.1000 |   $0.4000 |    1.0M |   $0.0017 |
| Gemini 2.5 Flash         | Google    |  $0.3000 |     $2.50 |    1.0M |   $0.0103 |
| Claude Haiku 3.5         | Anthropic |  $0.8000 |     $4.00 |   200K  |   $0.0168 |
| GPT-4.1 Mini             | OpenAI    |  $0.4000 |     $1.60 |    1.0M |   $0.0068 |
| Gemini 2.5 Pro           | Google    |    $1.25 |    $10.00 |    1.0M |   $0.0413 |
| GPT-4.1                  | OpenAI    |    $2.00 |     $8.00 |    1.0M |   $0.0340 |
| Claude Sonnet 4.5        | Anthropic |    $3.00 |    $15.00 |    1.0M |   $0.0630 |
| Claude Opus 4            | Anthropic |   $15.00 |    $75.00 |   200K  |   $0.3150 |
+--------------------------+-----------+----------+-----------+---------+-----------+
  Cheapest: GPT-4.1 Nano ($0.0017) — 185x less than Claude Opus 4
```

No API key needed. No dependencies. Prices fetched live from provider APIs.

**Want a visual dashboard instead?** Check out [llmwise.ai/llm-cost](https://llmwise.ai/llm-cost) — interactive charts, filters, and cost calculator.

---

## Why This Exists

If you're building with LLMs, you've probably asked yourself:

- "How much will this actually cost at scale?"
- "Is GPT-4.1 cheaper than Claude Sonnet for my use case?"
- "What's the cheapest model that supports vision + tool calling?"
- "How much would I save switching to Gemini Flash?"

Every provider has a pricing page, but comparing across providers means opening 8 tabs and doing mental math. `llm-cost` gives you the answer in one command.

**The pricing data is live.** Not a hardcoded table that goes stale in a week — it fetches real-time pricing from the OpenRouter models API, which aggregates pricing for 200+ models across all major providers. Cached locally for 6 hours so it stays fast.

---

## Install

```bash
# Run directly (no install)
npx llm-cost

# Or install globally
npm i -g llm-cost
```

Requires Node.js 18+ (for `fetch`). Zero dependencies.

---

## Usage

### Basic Cost Comparison

```bash
# Estimate cost from a prompt
llm-cost "Explain the theory of relativity in simple terms"

# Specify exact token counts
llm-cost --tokens 1000 --output-tokens 4000

# Filter by provider
llm-cost -p openai,anthropic

# Show only the 5 cheapest
llm-cost --cheap

# Show top N cheapest
llm-cost --top 10
```

### Filter by Capabilities

This is where it gets interesting. Not all models are equal — some support vision, some support tool calling, some can do chain-of-thought reasoning. Filter to find exactly what you need:

```bash
# Cheapest model that can see images
llm-cost --vision --cheap

# Models with function/tool calling, show capabilities
llm-cost --tools --caps

# Reasoning models only (CoT / thinking)
llm-cost --reasoning --top 5

# At least 1M context window
llm-cost --context 1000000

# Combine: vision + reasoning + tools
llm-cost --vision --reasoning --tools --cheap --caps
```

### Model Deep Dive

Get the full breakdown for any model — pricing, capabilities, cache savings, and more:

```bash
llm-cost --detail claude-sonnet-4.5
```

```
  Claude Sonnet 4.5 (Anthropic)
  ──────────────────────────────────────────────────
  ID:              anthropic/claude-sonnet-4.5
  Input:           $3.00 / 1M tokens
  Output:          $15.00 / 1M tokens
  Cache read:      $0.30 / 1M tokens
  Cache write:     $3.75 / 1M tokens
  Context window:  1M tokens
  Max output:      64K tokens

  Capabilities
  ──────────────────────────────────────────────────
  Vision:          yes
  Audio input:     no
  Video input:     no
  Image output:    no
  Tool calling:    yes
  Reasoning/CoT:   yes
  Structured JSON: yes

  Cache Savings
  ──────────────────────────────────────────────────
  Cache read is 90% cheaper than regular input
  Use prompt caching for repeated system prompts / context
```

**Cache pricing is a hidden goldmine.** Most developers don't realize that prompt caching can cut input costs by 90%. The `--detail` view shows you exactly how much you'd save.

### Best-For Recommendations

Don't know which model to pick? Get instant recommendations:

```bash
llm-cost --best-for
```

```
  Best model for each use case (cheapest that qualifies)
  ───────────────────────────────────────────────────────
  Cheapest overall             LFM2-8B-A1B                  $0.01 in / $0.02 out
  Cheapest with vision         Gemma 3 4B                   $0.02 in / $0.07 out
  Cheapest with tools          Mistral Nemo                 $0.02 in / $0.04 out
  Cheapest reasoning/CoT       DeepHermes 3 Mistral 24B     $0.02 in / $0.10 out
  Cheapest JSON output         Mistral Nemo                 $0.02 in / $0.04 out
  Cheapest ≥128K context       Llama 3.2 3B Instruct        $0.02 in / $0.02 out
  Cheapest ≥1M context         Gemini 2.0 Flash Lite        $0.08 in / $0.30 out
  Cheapest with audio          Gemini 2.0 Flash Lite        $0.08 in / $0.30 out
  Biggest context window       Grok 4.1 Fast                2M
  Biggest max output           MiniMax-01                   1.0M
```

### Monthly Cost Projection

Planning a production deployment? See what it'll actually cost:

```bash
# 50K requests/month across providers
llm-cost --tokens 500 -o 2000 --monthly 50000 -p openai,anthropic,google --cheap
```

### JSON Output

Pipe into scripts, dashboards, or monitoring:

```bash
llm-cost --tokens 1000 -o 4000 --json --top 5

# Pipe to jq
llm-cost --json --vision --cheap | jq '.models[0].name'
```

The JSON output includes everything — pricing, context windows, capabilities, cache costs:

```json
{
  "input_tokens": 1000,
  "output_tokens": 4000,
  "source": "live from OpenRouter",
  "models": [
    {
      "id": "google/gemini-2.5-flash",
      "provider": "Google",
      "name": "Gemini 2.5 Flash",
      "input_per_1m": 0.15,
      "output_per_1m": 0.6,
      "context_window": 1048576,
      "max_output": 65536,
      "estimated_cost": 0.00255,
      "capabilities": {
        "vision": true,
        "audio": true,
        "tools": true,
        "reasoning": true,
        "structured_output": true
      },
      "cache_read_per_1m": 0.0188,
      "cache_write_per_1m": 0.0469
    }
  ]
}
```

### List All Models

```bash
# List everything
llm-cost --list

# List by provider
llm-cost --list -p anthropic

# Force refresh from API
llm-cost --refresh --list
```

---

## All Options

```
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
```

---

## How Pricing Data Works

**Live data, not hardcoded tables.**

`llm-cost` fetches real-time pricing from the [OpenRouter models API](https://openrouter.ai/api/v1/models), which aggregates pricing for 200+ models across all major providers. The API returns **base provider prices** (what OpenAI, Anthropic, Google, etc. charge directly), not marked-up reseller prices.

The data includes:
- **Input/output pricing** per token
- **Context window** size
- **Max output tokens**
- **Capabilities** — vision, audio, video, tool calling, reasoning, structured output
- **Cache pricing** — read and write costs for prompt caching
- **Thinking/CoT pricing** — cost of internal reasoning tokens

### Caching Strategy

To keep things fast while staying current:

1. **First run** → fetches live from OpenRouter, caches to `~/.llm-cost/models.json`
2. **Subsequent runs** → uses local cache (6-hour TTL)
3. **`--refresh` flag** → forces a fresh fetch, bypassing cache
4. **Offline** → falls back to stale cache, then hardcoded fallback data (15 major models)

Your pricing data is never more than 6 hours old, and you can always force a refresh.

---

## Interactive Dashboard

Prefer a visual interface? **[LLMWise](https://llmwise.ai)** has an interactive pricing dashboard with:

- **Visual price comparison** — charts and scatter plots
- **Interactive filters** — click to toggle capabilities
- **Cost calculator** — sliders for tokens, live cost updates
- **Model cards** — full details for every model
- **Side-by-side comparisons** — compare model outputs directly
- **Smart routing** — automatically route to the cheapest model that fits your needs

`llm-cost` is built by the [LLMWise](https://llmwise.ai) team. The CLI is free and open source. The dashboard is free to try.

---

## Data Sources

All pricing data comes from the [OpenRouter models API](https://openrouter.ai/api/v1/models), which aggregates official pricing from:

- [OpenAI](https://openai.com/pricing) — GPT-4.1, GPT-5, o3, o4-mini, etc.
- [Anthropic](https://anthropic.com/pricing) — Claude Opus, Sonnet, Haiku
- [Google](https://ai.google.dev/pricing) — Gemini 2.5 Pro, Flash, Lite
- [DeepSeek](https://platform.deepseek.com/api-docs/pricing) — V3, R1
- [Meta](https://llama.meta.com/) — Llama 4 (via hosted providers)
- [xAI](https://x.ai/) — Grok 3, Grok 4
- [Mistral](https://mistral.ai/) — Large, Small, Nemo
- [Cohere](https://cohere.com/pricing) — Command A
- And 20+ more providers

Prices are per 1M tokens in USD. If you spot an error, [open an issue](https://github.com/LLMWise-AI/llm-cost/issues).

---

## Common Workflows

### "What's the cheapest model for my chatbot?"

```bash
# Cheapest with tool calling (for function-based chatbots)
llm-cost --tools --cheap --tokens 500 -o 2000
```

### "I need vision but I'm on a budget"

```bash
# Cheapest vision models
llm-cost --vision --cheap --caps
```

### "How much will our AI feature cost at scale?"

```bash
# 100K requests/month, 500 input + 2000 output tokens
llm-cost --tokens 500 -o 2000 --monthly 100000 --top 10
```

### "Should I switch from GPT-4.1 to Claude Sonnet?"

```bash
llm-cost -m gpt-4.1,claude-sonnet --tokens 1000 -o 4000
```

### "Which model has the biggest context window?"

```bash
llm-cost --sort context --top 10
```

### "Give me everything as JSON for my cost monitoring script"

```bash
llm-cost --json --tokens 500 -o 2000 | jq '.models[] | {name, estimated_cost}'
```

---

## Why Not Just Check the Pricing Pages?

You could. But:

1. **There are 200+ models now.** Across OpenAI, Anthropic, Google, DeepSeek, Meta, xAI, Mistral, Cohere, and dozens of open-source model hosts. Good luck opening 15 tabs.

2. **Prices change constantly.** OpenAI alone has changed pricing 5+ times in the past year. Anthropic dropped Haiku prices. Google reshuffled Flash tiers. Your mental model of "which is cheapest" is probably already outdated.

3. **Cost depends on your use case.** The cheapest model overall isn't the cheapest model *that supports vision and tool calling with 128K context*. Filtering matters.

4. **Cache pricing is hidden leverage.** Anthropic and Google both offer prompt caching that cuts input costs by 90%. But most pricing pages bury this info. `llm-cost --detail` surfaces it.

5. **Monthly projections require a calculator.** "How much is $3/1M tokens for 50K requests at 2000 tokens each?" — `llm-cost --monthly 50000` does this instantly.

---

## Contributing

Found a bug? Want to add a feature? PRs welcome.

```bash
git clone https://github.com/LLMWise-AI/llm-cost.git
cd llm-cost
node bin/llm-cost.mjs --refresh --list
```

The entire tool is a single file (`bin/llm-cost.mjs`). Zero dependencies. Read it in 10 minutes.

### Ideas for Contributions

- [ ] Colored output (detect TTY, use ANSI codes)
- [ ] `--watch` mode — re-fetch and display every N minutes
- [ ] Price alerts — notify when a model drops below a threshold
- [ ] Historical price tracking — snapshot + diff over time
- [ ] `--compare` mode — side-by-side model comparison
- [ ] Shell completions (bash, zsh, fish)

---

## License

MIT — do whatever you want with it.

Built by [LLMWise](https://llmwise.ai) — one API, every LLM, smart routing.
