"""
Open Food Facts HTTP client.

Provides a single async function to look up a product by UPC barcode
against the Open Food Facts API (https://world.openfoodfacts.org).
"""

import logging

import httpx

logger = logging.getLogger(__name__)

_OFF_BASE_URL = "https://world.openfoodfacts.org/api/v2/product"
_USER_AGENT = "GroceryGetter/1.0 (contact@example.com)"
_TIMEOUT_SECONDS = 5.0


async def lookup_upc(upc: str) -> dict | None:
    """
    Query the Open Food Facts API for a product by UPC.

    Returns a dict with keys:
        - name  (str | None): product_name from the API response
        - brand (str | None): brands from the API response
        - quantity (str | None): quantity from the API response

    Returns None if:
    - Product not found (status: 0 in response)
    - Network error
    - Timeout (5 seconds)
    - Response cannot be parsed
    """
    url = f"{_OFF_BASE_URL}/{upc}.json"
    headers = {"User-Agent": _USER_AGENT}

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT_SECONDS) as client:
            response = await client.get(url, headers=headers)
            data = response.json()
    except httpx.TimeoutException:
        logger.error("Open Food Facts request timed out for UPC %s", upc)
        return None
    except httpx.RequestError as exc:
        logger.error("Open Food Facts network error for UPC %s: %s", upc, exc)
        return None
    except Exception as exc:
        logger.error("Failed to parse Open Food Facts response for UPC %s: %s", upc, exc)
        return None

    # status 0 means product not found (HTTP 200 is still returned by the API)
    if data.get("status") == 0:
        return None

    product = data.get("product") or {}
    return {
        "name": product.get("product_name") or None,
        "brand": product.get("brands") or None,
        "quantity": product.get("quantity") or None,
    }
