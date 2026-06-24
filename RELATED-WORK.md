# Related work and prompt-lab context

This note situates [**Wasting Assets and Regenerative Scarcity: An Empirical Study of Competitive Text Under Public Scoring**](https://github.com/mwitmore/cogcoin-regenerative-scarcity) relative to prompt-engineering and specification literature. The full PDF is the measured field report; this page is for readers who want citations without a literature survey inside the paper.

---

## Static prompts on fixed benchmarks

Prompt engineering work over the last few years has mostly treated prompts as static interfaces to frozen models, tuned on fixed benchmarks. Surveys emphasize taxonomies of techniques (zero/few-shot prompting, chain-of-thought, self-consistency, instruction templates, and so on) and evaluate them under a fixed reward or metric, with no competitive pressure or copy incentive acting on the prompts themselves. In that setting, a prompt is a task-oriented instruction that improves performance on a dataset, not an object that has to survive adversarial use or economic erosion.

**Surveys and taxonomies**

- [A Systematic Survey of Prompt Engineering in Large Language Models](https://arxiv.org/abs/2402.07927) (arXiv:2402.07927)
- [A Survey of Prompt Engineering Methods in Large Language Models for Different NLP Tasks](https://arxiv.org/abs/2407.12994) (arXiv:2407.12994)
- [The Prompt Report](https://trigaten.github.io/Prompt_Survey_Site/)

## Prompts as contracts; meta-prompting offline

A second thread treats prompts or natural-language instructions as **contracts** or specifications that should be precise, testable, and sometimes even formally checkable. Language models are asked to generate or verify structured specs, or to map between legal/technical prose and formal DSLs. Separately, **meta-prompting** and automated prompt-optimization systems add an outer loop that proposes prompt revisions, scores them with an oracle or reward model, and keeps only those that improve performance beyond a guard threshold. These systems typically run offline, optimize against a single reward signal, and do not expose their winning prompts to a public field where others can immediately imitate them.

**Contracts and specifications**

- [Natural Language based Specification and Verification](https://arxiv.org/html/2605.11315v1)
- [Towards the LLM-Based Generation of Formal Specifications from Natural-Language Contracts: Early Experiments with Symboleo](https://www.emergentmind.com/papers/2411.15898)
- [5C Prompt Contracts: A Minimalist, Creative-Friendly, Token-Efficient Prompt Design](https://arxiv.org/html/2507.07045v1)

**Meta-prompting and prompt optimization**

- [Meta Prompting for AI Systems](https://arxiv.org/pdf/2311.11482.pdf) (arXiv:2311.11482)
- [Exploring Prompt Optimization](https://www.langchain.com/blog/exploring-prompt-optimization) (LangChain)

## What Cogcoin adds

The Cogcoin setting studied in the report can be read as a **live prompt laboratory** that touches all three strands:

1. **Constraint-facing contracts.** The mining instruction on the LLM path states what the five required words must do and must hold under changing five-word draws and a fixed external oracle (the public WASM scorer).

2. **Guarded outer loops.** Meta-prompt experiments in Section 6 of the report implement a revision loop similar to meta-prompting work, but score candidates through a WASM bundle any competitor can query offline.

3. **Cleartext imitation pressure.** Every winning sentence is on chain in the clear; the scoring rule is public. Any successful contract is exposed to copy, in-template hill-climbing, and rent erosion. Durable advantage depends on discovering the next gate-passable **form** before the last one's rent is competed away.

Where most prompt-engineering papers ask how to optimize a prompt against a **static metric**, Cogcoin offers a way to study whether **serial prompt and form invention** can remain economically viable when each success is observable and rents are transient.

For protocol mechanics (gates, blend weights, MINE expiry), see the [Cogcoin protocol specification](https://cogcoin.org/whitepaper.md).
