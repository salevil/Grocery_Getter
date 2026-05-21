# Fullstack Hello World

A full-stack "Hello World" application with a FastAPI backend and a React (Vite + Tailwind CSS) frontend. The frontend fetches a greeting from the backend API and displays it on the page.

## Project Structure

```
.
├── backend/          # FastAPI Python application
│   ├── main.py
│   └── requirements.txt
└── frontend/         # React + Vite + Tailwind CSS application
    ├── src/
    └── package.json
```

## Prerequisites

- [Python](https://brew.sh) via Homebrew at `/opt/homebrew/bin/python3`
- [pnpm](https://pnpm.io/installation)

## Setup

### Backend

Install the Python dependencies from the `/backend` directory:

```bash
cd backend && /opt/homebrew/bin/python3 -m pip install -r requirements.txt
```

### Frontend

Install the Node dependencies from the `/frontend` directory:

```bash
cd frontend && pnpm install
```

## Running the Application

Both services must be running simultaneously for the full-stack connection to work.

### Start the Backend

```bash
cd backend && /opt/homebrew/bin/python3 -m uvicorn main:app --reload
```

### Start the Frontend

```bash
cd frontend && pnpm dev
```

## Accessible URLs

| Service  | URL                     |
|----------|-------------------------|
| Backend API | http://localhost:8000 |
| Frontend    | http://localhost:5173 |

The backend exposes a greeting endpoint at `http://localhost:8000/api/hello`. The frontend dev server is available at `http://localhost:5173`.
