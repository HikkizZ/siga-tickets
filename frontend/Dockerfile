# Imagen de desarrollo (vite dev), misma que se usa con `npm run dev` fuera de Docker. No hay build
# de producción todavía: el preset de Nitro que usa esta plantilla (@lovable.dev/vite-tanstack-config)
# apunta a Cloudflare Workers por defecto (confirmado corriendo `npm run build`: genera wrangler.json
# y un worker, no un server Node ni un sitio estático plano) — desplegar eso necesita `wrangler`, no
# un contenedor Docker simple. Si en algún momento se quiere una imagen de producción, hay que decidir
# antes si el destino real es Cloudflare Workers (usar wrangler) o cambiar el preset de Nitro a
# node-server/static.
FROM node:22-slim

WORKDIR /app

COPY package*.json ./
# `npm ci` exige que package-lock.json esté perfectamente sincronizado con package.json y falla
# acá (deriva real del lockfile del repo, no algo introducido por Docker — confirmado corriendo
# `npm ci --dry-run` fuera de Docker). `npm install` sí tolera esa deriva; no se toca el lockfile
# committeado, solo cambia cómo se instala dentro de la imagen.
RUN npm install

COPY . .

EXPOSE 8080

CMD ["npm", "run", "dev"]
