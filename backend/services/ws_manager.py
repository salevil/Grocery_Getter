import asyncio
import logging
from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self):
        # store_id → set of active WebSocket connections
        self.active: dict[int, set[WebSocket]] = {}

    async def connect(self, store_id: int, ws: WebSocket) -> None:
        """Accept the WebSocket connection and register it."""
        await ws.accept()
        self.active.setdefault(store_id, set()).add(ws)

    def disconnect(self, store_id: int, ws: WebSocket) -> None:
        """Remove a WebSocket from the active connections."""
        if store_id in self.active:
            self.active[store_id].discard(ws)
            if not self.active[store_id]:
                del self.active[store_id]

    async def broadcast(self, store_id: int, message: dict) -> None:
        """
        Broadcast a JSON message to all connections watching store_id.
        Fire-and-forget with a 2-second per-connection timeout.
        Failed connections are removed from the active set.
        """
        if store_id not in self.active:
            return

        failed: set[WebSocket] = set()

        for ws in self.active[store_id].copy():
            try:
                await asyncio.wait_for(ws.send_json(message), timeout=2.0)
            except asyncio.TimeoutError:
                logger.error(
                    "Broadcast to store_id=%d timed out; removing connection %s",
                    store_id,
                    ws,
                )
                failed.add(ws)
            except Exception as exc:
                logger.error(
                    "Broadcast to store_id=%d failed with %r; removing connection %s",
                    store_id,
                    exc,
                    ws,
                )
                failed.add(ws)

        for ws in failed:
            self.disconnect(store_id, ws)


# Module-level singleton
manager = ConnectionManager()
