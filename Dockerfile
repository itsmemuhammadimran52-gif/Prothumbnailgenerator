# --- Step 1: Build the React App ---
FROM node:20-alpine AS build
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

# Copy build output to Nginx public folder
COPY --from=build /app/dist /usr/share/nginx/html

# Expose port
EXPOSE 8080

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]
