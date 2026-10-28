# Verification log

Date: 2026-10-27. Method: fetched each provider's primary developer documentation and compared it to the guide's claims. **No provider app was registered and no setup was attempted.** Pages were read through an automated page-to-text summariser, so field names should still be spot-checked in the real UI.

## Summary

| Guide | Pages read | Claims tagged confirmed | Left unconfirmed |
|---|---|---|---|
| GitHub | 1 | 4 | client-secret handling, org third-party restrictions |
| Slack | 2 (+1 that 404'd) | 8 | Marketplace review time/requirements, app-creation UI steps |
| Google | 4 | 9 | verification review time, assessment cost |
| LinkedIn | 2 | 5 | Company Page requirement, approval timelines |
| Notion | 1 | 5 | review duration/criteria, whether review blocks own-workspace testing |

## Second pass (2026-10-28): unconfirmed claims resolved against sources

Items first written as "general knowledge" were looked up and the guides updated:

- **Google 100-user cap: confirmed, and stricter than I wrote.** It is a lifetime cap of 100 *new users* after the unverified-app screen is shown, "cannot be reset or changed" ([source](https://support.google.com/cloud/answer/15549945)). Guide now says so.
- **Google 7-day testing refresh token: confirmed, with an exception I had missed.** It does not apply when scopes are limited to name, email and profile ([source](https://developers.google.com/identity/protocols/oauth2#expiration)).
- **New finding: 100 refresh tokens per account per client ID**, oldest silently invalidated. Added to the guide; relevant to anyone re-authorizing in a loop.
- **Slack public distribution: confirmed.** It is called *unlisted distribution*, is activated under Manage Distribution, and does **not** need Marketplace review; Marketplace listing is only recommended for commercial apps ([source](https://docs.slack.dev/distribution/)). This changes the Slack wait from "unknown" to "none for unlisted distribution". Admin approval per workspace was added as a blocker-type nuance.
- **Still unresolved:** Google verification turnaround, Google security-assessment cost, Slack Marketplace review time/requirements (provider pages checked do not state them).

## Corrections and findings from checking

- **Slack docs moved.** `api.slack.com/authentication/oauth-v2` returns a 302 to `docs.slack.dev/authentication/installing-with-oauth`. Guide cites the new URL.
- **Slack Marketplace review guide could not be loaded** (guessed URL returned 404). Review requirements and timing are therefore listed as unverified rather than asserted.
- **GitHub docs say nothing about review.** I wrote "no documented review", not "no review", and kept org-level third-party restrictions as unconfirmed. The same page recommends considering a GitHub App before an OAuth app, which became a decision step in the guide.
- **LinkedIn docs are internally inconsistent.** The auth-flow page's sample requests use legacy `liteprofile`, while the permissions table lists `profile`/`email` via OpenID Connect. The guide follows the permissions table and flags the discrepancy.
- **The first Google help pages I read did not state** the 100-user cap or testing-mode token expiry, even though these are widely repeated, so they were first left `unconfirmed`. Other pages later confirmed both (see the second pass above); verification turnaround is still not published.
- **Notion's authorization URL is gated on review submission.** This is the key nuance for planning: you cannot start the user flow until the connection is submitted. Review duration is not documented on the page read.

## Not verified at all

- Real approval durations for any provider (providers largely do not publish them).
- Any behaviour that requires a signed-in console: exact UI labels, plan restrictions, fees.
- The optional Anthropic path (never run). The Gemini path was run on one app (Zoom) only, and its output was not independently checked yet.

## Suggested next verification step

Have a browser-driving agent attempt registration for the two easiest guides (GitHub, Slack) with a throwaway account, record where it stalls (2FA, CAPTCHA, email verification), and write those stall points back into the `agentCan` / `developerMust` lists as observed facts.
