"""Settings loaded from environment variables (or a local .env file)."""

from __future__ import annotations

import os
from collections.abc import Mapping
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation

_TRUE = {"1", "true", "yes", "on"}
_FALSE = {"0", "false", "no", "off"}


class ConfigError(ValueError):
    pass


@dataclass(frozen=True)
class Config:
    discord_token: str
    owner_id: int
    guild_id: int | None
    alpaca_key: str
    alpaca_secret: str
    paper: bool
    max_order_value: Decimal
    fill_poll_seconds: int

    @classmethod
    def from_env(cls, env: Mapping[str, str] | None = None) -> Config:
        env = os.environ if env is None else env

        def required(name: str) -> str:
            value = env.get(name, "").strip()
            if not value:
                raise ConfigError(f"{name} is not set (see .env.example)")
            return value

        def integer(name: str, value: str) -> int:
            try:
                return int(value)
            except ValueError:
                raise ConfigError(f"{name} must be a whole number, got {value!r}") from None

        paper_raw = env.get("ALPACA_PAPER", "true").strip().lower()
        if paper_raw in _TRUE:
            paper = True
        elif paper_raw in _FALSE:
            paper = False
        else:
            raise ConfigError(f"ALPACA_PAPER must be true or false, got {paper_raw!r}")

        max_raw = env.get("MAX_ORDER_VALUE", "1000").strip()
        try:
            max_order_value = Decimal(max_raw)
        except InvalidOperation:
            raise ConfigError(f"MAX_ORDER_VALUE must be a number, got {max_raw!r}") from None
        if max_order_value <= 0:
            raise ConfigError("MAX_ORDER_VALUE must be greater than 0")

        guild_raw = env.get("DISCORD_GUILD_ID", "").strip()
        poll_seconds = integer("FILL_POLL_SECONDS", env.get("FILL_POLL_SECONDS", "30").strip())
        if poll_seconds < 5:
            raise ConfigError("FILL_POLL_SECONDS must be at least 5")

        return cls(
            discord_token=required("DISCORD_TOKEN"),
            owner_id=integer("DISCORD_OWNER_ID", required("DISCORD_OWNER_ID")),
            guild_id=integer("DISCORD_GUILD_ID", guild_raw) if guild_raw else None,
            alpaca_key=required("ALPACA_API_KEY"),
            alpaca_secret=required("ALPACA_SECRET_KEY"),
            paper=paper,
            max_order_value=max_order_value,
            fill_poll_seconds=poll_seconds,
        )
