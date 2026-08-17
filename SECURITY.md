# Security Policy

Swipe holds and moves user funds (ETH, USDC, $SWIPE) through the contracts
in [`contracts/`](contracts/). Treat anything that affects fund safety as
sensitive.

## Reporting a vulnerability

**Do not open a public GitHub issue for security bugs.** Public issues on a
funds-handling contract can be exploited before anyone has a chance to fix
it.

Instead, report privately through one of:

- [GitHub Security Advisories](https://github.com/Story91/Swipe/security/advisories/new)
  for this repository (preferred — keeps the report and any fix coordinated
  in one place).
- Direct message to the maintainers via the channels linked from
  [theswipe.app](https://theswipe.app), if the advisory route isn't
  available to you.

Please include:

- The contract(s) and network affected (Base mainnet/Sepolia, Robinhood
  Chain mainnet/testnet, or local).
- Steps to reproduce, or a PoC if you have one.
- Impact — funds at risk, griefing, denial of service, etc.

## Scope

In scope:
- Everything under `contracts/` (excluding `contracts/mocks/`, which is
  test-only and never deployed with real funds).
- The frontend/API code paths that construct or submit transactions against
  those contracts.

Out of scope:
- Third-party infrastructure (RPC providers, Base, Robinhood Chain, wallet
  software, Farcaster/Neynar, OnchainKit).
- The AI assistant (`app/components/AIAssistant/`,
  `app/api/ai-assistant/`) for anything short of a security issue in how it
  handles user input — it's proprietary and out of scope for licensing
  questions, but a real vulnerability there should still be reported here.

## Response

We aim to acknowledge reports within a few days and to keep the reporter
updated as a fix is developed. Coordinated disclosure — we'll agree on a
disclosure timeline with you once a fix is ready, rather than going public
immediately.

## Bug bounty

A funded bug bounty (paid from protocol treasury) is planned as part of the
open-source rollout but is not live yet. This file will be updated with
scope and reward tiers once it launches. Until then, reports are still
welcome and will be credited.
