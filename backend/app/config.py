import os
from dataclasses import dataclass


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


@dataclass(frozen=True)
class Settings:
    supabase_url: str
    supabase_key: str
    gemini_api_key: str
    gemini_model: str
    gemini_fallback_model: str
    allowed_origins: list[str]

    @property
    def uses_database(self) -> bool:
        return bool(self.supabase_url and self.supabase_key)


def load_settings() -> Settings:
    origins = _env("ALLOWED_ORIGINS", "*")
    return Settings(
        supabase_url=_env("SUPABASE_URL").rstrip("/"),
        supabase_key=_env("SUPABASE_SECRET_KEY"),
        gemini_api_key=_env("GEMINI_API_KEY"),
        gemini_model=_env("GEMINI_MODEL", "gemini-3.8-flash"),
        gemini_fallback_model=_env("GEMINI_FALLBACK_MODEL", "gemini-3.5-flash-lite"),
        allowed_origins=[o.strip().rstrip("/") for o in origins.split(",") if o.strip()],
    )
