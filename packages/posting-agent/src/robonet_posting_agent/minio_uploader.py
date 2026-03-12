"""MinIO object storage uploader.

Uploads episode thumbnails and videos to MinIO (S3-compatible storage).
"""

from __future__ import annotations

import io
import logging

logger = logging.getLogger(__name__)

try:
    from minio import Minio
except ImportError:
    Minio = None


class MinIOUploader:
    """Uploads media files to MinIO.

    Args:
        endpoint: MinIO endpoint (e.g. 'localhost:9000').
        access_key: MinIO access key.
        secret_key: MinIO secret key.
        bucket: Bucket name.
        public_url: Public URL prefix for accessing uploaded files.
        secure: Use HTTPS.
    """

    def __init__(
        self,
        endpoint: str,
        access_key: str,
        secret_key: str,
        bucket: str = "robonet-media",
        public_url: str | None = None,
        secure: bool = False,
    ) -> None:
        if Minio is None:
            raise RuntimeError(
                "minio package is not installed. "
                "Install it with: pip install minio"
            )
        self.bucket = bucket
        self.public_url = (public_url or f"http://{endpoint}/{bucket}").rstrip("/")

        self.client = Minio(
            endpoint=endpoint,
            access_key=access_key,
            secret_key=secret_key,
            secure=secure,
        )

        # Ensure bucket exists
        if not self.client.bucket_exists(bucket):
            self.client.make_bucket(bucket)
            logger.info("Created MinIO bucket: %s", bucket)
            # Set bucket policy for public read
            self._set_public_policy()

    def _set_public_policy(self) -> None:
        """Set bucket policy to allow public read access."""
        import json
        policy = {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Effect": "Allow",
                    "Principal": {"AWS": "*"},
                    "Action": ["s3:GetObject"],
                    "Resource": [f"arn:aws:s3:::{self.bucket}/*"],
                }
            ],
        }
        self.client.set_bucket_policy(self.bucket, json.dumps(policy))

    def upload_thumbnail(self, episode_id: str, gif_bytes: bytes) -> str:
        """Upload a thumbnail GIF.

        Args:
            episode_id: Episode identifier (used in object path).
            gif_bytes: GIF file content.

        Returns:
            Public URL of the uploaded thumbnail.
        """
        object_name = f"thumbnails/{episode_id}.gif"
        self.client.put_object(
            bucket_name=self.bucket,
            object_name=object_name,
            data=io.BytesIO(gif_bytes),
            length=len(gif_bytes),
            content_type="image/gif",
        )
        url = f"{self.public_url}/{object_name}"
        logger.info("Uploaded thumbnail: %s", url)
        return url

    def upload_video(self, episode_id: str, video_bytes: bytes) -> str:
        """Upload a preview video.

        Args:
            episode_id: Episode identifier (used in object path).
            video_bytes: MP4 file content.

        Returns:
            Public URL of the uploaded video.
        """
        object_name = f"videos/{episode_id}.mp4"
        self.client.put_object(
            bucket_name=self.bucket,
            object_name=object_name,
            data=io.BytesIO(video_bytes),
            length=len(video_bytes),
            content_type="video/mp4",
        )
        url = f"{self.public_url}/{object_name}"
        logger.info("Uploaded video: %s", url)
        return url
