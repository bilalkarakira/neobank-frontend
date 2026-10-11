# The web app, served by nginx, with /api passed on to NeoBank (the "neobank" service of the demo stack in the backend repository).
FROM node:22-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx ng build

FROM nginx:alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/dist/neobank-frontend/browser /usr/share/nginx/html
EXPOSE 80
