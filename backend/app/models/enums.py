"""Persisted domain enumerations."""

from enum import Enum


class DocumentStatus(str, Enum):
    """Document ingestion lifecycle."""

    UPLOADING = "UPLOADING"
    PROCESSING = "PROCESSING"
    READY = "READY"
    FAILED = "FAILED"


class MessageRole(str, Enum):
    """Conversation message role."""

    USER = "USER"
    ASSISTANT = "ASSISTANT"
    SYSTEM = "SYSTEM"


class MessageStatus(str, Enum):
    """AI message generation state."""

    PENDING = "PENDING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class PlanName(str, Enum):
    """Supported SaaS plans."""

    FREE = "FREE"
    PRO = "PRO"
    BUSINESS = "BUSINESS"


class SubscriptionStatus(str, Enum):
    """Subscription billing state, ready for Stripe mapping."""

    ACTIVE = "ACTIVE"
    TRIALING = "TRIALING"
    PAST_DUE = "PAST_DUE"
    CANCELED = "CANCELED"
    INCOMPLETE = "INCOMPLETE"


class AuthTokenType(str, Enum):
    """Single-use or renewable authentication token purpose."""

    REFRESH = "REFRESH"
    EMAIL_VERIFICATION = "EMAIL_VERIFICATION"
    PASSWORD_RESET = "PASSWORD_RESET"
