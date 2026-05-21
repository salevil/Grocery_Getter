from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from fastapi.exceptions import HTTPException

from backend.services.auth_service import decode_token
from backend.services.ws_manager import manager

router = APIRouter(tags=["websocket"])


@router.get("/ws/health")
async def ws_health() -> dict:
    """Health check for the WebSocket router."""
    return {"status": "ok", "router": "websocket"}


@router.websocket("/ws/lists/{store_id}")
async def websocket_endpoint(ws: WebSocket, store_id: int, token: str) -> None:
    """
    WebSocket endpoint for real-time shopping list updates.

    Clients connect with a JWT in the query string (?token=...).
    The endpoint validates the token, registers the connection with the
    ConnectionManager, and keeps the connection alive until the client
    disconnects.

    Mutations happen via the REST API, which calls manager.broadcast().
    This endpoint only needs to stay connected and handle disconnects cleanly.
    """
    # Validate the JWT before accepting the connection
    try:
        decode_token(token)
    except HTTPException:
        await ws.close(code=1008)
        return

    # Register the connection
    await manager.connect(store_id, ws)

    try:
        # Keep the connection alive; clients may send pings or check-off confirmations
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(store_id, ws)
