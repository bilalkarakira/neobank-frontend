# NeoBank Frontend

Angular 22 (standalone components, signals) + Tailwind CSS 4: the web app of NeoBank, a simulated retail bank that also issues test
cards. The best place to start is the overview in the `neobank-demo` repository (its README and docs).

## Run
```bash
npm install
npm start        # http://localhost:4200, /api is proxied to http://localhost:8080 (see proxy.conf.json)
npm test         # Vitest: every page has tests
npx ng build     # production build
```
Start the backend first (see `neobank-backend`).

## What is in it
```
src/app/
  core/auth/      auth service, HTTP interceptor (one refresh for many failing calls), route guards
  features/       auth (login, register), accounts, dashboard, transfer, history, recurring payments,
                  cards (issue, freeze, limit, activity, disputes, online payments waiting for approval),
                  notifications, account-security (password, sessions), admin (customers, authorizations, clearing, settlement, disputes ...)
```

## Security note
The access token is kept in memory only. The refresh token is an httpOnly, SameSite=Strict cookie that scripts cannot read, and the
calls that use the cookie send a custom header so a cross-site request cannot. A reload brings the session back through the cookie.
A card's number, PIN and security code are shown once, when it is issued, and are gone from the page once dismissed.

## Known limits
Light theme only (no dark mode). Looked at in a browser pane at phone width; not checked on tablets, with a keyboard only or with a screen reader.
