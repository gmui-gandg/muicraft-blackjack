FROM node:24.22.1-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.cjs tsconfig.json tsconfig.node.json ./
COPY src ./src
ARG SOURCE_COMMIT
RUN node -e 'if (!/^[a-f0-9]{40}$/.test(process.env.SOURCE_COMMIT ?? "")) { throw new Error("SOURCE_COMMIT must be the full source Git commit"); }'
RUN FACTORY_RUNTIME_CANDIDATE="$SOURCE_COMMIT" npm run build

FROM nginx:1.30.6-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/ /usr/share/nginx/html/
EXPOSE 80
