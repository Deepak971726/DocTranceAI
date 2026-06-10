"""Standalone PostgreSQL-polling document worker."""

from __future__ import annotations

import asyncio
import signal

from app.core.config import get_settings
from app.core.logging import configure_logging, get_logger
from app.core.runtime_status import log_runtime_status
from app.dependencies.services import get_document_processor, get_vector_store

logger = get_logger(__name__)


async def run() -> None:
    """Continuously claim document jobs without Redis or a message queue."""
    settings = get_settings()
    configure_logging(settings.log_level, settings.log_json)
    processor = get_document_processor()
    await log_runtime_status(settings=settings, process_name="worker")
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for signal_name in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(signal_name, stop.set)
        except NotImplementedError:
            pass
    logger.info("document_worker_started")
    while not stop.is_set():
        processed = await processor.process_one()
        if not processed:
            try:
                await asyncio.wait_for(stop.wait(), timeout=settings.worker_poll_seconds)
            except TimeoutError:
                pass
    await get_vector_store().close()
    logger.info("document_worker_stopped")


if __name__ == "__main__":
    asyncio.run(run())
