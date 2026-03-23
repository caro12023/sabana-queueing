# Sabana Queueing

Sabana Queueing es una app web full stack para medir colas: registra llegadas en vivo, inicia y finaliza servicios con un toque, asigna ID automático por cliente, calcula λ, μ, utilización, Wq, Lq y genera un diagnóstico más sólido del cuello de botella.

## Estructura

- `frontend/`: React + Vite + Recharts
- `backend/`: Node.js + Express + Prisma + PostgreSQL

## Requisitos

- Node.js 20.19+ o 22.12+
- Una base de datos PostgreSQL (Supabase, Railway Postgres, Neon, etc.)

## Arranque rápido local

### 1) Backend

```bash
cd backend
cp .env.example .env
npm install
npx prisma generate
npx prisma migrate dev --name init
npm run dev
```

### 2) Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

El frontend abrirá normalmente en `http://localhost:5173` y hablará con el backend en `http://localhost:4000/api`.

## Variables de entorno

### `backend/.env`

```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/sabana_queueing?schema=public"
PORT=4000
CORS_ORIGIN="http://localhost:5173"
```

### `frontend/.env`

```env
VITE_API_URL="http://localhost:4000/api"
```

## Flujo de uso

1. Crea un estudio.
2. Inicia la jornada de observación.
3. Registra cada llegada con un toque.
4. Cuando comience la atención, toca iniciar servicio.
5. Cuando termine, toca finalizar servicio.
6. Revisa dashboard y exporta el Excel.

## Exportación paso a paso

El Excel genera estas hojas:

- `Resumen`
- `Paso_a_paso`: eventos en secuencia (inicio de jornada, llegada, inicio de servicio, fin de servicio, cierre de jornada)
- `Clientes`
- `Sesiones`
- `Diario`

## Despliegue recomendado

- Frontend: Vercel
- Backend: Railway
- Base de datos: Supabase Postgres o Railway Postgres


## Despliegue paso a paso

### Base de datos (Supabase o Railway Postgres)

1. Crea una base PostgreSQL.
2. Copia la cadena de conexión completa.
3. Pégala como `DATABASE_URL` en el backend.

### Backend en Railway

1. Sube este proyecto a GitHub.
2. En Railway crea un proyecto nuevo.
3. Conecta el repositorio.
4. En el servicio del backend define el **Root Directory** como `/backend`.
5. En Variables agrega:
   - `DATABASE_URL`
   - `PORT=4000`
   - `CORS_ORIGIN=https://TU-FRONTEND.vercel.app`
6. En Deployments o Settings usa estos comandos si Railway no los detecta:
   - Build: `npm install && npx prisma generate`
   - Start: `npm start`
7. Abre el shell o comando de Railway y ejecuta una vez:
   - `npx prisma migrate deploy`
8. Verifica que `/api/health` responda correctamente.

### Frontend en Vercel

1. Importa el mismo repositorio en Vercel.
2. En la configuración del proyecto selecciona **Root Directory** = `frontend`.
3. Agrega la variable:
   - `VITE_API_URL=https://TU-BACKEND.up.railway.app/api`
4. Despliega.
5. Abre la URL y crea tu estudio.

## Qué exporta exactamente

El Excel final incluye una hoja **Paso_a_paso** con una secuencia ordenada así:

1. Inicio de jornada
2. Llegada de cliente con ID
3. Inicio de servicio de ese cliente
4. Fin de servicio de ese cliente
5. Fin de jornada

Eso te deja la tabla exportada como trazabilidad completa del proceso.
