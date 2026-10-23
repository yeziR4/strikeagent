# StrikeAGent

**Paper trade from an X conversation, powered by live Strike Finance mark prices.**

[Try @StrikeAGentt](https://x.com/StrikeAGentt) · [Live health](https://strikeagent-paper.fly.dev/health) · [Strike trading app](https://app.strikefinance.org)

StrikeAGent gives each user a $10,000 virtual account. Mention the bot to open longs or shorts, inspect a portfolio, check a mark price, close a position, and review results. Signed X Activity webhooks trigger a persistent paper ledger; replies return to the original thread with a link to Strike for independent live trading.

This is an independent hackathon prototype. **All bot positions are simulated.** The bot never connects a user's wallet, holds assets, or submits real orders. Its command parser is deterministic; arbitrary natural-language/LLM trading is not implemented.

## Try it

Post from a public X account other than the bot itself. Start each message with `@StrikeAGentt`:

```text
@StrikeAGentt paper long BTC $100 2x
@StrikeAGentt paper short ETH $50 1x
@StrikeAGentt portfolio
@StrikeAGentt price BTC
@StrikeAGentt markets
@StrikeAGentt close P1
@StrikeAGentt history
@StrikeAGentt stats
@StrikeAGentt help
```

Use the position ID returned to you when closing. `positions` and `balance` alias `portfolio`. The dollar amount is virtual margin, not exposure. Supported markets are BTC, ETH, SOL and ADA; leverage is capped at 5× and each user can have five open positions. Public replies disclose the requested paper-account summary.

The hosted demo is funded and capped for judging. It may pause when its reply or credit reserve limit is reached.

## Strike integration

The mark-price adapter reads `https://api.strikefinance.org/price/v2/markPrice`, validates supported symbols and timestamps, and refuses stale or unavailable prices. It does not invent a fallback fill. The simulator uses those marks with explicit fee and slippage assumptions. Each receipt links to Strike's trading app; opening the link does not prefill or execute a trade.

## Architecture

```text
Public X mention
    → X Activity post.mention.create
    → HTTPS webhook: signature verification + durable queue + deduplication
    → strict command parser + fresh Strike mark
    → transactional SQLite virtual accounts / positions
    → durable reply outbox + budget guard
    → X reply in the original thread
```

- Raw-body HMAC verification and CRC support.
- X user-ID ownership checks; users cannot close others' positions.
- Unique post IDs prevent duplicate deliveries from opening duplicate trades.
- Integer micro-USD account balances; atomic account/position updates.
- Pending command recovery after restart; uncertain replies are never blindly retried.
- Persistent SQLite on a Fly volume; one process per database.
- No third-party runtime dependencies; Node.js 22.13+.

## Run locally

```sh
git clone https://github.com/yeziR4/strikeagent.git
cd strikeagent
cp .env.example .env
npm test
npm run demo -- --fixture
npm run demo
npm start
```

On PowerShell, use `Copy-Item .env.example .env` instead of `cp` if preferred. The fixture demo uses explicitly invented prices; the normal demo fetches live Strike marks. Both create in-memory virtual positions and neither posts to X.

Default endpoint: `http://127.0.0.1:4180/health`. X requires publicly accessible HTTPS for `/webhooks/x`. The Dockerfile listens on `0.0.0.0:4180`; mount persistent storage at `/app/data`.

## X and hosting setup

1. Use an X developer app enrolled for the required API endpoints; configure the bot handle and verified numeric user ID.
2. Store credentials in environment/hosting secret storage. Never commit `.env`, user tokens, client secrets or databases. `.env.example` contains names only.
3. Set `X_CLIENT_SECRET` for CRC and modern webhook signatures. Optional `X_CONSUMER_SECRET` supports legacy signatures.
4. Register `/webhooks/x` with app-only authorization (`X_APP_BEARER_TOKEN`); subscribe to `post.mention.create` with user-context authorization and the bot user-ID filter.
5. Use an OAuth 2 user access token with `tweet.read`, `users.read`, `tweet.write`; request `offline.access` if obtaining a refresh token. An app-only bearer cannot post as the user.
6. Start with `X_REPLY_MODE=draft`. Check a real mention reaches the queue and outbox before enabling posting.
7. Enable `X_REPLY_MODE=live` and `X_AUTOMATION_APPROVED=true` only with account-owner authorization and applicable X automation requirements satisfied. This switch is an operator authorization flag, not proof of approval by X.
8. Configure the demo guard with `X_DEMO_BUDGET_USD`, `X_MAX_REPLY_ATTEMPTS`, and `X_MENTION_SUBSCRIPTION_ID`. The guard checks credit balance, preserves a reserve, counts uncertain sends against the cap, and attempts to stop mention delivery at a limit. X billing lag and in-flight deliveries mean it is not a provider-enforced hard dollar cap.

The included `fly.toml` is a **draft-mode template**, not the hosted account's live configuration. Change its app name before deploying. Attach the persistent volume, set credentials using Fly secrets, then `fly deploy --ha=false`. X and hosting API usage may be billable.

**OAuth token refresh is not automated in this MVP.** A refresh token alone does not extend the running access token. Renew credentials before expiry for ongoing judging; unattended long-term operation requires refresh handling.

## Operator diagnostics

Set `ADMIN_TOKEN` to at least 32 random characters. With `Authorization: Bearer <ADMIN_TOKEN>`:

- `GET /admin/state` shows recent events, replies and positions.
- `POST /admin/mentions` accepts `{"postId":"local-1","userId":"tester","text":"@StrikeAGentt portfolio"}` for local operator testing. It bypasses actual X delivery and must not be presented as proof of a real mention.

`npm run check:x` uses the configured user token to verify the authenticated account. Never expose operator credentials in a public frontend.

## Verification and demo

`npm test` runs **22 tests** covering long/short accounting, ownership, duplicate events, stale prices, atomic rollback, webhook signatures/CRC, HTTP integration, added commands, link-preserving reply formatting, and demo spending controls.

A real mention-to-paper-position-to-public-reply path was verified during development: [first confirmation](https://x.com/StrikeAGentt/status/2113625563189412037). That first reply was operator approved. Automatic replies were subsequently enabled and tested by the account owner. One initial measurement was 6.479 seconds from post creation to server receipt, then 39 ms to create the paper position; this is one observation, not an SLA.

## Simulation limits

- $10,000 virtual starting balance; $1–$10,000 margin subject to available funds.
- Assumed fees: 5 basis points per side; adverse slippage: 5 basis points. These are simulator settings, not Strike's official fee schedule or actual order-book fills.
- Portfolio equity includes estimated exit costs. Funding is not modeled.
- Margin-exhaustion monitoring is a simplified virtual loss cap, not Strike's maintenance-margin liquidation engine.
- No partial fills, stop-loss/take-profit, copy trading, real execution or wallet signing.
- Quantities/prices use bounded floating-point arithmetic; balances use integer millionths of USD.

## References

- [Strike API documentation](https://docs.strikefinance.org/api/market/rest-api/prices)
- [X Activity API](https://docs.x.com/x-api/activity/introduction)
- [X webhook verification](https://docs.x.com/x-api/webhooks/introduction)
- [X API pricing](https://docs.x.com/x-api/getting-started/pricing)
- [X automation rules](https://help.x.com/en/rules-and-policies/x-automation)
