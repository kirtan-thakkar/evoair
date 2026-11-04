FROM node:20-alpine

WORKDIR /app

# Install native dependencies required for bcrypt and other build tools
RUN apk add --no-cache python3 make g++

# Copy package manifests first to leverage Docker layer caching
COPY package*.json ./

RUN npm install

# Copy application code
COPY . .

EXPOSE 5000

CMD ["npm", "run", "dev"]
