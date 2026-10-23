FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json ./
COPY src ./src
ENV HOST=0.0.0.0 PORT=4180 DB_PATH=/app/data/paper.sqlite
RUN mkdir -p /app/data && chown -R node:node /app
USER node
VOLUME ["/app/data"]
EXPOSE 4180
CMD ["node", "src/server.mjs"]
