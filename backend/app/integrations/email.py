"""SMTP email delivery with a safe development logging fallback."""

from __future__ import annotations

from email.message import EmailMessage

import aiosmtplib

from app.core.config import Settings
from app.core.logging import get_logger

logger = get_logger(__name__)


class EmailService:
    """Send transactional authentication email without blocking the event loop."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    async def send(self, *, recipient: str, subject: str, body: str) -> None:
        """Deliver email through SMTP or log a development-only preview."""
        if not self.settings.smtp_host:
            logger.warning(
                "email_delivery_skipped",
                recipient=recipient,
                subject=subject,
                preview=body if self.settings.app_env == "development" else None,
            )
            return
        message = EmailMessage()
        message["From"] = self.settings.smtp_from_email
        message["To"] = recipient
        message["Subject"] = subject
        message.set_content(body)
        await aiosmtplib.send(
            message,
            hostname=self.settings.smtp_host,
            port=self.settings.smtp_port,
            username=self.settings.smtp_username,
            password=(
                self.settings.smtp_password.get_secret_value()
                if self.settings.smtp_password
                else None
            ),
            start_tls=self.settings.smtp_use_tls,
        )
        logger.info("email_sent", recipient=recipient, subject=subject)
