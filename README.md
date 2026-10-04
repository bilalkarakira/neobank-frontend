# NeoBank Frontend

Angular 22 (standalone components, signals) + Tailwind CSS 4. Backend lives in `../neobank-backend`.

## Run
```bash
npm install
npm start        # http://localhost:4200, /api is proxied to http://localhost:8080 (see proxy.conf.json)
npm test         # Vitest
```
Start the backend first (`docker compose up -d` and `./mvnw spring-boot:run` in `neobank-backend`).

## Structure
```
src/app/
  core/auth/      auth service, token storage, HTTP interceptor, route guards
  features/       auth/login, auth/register, home (lazy-loaded)
```

## Security note
The access token is kept in `localStorage` (see `core/auth/token-storage.ts`). This is a known XSS
trade-off, accepted until refresh tokens (F2b) allow an httpOnly-cookie flow. It is isolated in one file.
