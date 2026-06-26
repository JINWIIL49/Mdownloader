# Deploying the Frontend to Vercel

This project uses Vite for the frontend. To deploy the frontend on Vercel and connect it to the Python backend, follow these steps:

1. Deploy the Python backend to a public host (required for video processing):

   - Recommended hosts: Render, Fly.io, Google Cloud Run, Railway, or any container host that supports Docker.

   - Example (Render): deploy the `python-backend` folder as a web service. The service should be reachable at `https://your-backend.example`.

2. In your Vercel project settings, add an environment variable:

   - **Name:** `VITE_PY_BACKEND_URL`
   - **Value:** `https://your-backend.example` (no trailing slash)

   This value is read at build time by Vite and used by the Background Remover page to contact the backend.

3. Push your repo and create a Vercel project pointing to this repository. Vercel will run `npm run build` and publish the `dist` directory.

Notes and constraints:

- The heavy Python video processing (rembg, OpenCV, ffmpeg) is not suitable for Vercel serverless functions. Host it on a container-capable service and set `VITE_PY_BACKEND_URL` to its public URL.
- If you want to proxy requests through Vercel (not recommended for heavy processing), you can add serverless functions under `/api` and forward calls to your backend.
