# Implementation Plan: fullstack-hello-world

## Overview

Implement a full-stack "Hello World" application with a FastAPI backend and a React + Vite + Tailwind CSS frontend. The backend exposes a single `GET /api/hello` endpoint; the frontend fetches it on mount and renders the response with loading and error states. A README documents how to run both services.

## Tasks

- [x] 1. Set up the backend
  - Create the `/backend` directory with `main.py` and `requirements.txt`
  - In `main.py`: create a FastAPI `app` instance, configure `CORSMiddleware` to allow `http://localhost:5173`, define the `GET /api/hello` route returning `{"message": "Hello World"}` via a `HelloResponse` Pydantic model
  - In `requirements.txt`: add `fastapi` and `uvicorn[standard]`
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [ ]* 1.1 Write backend unit tests
    - Create `/backend/test_main.py` using `pytest` and FastAPI's `TestClient`
    - Test that `GET /api/hello` returns status 200 and body `{"message": "Hello World"}`
    - Test that the CORS `access-control-allow-origin` header is present for `http://localhost:5173` and absent for a disallowed origin
    - _Requirements: 1.1, 1.2, 1.3_

- [x] 2. Scaffold the frontend
  - Initialise a Vite + React project inside `/frontend` using pnpm (e.g. `pnpm create vite frontend --template react`)
  - Install Tailwind CSS, PostCSS, and Autoprefixer as dev dependencies and run `npx tailwindcss init -p` to generate `tailwind.config.js` and `postcss.config.js`
  - Configure `tailwind.config.js` content paths to include `./index.html` and `./src/**/*.{js,jsx,ts,tsx}`
  - Add the Tailwind directives (`@tailwind base/components/utilities`) to the main CSS file
  - _Requirements: 2.1, 2.2, 2.3_

- [x] 3. Implement the App component
  - Replace the default `src/App.jsx` with the greeting-fetch component
  - On mount (`useEffect`), send a `fetch` request to `http://localhost:8000/api/hello`
  - Manage three UI states: `{ status: "loading" }`, `{ status: "success", message }`, `{ status: "error", message }`
  - Render a loading indicator while the request is in-flight, the `message` value on success, and a human-readable error string on failure (network error or non-2xx response)
  - Apply Tailwind utility classes for basic styling
  - _Requirements: 2.4, 2.5, 2.6, 2.7_

  - [ ]* 3.1 Write frontend unit tests
    - Create `/frontend/src/App.test.jsx` using Vitest and React Testing Library
    - Test that a loading indicator is shown while the fetch is pending
    - Test that the greeting message is displayed after a successful fetch
    - Test that an error message is displayed when the fetch rejects (network error)
    - Test that an error message is displayed when the fetch resolves with a non-ok response
    - _Requirements: 2.4, 2.5, 2.6, 2.7_

- [x] 4. Checkpoint — Ensure all tests pass
  - Run backend tests: `cd backend && /opt/homebrew/bin/python3 -m pytest`
  - Run frontend tests: `cd frontend && pnpm test --run`
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Write the project README
  - Create `README.md` at the repository root
  - Include instructions for installing backend dependencies with `/opt/homebrew/bin/python3` and `pip`
  - Include instructions for installing frontend dependencies with `pnpm install` inside `/frontend`
  - Include the command to start the backend: `cd backend && /opt/homebrew/bin/python3 -m uvicorn main:app --reload`
  - Include the command to start the frontend: `cd frontend && pnpm dev`
  - Document the accessible URLs: backend at `http://localhost:8000`, frontend at `http://localhost:5173`
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 6. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- No property-based tests are included — the backend has a fixed response with no input variation, and the frontend is a deterministic UI rendering layer (see design document)
- Each task references specific requirements for traceability
- Both services must be running simultaneously to verify the full-stack connection; the README documents how to do this
