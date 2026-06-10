"""Version 1 route aggregation."""

from fastapi import APIRouter

from app.api.v1.routes import account, auth, chat, documents, health

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router, prefix="/auth", tags=["Authentication"])
api_router.include_router(documents.router, prefix="/documents", tags=["Documents"])
api_router.include_router(chat.router, tags=["Chat"])
api_router.include_router(account.router, tags=["Account"])
