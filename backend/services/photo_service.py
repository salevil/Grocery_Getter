"""
Photo upload and deletion service for Grocery Getter.

Handles uploading product photos to an S3-compatible object store
(Supabase Storage, Cloudflare R2, or AWS S3) and deleting them when
products are removed.

Environment variables:
    PHOTO_BUCKET_NAME   – bucket to store photos (default: "grocery-getter-photos")
    AWS_ACCESS_KEY_ID   – S3 access key
    AWS_SECRET_ACCESS_KEY – S3 secret key
    AWS_REGION          – AWS region (default: "us-east-1")
    PHOTO_ENDPOINT_URL  – optional custom endpoint for Supabase/R2
"""

import logging
import os
from uuid import uuid4

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import HTTPException, UploadFile, status

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png"}
MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB

BUCKET_NAME: str = os.getenv("PHOTO_BUCKET_NAME", "grocery-getter-photos")
AWS_REGION: str = os.getenv("AWS_REGION", "us-east-1")
PHOTO_ENDPOINT_URL: str | None = os.getenv("PHOTO_ENDPOINT_URL")


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _get_s3_client():
    """Create and return a boto3 S3 client using environment credentials."""
    kwargs: dict = {
        "region_name": AWS_REGION,
    }
    if PHOTO_ENDPOINT_URL:
        kwargs["endpoint_url"] = PHOTO_ENDPOINT_URL

    access_key = os.getenv("AWS_ACCESS_KEY_ID")
    secret_key = os.getenv("AWS_SECRET_ACCESS_KEY")
    if access_key and secret_key:
        kwargs["aws_access_key_id"] = access_key
        kwargs["aws_secret_access_key"] = secret_key

    return boto3.client("s3", **kwargs)


def _build_public_url(key: str) -> str:
    """
    Build the public URL for an uploaded object.

    Uses the custom endpoint format when PHOTO_ENDPOINT_URL is set
    (e.g. Supabase Storage or Cloudflare R2), otherwise falls back to
    the standard AWS S3 virtual-hosted URL.
    """
    if PHOTO_ENDPOINT_URL:
        # Strip trailing slash for clean URL construction
        base = PHOTO_ENDPOINT_URL.rstrip("/")
        return f"{base}/{BUCKET_NAME}/{key}"
    return f"https://{BUCKET_NAME}.s3.{AWS_REGION}.amazonaws.com/{key}"


def _extension_for_content_type(content_type: str) -> str:
    """Return the file extension for a supported content type."""
    return ".jpg" if content_type == "image/jpeg" else ".png"


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def upload_photo(file: UploadFile) -> str:
    """
    Validate and upload a product photo to S3-compatible storage.

    Validates:
    - Content type must be image/jpeg or image/png → HTTPException(415)
    - File size must be ≤ 5 MB → HTTPException(413)

    Uploads to the S3 bucket configured via environment variables.

    Returns:
        The public URL of the uploaded photo.

    Raises:
        HTTPException(415): File is not JPEG or PNG.
        HTTPException(413): File exceeds 5 MB.
        HTTPException(502): Upload to the Photo Store failed.
    """
    # --- Content-type validation ---
    content_type = file.content_type or ""
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=(
                f"Unsupported media type '{content_type}'. "
                "Only image/jpeg and image/png are accepted."
            ),
        )

    # --- Read file contents and size validation ---
    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=(
                f"File size {len(contents)} bytes exceeds the maximum "
                f"allowed size of {MAX_FILE_SIZE_BYTES} bytes (5 MB)."
            ),
        )

    # --- Generate unique object key ---
    ext = _extension_for_content_type(content_type)
    key = f"products/{uuid4()}{ext}"

    # --- Upload to S3-compatible storage ---
    try:
        s3 = _get_s3_client()
        s3.put_object(
            Bucket=BUCKET_NAME,
            Key=key,
            Body=contents,
            ContentType=content_type,
        )
    except (BotoCoreError, ClientError) as exc:
        logger.error("Photo upload failed for key '%s': %s", key, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to upload photo to storage. Please try again.",
        ) from exc

    return _build_public_url(key)


async def delete_photo(url: str) -> None:
    """
    Delete a photo from S3-compatible storage by its public URL.

    Extracts the object key from the URL and issues a delete request.
    Errors are logged but not raised — deletion is best-effort so that
    a storage failure does not block product deletion.

    Args:
        url: The public URL previously returned by ``upload_photo``.
    """
    if not url:
        return

    # Extract the object key from the URL.
    # Expected formats:
    #   {endpoint_url}/{bucket}/{key}   (custom endpoint)
    #   https://{bucket}.s3.{region}.amazonaws.com/{key}  (AWS)
    try:
        if PHOTO_ENDPOINT_URL:
            base_prefix = f"{PHOTO_ENDPOINT_URL.rstrip('/')}/{BUCKET_NAME}/"
            if url.startswith(base_prefix):
                key = url[len(base_prefix):]
            else:
                logger.warning(
                    "delete_photo: URL '%s' does not match expected prefix '%s'; skipping.",
                    url,
                    base_prefix,
                )
                return
        else:
            aws_prefix = f"https://{BUCKET_NAME}.s3.{AWS_REGION}.amazonaws.com/"
            if url.startswith(aws_prefix):
                key = url[len(aws_prefix):]
            else:
                logger.warning(
                    "delete_photo: URL '%s' does not match expected AWS prefix '%s'; skipping.",
                    url,
                    aws_prefix,
                )
                return

        s3 = _get_s3_client()
        s3.delete_object(Bucket=BUCKET_NAME, Key=key)
        logger.info("Deleted photo '%s' from bucket '%s'.", key, BUCKET_NAME)

    except (BotoCoreError, ClientError) as exc:
        logger.error("Failed to delete photo at URL '%s': %s", url, exc)
    except Exception as exc:  # noqa: BLE001
        logger.error("Unexpected error deleting photo at URL '%s': %s", url, exc)
