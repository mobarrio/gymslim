# 1. Usar una imagen base oficial de Node.js (ligera y segura)
FROM node:20-alpine

# 2. Establecer el directorio de trabajo dentro del contenedor
WORKDIR /app

# 3. Copiar los ficheros de definición de dependencias
COPY package.json ./
# (Si tienes package-lock.json, cópialo también)
# COPY package-lock.json ./ 

# 4. Instalar las dependencias de la aplicación
RUN npm install

# 5. Copiar el resto del código de la aplicación al contenedor
COPY . .

# 6. Cambiar al usuario 'node' (que existe en esta imagen)
#    Esto es una buena práctica de seguridad (no correr como root)
USER node

# 7. Exponer el puerto en el que corre la aplicación
EXPOSE 3000

# 8. El comando para iniciar la aplicación
CMD [ "npm", "start" ]
