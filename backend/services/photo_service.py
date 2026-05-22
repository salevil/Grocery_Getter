"""
Photo upload and deletion service for Grocery Getter.

Uses Supabase Storage REST API directly via httpx.

Environment variables:
    SUPABASE_URL         – your Supabase project URL
    SUPABASE_SERVICE_KEY – service_role key (full storage access)
    PHOTO_BUCKET_NAME    – storage bucket name (default: "product-photos")
"""

import logging
import os
from uuid import uuid4

import httpx
from fastapi import HTTPException, UploadFile, status

logger = logging.getLogger(__name__)

ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png"}
MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB

SUPABASE_URL: str = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_KEY: str = os.getenv("SUPABASE_SERVICE_KEY", "")
BUCKET_NAME: str = os.getenv("PHOTO_BUCKET_NAME", "product-photos")


def _extension_for_content_type(content_type: str) -> str:
    return ".jpg" if content_type == "image/jpeg" else ".png"


async def upload_photo(file: UploadFile) -> str:
    """
    Validate and upload a product photo to Supabase Storage via REST API.

    Returns the public URL of the uploaded photo.
    """
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Photo storage is not configured.",
        )

    content_type = file.content_type or ""
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported media type '{content_type}'. Only JPEG and PNG are accepted.",
        )

    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File size exceeds the 5 MB limit.",
        )

    ext = _extension_for_content_type(content_type)
    key = f"products/{uuid4()}{ext}"

    upload_url = f"{SUPABASE_URL}/storage/v1/object/{BUCKET_NAME}/{key}"
    headers = {
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": content_type,
        "x-upsert": "false",
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(upload_url, content=contents, headers=headers)

        if response.status_code not in (200, 201):
            logger.error(
                "Supabase upload failed: %s %s", response.status_code, response.text
            )
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Failed to upload photo. Please try again.",
            )

        public_url = f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET_NAME}/{key}"
        return public_url

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Photo upload failed for key '%s': %s", key, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to upload photo. Please try again.",
        ) from exc


async def delete_photo(url: str) -> None:
    """
    Delete a photo from Supabase Storage by its public URL.
    Best-effort — errors are logged but not raised.
    """
    if not url or not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return

    try:
        marker = f"/object/public/{BUCKET_NAME}/"
        idx = url.find(marker)
        if idx == -1:
            logger.warning("delete_photo: unrecognised URL format '%s', skipping.", url)
            return

        key = url[idx + len(marker):]
        delete_url = f"{SUPABASE_URL}/storage/v1/object/{BUCKET_NAME}/{key}"
        headers = {"Authorization": f"Bearer {SUPABASE_SERVICE_KEY}"}

        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.delete(delete_url, headers=headers)

        logger.info("Deleted photo '%s'.", key)
    except Exception as exc:
        logger.error("Failed to delete photo at URL '%s': %s", url, exc)
