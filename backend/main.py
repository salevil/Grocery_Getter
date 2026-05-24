import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.routers import auth, catalog, lists, websocket, pantry


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(lifespan=lifespan)

# Allow localhost for dev + any domain set via ALLOWED_ORIGINS env var for prod
# e.g. ALLOWED_ORIGINS=https://grocery-getter.vercel.app
_extra_origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()]
_allowed_origins = ["http://localhost:5173", "http://localhost:4173"] + _extra_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(auth.router)
app.include_router(catalog.router)
app.include_router(lists.router)
app.include_router(websocket.router)
app.include_router(pantry.router)
