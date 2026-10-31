FROM node:24-alpine
RUN apk add --no-cache git && git config --system --add safe.directory '*'
WORKDIR /app
COPY server.js ./
COPY public ./public
ENV PORT=8005
CMD ["node", "server.js"]
