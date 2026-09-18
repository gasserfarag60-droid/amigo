FROM node:18-alpine
WORKDIR /usr/src/app

# copy package manifests first to install dependencies
COPY package*.json ./
RUN npm ci --only=production

# copy app source
COPY . .

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
