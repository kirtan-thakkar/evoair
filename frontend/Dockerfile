FROM node:20-alpine

WORKDIR /app

# Copy package manifests first to leverage Docker layer caching
COPY package*.json ./

RUN npm install --legacy-peer-deps

# Copy application source code
COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
