# Verification log

Date: 2026-10-27. Method: fetched each provider's primary developer documentation and compared it to the guide's claims. **No provider app was registered and no setup was attempted.** Pages were read through an automated page-to-text summariser, so field names should still be spot-checked in the real UI.

## Summary

| Guide | Pages read | Claims tagged confirmed | Left unconfirmed |
|---|---|---|---|
| GitHub | 1 | 4 | client-secret handling, org third-party restrictions |
| Slack | 1 (+1 that 404'd) | 6 | public-distribution toggle, Marketplace review time/requirements |
| Google | 2 | 6 | 100-user cap, 7-day testing refresh-token expiry, review time, assessment cost |
| LinkedIn | 2 | 5 | Company Page requirement, approval timelines |
| Notion | 1 | 5 | review duration/criteria, whether review blocks own-workspace testing |

## Corrections and findings from checking

- **Slack docs moved.** `api.slack.com/authentication/oauth-v2` returns a 302 to `docs.slack.dev/authentication/installing-with-oauth`. Guide cites the new URL.
- **Slack Marketplace review guide could not be loaded** (guessed URL returned 404). Review requirements and timing are therefore listed as unverified rather than asserted.
- **GitHub docs say nothing about review.** I wrote "no documented review", not "no review", and kept org-level third-party restrictions as unconfirmed. The same page recommends considering a GitHub App before an OAuth app, which became a decision step in the guide.
- **LinkedIn docs are internally inconsistent.** The auth-flow page's sample requests use legacy `liteprofile`, while the permissions table lists `profile`/`email` via OpenID Connect. The guide follows the permissions table and flags the discrepancy.
- **Google help pages do not state** the 100-user cap, verification turnaround or testing-mode token expiry, even though these are widely repeated. They stay `unconfirmed` and are labelled "general knowledge".
- **Notion's authorization URL is gated on review submission.** This is the key nuance for planning: you cannot start the user flow until the connection is submitted. Review duration is not documented on the page read.

## Not verified at all

- Real approval durations for any provider (providers largely do not publish them).
- Any behaviour that requires a signed-in console: exact UI labels, plan restrictions, fees.
- The live agent path against the Gemini/Anthropic APIs (no key available during development). Parsing, normalization and the stub path are covered by tests.

## Suggested next verification step

Have a browser-driving agent attempt registration for the two easiest guides (GitHub, Slack) with a throwaway account, record where it stalls (2FA, CAPTCHA, email verification), and write those stall points back into the `agentCan` / `developerMust` lists as observed facts.
