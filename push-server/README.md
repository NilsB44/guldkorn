# Guldkorn push server

A ~150-line Cloudflare Worker that sends the weekly or monthly "time to pick your photos ✨" notification.
It runs on Cloudflare's **free plan** at a `*.workers.dev` address, so **no domain and no server to maintain**.

```
 iPhone app ──PUT /subscription──▶  Worker ──stores──▶ KV (anonymous push address + next time)
                                      │
                         cron every 15 min: anything due? ──▶ Apple push service ──▶ 🔔 on her phone
```

**What it stores per phone:** the push subscription (an opaque URL at Apple + encryption keys), the time of
the next reminder, and the reminder text. No photos, names, e-mail or IP logs. The notification content
is end-to-end encrypted (RFC 8291), so Apple can't read it either.

**Protection:** only requests from the app's own site are accepted (CORS), only real push-service URLs
can be registered (so the Worker can't be used to call arbitrary sites), there are at most 20 subscriptions,
test pushes are rate-limited, and dead subscriptions (410/404) are deleted automatically.

## One-time setup (≈5 min)

1. Create a free account at https://dash.cloudflare.com/sign-up (email only; no card, no domain).
2. From this folder:
   ```powershell
   npm install
   npm run setup
   ```
   This opens the browser to log in to Cloudflare. It then creates the storage, generates the keys
   (the private key goes straight into Cloudflare as a secret and is never saved on disk), deploys,
   and prints the Worker URL.
   *If Cloudflare asks you to pick a `workers.dev` subdomain, choose any name.*
3. Put the printed URL into `../src/config.ts` → `pushServerUrl`, then commit and push. GitHub Pages redeploys
   the app, and **Inställningar → Påminnelse → Slå på påminnelser** appears.

## Everyday

| Task | Command |
|---|---|
| Deploy a change | `npm run deploy` |
| Watch live logs (e.g. while sending a test push) | `npm run logs` |
| Unit tests | `npm test` |

`wrangler.toml` contains only public values (KV id, public key, allowed origin), so it's safe to commit.
To test push from `npm run dev` on localhost, add `,http://localhost:5173` to `ALLOWED_ORIGIN` and redeploy.

## How reminder timing works

The **app** computes when the next reminder should fire (its reminder weekday/time, aligned with when the
next round is due) and sends it to the Worker whenever she opens the app, finishes a round, or changes a
setting. If she ignores a reminder, the Worker repeats it after `repeatDays` (weekly at most). Opening the
app corrects the schedule again.
