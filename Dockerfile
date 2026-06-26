FROM node:20

WORKDIR /app

# Copy package.json & package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy seluruh source code termasuk prisma/schema.prisma
COPY . .

# Pastikan prisma CLI executable
RUN chmod +x ./node_modules/.bin/prisma

# Generate Prisma client di image build
RUN npx prisma generate

# Expose port
EXPOSE 4002

# Jalankan aplikasi
CMD ["npm", "start"]    
