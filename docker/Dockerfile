# Imagen solo para desarrollo local. En produccion Vercel no usa esto:
# construye las funciones de api/ por su cuenta.
FROM node:22-alpine

WORKDIR /app

# Dependencias de la app (@vercel/postgres) + las del servidor local.
# Se instalan en una capa aparte para que no se reinstalen en cada cambio de codigo.
COPY package.json package-lock.json ./
RUN npm install --no-audit --no-fund \
 && npm install --no-audit --no-fund \
      express@4 \
      @neondatabase/serverless@0.9.5 \
      ws@8

# El codigo se monta como volumen desde docker-compose (hot reload con --watch),
# esto es solo el respaldo para construir la imagen de forma autonoma.
COPY . .

EXPOSE 3000

CMD ["node", "--watch", "docker/server.js"]
