"""
Photo upload and deletion service for Grocery Getter.

Uses Supabase Storage (free tier, 1 GB) instead of S3.

Environment variables:
    SUPABASE_URL         – your Supabase project URL
    SUPABASE_SERVICE_KEY – service_role key (full storage access)
    PHOTO_BUCKET_NAME    – storage bucket name (default: "product-photos")
"""

import logging
import os
from uuid import uuid4

from fastapi import HTTPException, UploadFile, status

logger = logging.getLogger(__name__)

ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png"}
MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB

SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY: str = os.getenv("SUPABASE_SERVICE_KEY", "")
BUCKET_NAME: str = os.getenv("PHOTO_BUCKET_NAME", "product-photos")


def _extension_for_content_type(content_type: str) -> str:
    return ".jpg" if content_type == "image/jpeg" else ".png"


def _get_client():
    """Return a Supabase client. Raises 502 if credentials are missing."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Photo storage is not configured.",
        )
    from supabase import create_client
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


async def upload_photo(file: UploadFile) -> str:
    """
    Validate and upload a product photo to Supabase Storage.

    Returns the public URL of the uploaded photo.
    Raises HTTPException(415) for wrong format, (413) for oversized files,
    (502) if the upload fails or storage is not configured.
    """
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
            detail=f"File size exceeds the 5 MB limit.",
        )

    ext = _extension_for_content_type(content_type)
    key = f"products/{uuid4()}{ext}"

    try:
        client = _get_client()
        client.storage.from_(BUCKET_NAME).upload(
            path=key,
            file=contents,
            file_options={"content-type": content_type, "upsert": "false"},
        )
        # Build the public URL
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
    if not url:
        return

    try:
        # Extract the object key from the URL
        # Format: {SUPABASE_URL}/storage/v1/object/public/{bucket}/{key}
        marker = f"/object/public/{BUCKET_NAME}/"
        idx = url.find(marker)
        if idx == -1:
            logger.warning("delete_photo: unrecognised URL format '%s', skipping.", url)
            return

        key = url[idx + len(marker):]
        client = _get_client()
        client.storage.from_(BUCKET_NAME).remove([key])
        logger.info("Deleted photo '%s' from bucket '%s'.", key, BUCKET_NAME)
    except Exception as exc:
        logger.error("Failed to delete photo at URL '%s': %s", url, exc)
