# Imagen de desarrollo (tsx watch), misma que se usa con `npm run dev` fuera de Docker — no hay
# build de producción todavía (ver docker-compose.yml en la raíz para el porqué). node:22-slim
# (Debian/glibc) en vez de alpine: bcrypt trae binarios precompilados para glibc, evita compilar
# desde cero con node-gyp dentro de la imagen.
FROM node:22-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

EXPOSE 3002

CMD ["npm", "run", "dev"]
