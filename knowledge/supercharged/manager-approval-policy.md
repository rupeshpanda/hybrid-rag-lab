---
document: manager-approval-policy
title: Manager Approval Policy
policy_type: approval
tier: all
region: all
version: 2026.1
---

## §1 Purpose

This policy sets the dollar thresholds above which a normal-return refund requires manager approval before
Finance issues a credit memo, protecting the company from large, automatically approved outflows.

## §2 Threshold by Tier

The default automatic approval threshold is $5,000 for Gold-tier distributors, $2,000 for Silver-tier
distributors, and $1,000 for Standard-tier distributors. A refund at or below the applicable threshold does
not require manager approval. A refund above the threshold does.

## §3 Contract Overrides

An individual distributor contract may set a different approval threshold than its tier default. Where a
contract-level threshold exists, it takes precedence over the tier default.

## §4 What Counts Toward the Threshold

The threshold applies to the calculated refund amount for the normal-return portion of a request, that
is, after the restocking fee has been applied. Warranty-approved replacement or credit value for installed
defective units is tracked separately and does not, by itself, trigger this approval gate.

## §5 Escalation

When manager approval is required, the request should be flagged clearly in the agent's response and in
the evidence panel decision, with the calculated refund amount and the applicable threshold both shown, so
a human reviewer can see exactly why approval is required.

## §6 No Bypass

The LLM must never state that a refund has been approved when the calculated amount exceeds the applicable
threshold. This is a deterministic control enforced by the rules engine, not a judgment call for the
language model.
