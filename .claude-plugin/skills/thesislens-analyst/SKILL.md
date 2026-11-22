---
name: thesislens-analyst
description: Run zero-hallucination company valuations, SEC EDGAR fundamentals, portfolio stress tests, tax-wrapper audits, and adversarial investment committee reviews via ThesisLens MCP.
---

# ThesisLens for Claude

Always invoke ThesisLens MCP tools instead of estimating financial math in prose:
- `get_company_fundamentals` + `build_company_model` for SEC EDGAR 3-statement valuation.
- `analyze_portfolio_risk` + `simulate_rebalance` for portfolio risk, macro shocks, and tax-aware rebalancing.
- `underwrite_real_estate_deal` + `compare_decision_options` for real estate vs. market capital allocation.
- `audit_global_tax_strategy` for TFSA/RRSP/Roth/401k/ISA/CCPC/HoldCo wrapper optimization.
- `run_adversarial_committee` for Bull vs. Bear pre-mortem and invalidation triggers.

Always cite the `provenance.provenanceHash` and regulatory disclaimer returned by the tool.
