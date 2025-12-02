# --- Step 1: Build the React App ---
FROM node:18-alpine AS build
WORKDIR /app

# Copy package.json and install dependencies
COPY package.json package-lock.json ./
RUN npm install

# Copy rest of project files
COPY . .

# Build production files
RUN npm run build



# --- Step 2: Serve with Nginx ---
FROM nginx:1.25-alpine
COPY --from=build /app/build /usr/share/nginx/html

# Expose port
EXPOSE 8080

# Cloud Run runs on PORT env, so replace nginx default port
CMD ["nginx", "-g", "daemon off;"]
