# Requirements Document

## Introduction

A full-stack "Hello World" application demonstrating a connected React frontend and FastAPI backend. The frontend is a Vite-based React app styled with Tailwind CSS, located in `/frontend`, managed with pnpm. The backend is a FastAPI Python application located in `/backend`, using the Homebrew Python interpreter at `/opt/homebrew/bin/python3`. The frontend fetches a greeting message from the backend API and displays it. A README.md provides instructions for running both services simultaneously.

## Glossary

- **Frontend**: The React (Vite) application located in the `/frontend` directory
- **Backend**: The FastAPI Python application located in the `/backend` directory
- **API**: The HTTP interface exposed by the Backend that the Frontend consumes
- **Greeting_Endpoint**: The Backend API route that returns a "Hello World" message
- **Dev_Server**: The Vite development server that serves the Frontend
- **CORS**: Cross-Origin Resource Sharing, the mechanism allowing the Frontend to make requests to the Backend from a different origin

## Requirements

### Requirement 1: Backend Greeting API

**User Story:** As a developer, I want a FastAPI backend that exposes a greeting endpoint, so that the frontend has a data source to fetch from.

#### Acceptance Criteria

1. THE Backend SHALL expose a `GET /api/hello` endpoint that returns a JSON response.
2. WHEN a `GET /api/hello` request is received, THE Greeting_Endpoint SHALL return a JSON object containing a `message` field with the value `"Hello World"`.
3. THE Backend SHALL enable CORS to allow requests from `http://localhost:5173` (the default Vite Dev_Server origin).
4. THE Backend SHALL be runnable using the Python interpreter at `/opt/homebrew/bin/python3`.
5. THE Backend SHALL declare all dependencies in a `requirements.txt` file located in the `/backend` directory.

### Requirement 2: Frontend Hello World Display

**User Story:** As a developer, I want a React frontend that fetches and displays the greeting from the backend, so that the full-stack connection is demonstrated.

#### Acceptance Criteria

1. THE Frontend SHALL be scaffolded using Vite with the React template inside the `/frontend` directory.
2. THE Frontend SHALL use Tailwind CSS for styling.
3. THE Frontend SHALL be managed with pnpm, with all dependencies declared in `/frontend/package.json`.
4. WHEN the Frontend application loads, THE Frontend SHALL send a `GET` request to the Backend's `GET /api/hello` endpoint.
5. WHEN the Backend response is received, THE Frontend SHALL display the `message` value from the JSON response on the page.
6. WHILE the Backend request is in progress, THE Frontend SHALL display a loading indicator to the user.
7. IF the Backend request fails, THEN THE Frontend SHALL display a human-readable error message to the user.

### Requirement 3: Project Documentation

**User Story:** As a developer, I want a README.md at the project root, so that I can quickly understand how to run both the frontend and backend.

#### Acceptance Criteria

1. THE README.md SHALL be located at the repository root.
2. THE README.md SHALL include instructions for installing Backend dependencies using `/opt/homebrew/bin/python3` and `pip`.
3. THE README.md SHALL include instructions for installing Frontend dependencies using `pnpm install` inside the `/frontend` directory.
4. THE README.md SHALL include the command to start the Backend development server.
5. THE README.md SHALL include the command to start the Frontend Dev_Server using `pnpm dev` inside the `/frontend` directory.
6. THE README.md SHALL document the URLs at which the Backend API and Frontend Dev_Server are accessible once running.
