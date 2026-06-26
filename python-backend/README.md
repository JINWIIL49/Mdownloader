# python-backend

This directory contains the FastAPI backend used for video background removal.

Deployment options

- Docker (recommended for most hosts):

  Build and run locally:

  ```bash
  docker build -t ss-vault-python-backend python-backend
  docker run -p 8000:8000 ss-vault-python-backend
  ```

  Or use docker-compose from project root:

  ```bash
  docker-compose up --build python-backend
  ```

- PaaS (Heroku / Railway):

  This repo includes a `Procfile` which tells the platform how to start the app:

  - `web: uvicorn main:app --host 0.0.0.0 --port $PORT`

  Push the `python-backend` contents to your service or configure the project root to run the `python-backend` service. The Procfile will cause the server to be started automatically by the platform.

Local development

1. Create a virtualenv and install dependencies:

```bash
python -m venv .venv
.\.venv\Scripts\Activate.ps1  # Windows PowerShell
pip install -r requirements.txt
```

2. Start the server:

```bash
uvicorn main:app --reload --port 8000
```

The server will be available at `http://localhost:8000`.
