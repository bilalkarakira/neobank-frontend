# NeoBank web app

The web app of **NeoBank**, a simulated card-issuing neobank: the customer's side (accounts, transfers, history, cards) and the
bank's admin side (clearing, settlement, disputes). Built with Angular 22 (standalone components, signals) and Tailwind CSS 4.

This is the **frontend** repository. The API, the card network and the demo stack are in the companion repository
[neobank-backend](https://github.com/OWNER/neobank-backend), which also explains the whole project (what it simulates, how a card
payment moves, the project plan and its limits). It is a learning and portfolio simulation: test cards only, no real money.

## What is in it

| Area | What you can do |
|---|---|
| **Accounts** | open checking and savings accounts, deposit, see balances and what is reserved by card payments |
| **Dashboard** | balance over time, income against spending, spending by category |
| **Transfers** | send money with a recipient lookup, a review step and retry-safe requests |
| **History** | filter, sort and page through transactions, export to CSV |
| **Recurring payments** | schedule repeating transfers |
| **Cards** | issue a test card (number, PIN and security code are shown **once**), freeze, set the daily limit, see pending holds and posted payments, dispute a posted payment, and **approve or reject online payments** that wait for you |
| **Notifications** | new device logins, a card frozen after wrong PINs or security codes, requests to approve an online payment |
| **Account security** | change the password, see and end sessions |
| **Admin** (for the bank's staff) | an overview, accounts and customers, security controls, card authorizations, clearing, settlement and reconciliation, disputes, and an audit trail |

## Run it

You need **Node.js 22 or newer** (developed with 24). The app talks to the backend's API on port 8080, so start the backend first
(the [backend README](https://github.com/OWNER/neobank-backend#readme) has the whole stack in one command, or each part on its own).

```bash
npm install
npm start          # http://localhost:4200, /api is proxied to http://localhost:8080 (see proxy.conf.json)
```

Log in as the demo customer `demo@neobank.local` / `DemoPassw0rd` (the backend creates it when it starts with the `demo` profile, which
the Docker stack does). The admin is `admin@neobank.local` / `AdminPassw0rd`. The demo card is `9999 0000 0000 0012`, PIN `4321`,
security code `123`.

## Tests and build

```bash
npm test                # Vitest: every page and the auth interceptor have tests
npx ng build            # production build into dist/neobank-frontend/browser
docker build -t neobank-frontend .      # nginx image with the production build
```

Run `npx ng build` as well as the tests: Vitest does not type-check.

## How it is organised

```
src/app/
  core/auth/      auth service, HTTP interceptor (one refresh for many failing calls), route guards
  features/       auth (login, register), accounts, dashboard, transfer, history, recurring,
                  cards, notifications, account-security, admin
deploy/           nginx configuration used by the Docker image (it passes /api on to the "neobank" service)
Dockerfile        multi-stage build: Node builds the app, nginx serves it
```

## Security notes

The access token is kept in memory only. The refresh token is an httpOnly, SameSite=Strict cookie that scripts cannot read, and the calls
that use the cookie send a custom header so that a cross-site request cannot. A reload brings the session back through the cookie.
A card's number, PIN and security code are shown once, when it is issued, and are gone from the page once dismissed.

## Known limits

Light theme only (no dark mode). Looked at in a browser at phone width; not checked on tablets, with a keyboard only or with a screen
reader. The Cards page asks the backend for waiting approvals every five seconds while the tab is visible; there is no push.
