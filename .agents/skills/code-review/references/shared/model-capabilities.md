# Model capability reference

Reference revision: 2026-09-26. Named candidates below are a selected starting set, not an exhaustive catalog or leaderboard. This is the only normative named-model mapping in the suite. Research notes are historical evidence; workflow skills must resolve models here.

## Evidence labels and maintenance

- **Documented**: provider specification/positioning, verified at the linked source on the reference date; not independent proof of task success.
- **Judgment**: this suite's qualitative role mapping. Validate against local tasks.
- **Unknown**: host/account access, subscription quota economics, actual task cost, local success rate, or unsupported comparative claim.

Refresh this file when releases, pricing, access, retirement, or local outcomes change a recommendation. Record the date, exact model identifier, source, mapping rationale, and uncertainty. Re-run routing scenarios after changing mappings. If facts are stale or a capability is unknown, refresh primary documentation when available; otherwise provide a conditional route and identify the missing fact. Never silently substitute a model because its name looks similar.

## Durable classes

| Class               | Demand                                                                    |
| ------------------- | ------------------------------------------------------------------------- |
| frontier reasoning  | Ambiguity, architecture, hard debugging, interacting constraints          |
| general engineering | Clear engineering work with moderate multi-file reasoning                 |
| budget execution    | Bounded, mechanical or pattern-following work with decisive verification  |
| long-context work   | Reliable retrieval and synthesis over essential dispersed material        |
| high-autonomy work  | Sustained execution, recovery, state preservation and boundary observance |
| adversarial review  | Finding counterexamples and omissions against original contracts          |

The last three overlap the first three. They are not higher rungs on a universal ladder. Context capacity is a necessary limit check, not a proxy for reasoning or recall quality.

## Candidate mappings (judgment)

| Model / exact identifier            | Primary role                                                     | Conditional additional roles                                                     | Fit limitation                                                                |
| ----------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| GPT-6 Astra / `gpt-6-astra`         | frontier reasoning                                               | high-autonomy, long-context, adversarial review                                  | No local superiority claim over other frontier candidates                     |
| Claude Opus 5.5 / `claude-opus-5-5` | frontier reasoning                                               | high-autonomy, long-context, adversarial review                                  | Provider and tool availability must be checked in target host                 |
| GPT-6 Sol / `gpt-6-sol`             | general engineering                                              | bounded autonomy and partitioned review; long-context when retrieval is verified | Ambiguous/high-cost work may need frontier reasoning                          |
| GPT-6 Luna / `gpt-6-luna`           | budget execution                                                 | bounded engineering with explicit contracts                                      | Do not infer suitability for unbounded architecture or final high-risk review |
| GPT-5.6 Terra / `gpt-5.6-terra`     | budget execution or straightforward general engineering fallback | Pattern-following work when access/quota favors it                               | Lower/older tier is not necessarily lower cost                                |

## Documented anchors

| Source                                                               | Verified anchor                                                                                                                                                                        | Use in routing                                                              |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| [OpenAI catalog](https://developers.openai.com/api/docs/models)      | Astra is positioned for demanding reasoning/coding; family spans different cost/capability profiles. Astra advertised context: 1.05M, standard input/output $10/$50 per million tokens | Supports broad demand classes, not automatic frontier selection             |
| [Sol](https://developers.openai.com/api/docs/models/gpt-6-sol)       | Coding/agentic positioning; 1.05M context; standard input/output $2/$10 per million                                                                                                    | General engineering starting candidate                                      |
| [Luna](https://developers.openai.com/api/docs/models/gpt-6-luna)     | Focused high-volume positioning; 1.05M context; standard input/output $0.10/$0.50 per million                                                                                          | Lower token-price candidate for bounded tasks                               |
| [Terra](https://developers.openai.com/api/docs/models/gpt-5.6-terra) | Cost/intelligence balance; 1.05M context; standard input/output $2/$12 per million                                                                                                     | Not cheaper than Sol on these base rates; quota/access can still justify it |
| [Opus](https://platform.claude.com/docs/en/models/opus-5-5/overview) | Agentic coding positioning; 1M context; standard input/output $4/$20 per million                                                                                                       | Frontier candidate; no inferred cross-provider dominance                    |

These base rates omit cache, long-input, batch, regional, tool, and other mode adjustments. Effective task cost includes retries, output length, and verification. Subscription usage cannot be inferred from API token rates. Advertised context is not the remaining usable window in a host. Confirm essential limits before execution.

Official [GPT-6 guidance](https://developers.openai.com/api/docs/guides/latest-model) and [Opus prompting guidance](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5-5) inform the broad mapping. Provider evals and early tester reports do not establish performance on this suite. No local multi-model trial has been performed.

## Dated named routing examples (judgment, conditional access)

### Explicit multi-file feature with a public API test seam

Preferred: **GPT-6 Sol**, general engineering, reasonable fit. Bounded design and ordinary debugging justify it. Tradeoff: unseen coupling can change the route.

Budget: **GPT-6 Luna**, budget execution, viable with constraints for the full ticket. Lower base token prices are documented above; lower total task cost remains an inference. Risk: hidden interactions or weak verification. Escalate to Sol on repeated failed fixes without new evidence or a newly required interface design; escalate further to frontier reasoning if architectural uncertainty persists. Capability data: 2026-09-26; target-host availability assumed, not verified.

### Cross-system migration design and adversarial review

Preferred: **GPT-6 Astra**, frontier reasoning plus adversarial review, reasonable fit. Coupling and failure cost justify stronger reasoning. Tradeoff: this is a task-fit judgment, not proof it outperforms Opus 5.5; either may fit with local evidence and host access.

Budget: **GPT-6 Sol**, viable for inventory and isolated rehearsals only. Lower base token prices; risk of missing global invariants. Not recommended for unsupervised destructive execution while policy or rollback is unresolved. Escalate to Astra before irreversible work, unknown coupling, or unverifiable rollback; unresolved policy goes to the human owner. Capability data: 2026-09-26; availability conditional.

### Local deterministic formatter change

Preferred: **GPT-6 Luna**, budget execution, strong fit with a complete reference and decisive tests. Budget: **GPT-6 Luna** again; no cheaper viable candidate in this starting set is established. Tradeoff: dynamic integrations could escape a local check. Escalate to GPT-6 Sol if they appear. Capability data: 2026-09-26; availability conditional; price basis is the table, task fit is judgment.
