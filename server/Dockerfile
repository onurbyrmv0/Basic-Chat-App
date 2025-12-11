FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

# Install mongodb-tools for backup capability
RUN apk add --no-cache mongodb-tools

RUN npm install

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
