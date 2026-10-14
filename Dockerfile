# APERT store — production image (Vendure + static storefront)
FROM node:22-slim AS build
WORKDIR /app/apert-server
COPY apert-server/package*.json ./
RUN npm ci --no-audit --no-fund
COPY apert-server/ ./
RUN npx tsc && npx vite build

FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/apert-server/package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY --from=build /app/apert-server/dist ./dist
COPY --from=build /app/apert-server/scripts ./scripts
# Storefront (served same-origin by the server, see STOREFRONT_DIR)
COPY index.html checkout.html ./store/
COPY "Product pics" "./store/Product pics"/
COPY Remove_background_and_format_text_2K_20261013224413.jpg ./store/
COPY apert-server/docker-start.sh ./
ENV APP_ENV=production STOREFRONT_DIR=/app/store
EXPOSE 3000
CMD ["sh", "docker-start.sh"]
