FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

# Install postgresql-client for backup capability (pg_dump)
RUN apk add --no-cache postgresql-client

RUN npm install

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
