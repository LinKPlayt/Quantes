from decimal import Decimal

import pytest

from quantes.config import Config, ConfigError

BASE = {
    "DISCORD_TOKEN": "token",
    "DISCORD_OWNER_ID": "1234",
    "ALPACA_API_KEY": "key",
    "ALPACA_SECRET_KEY": "secret",
}


def test_defaults_to_paper_trading():
    config = Config.from_env(BASE)
    assert config.paper is True
    assert config.owner_id == 1234
    assert config.guild_id is None
    assert config.max_order_value == Decimal("1000")
    assert config.fill_poll_seconds == 30


def test_live_trading_must_be_explicit():
    assert Config.from_env({**BASE, "ALPACA_PAPER": "false"}).paper is False
    with pytest.raises(ConfigError, match="ALPACA_PAPER"):
        Config.from_env({**BASE, "ALPACA_PAPER": "maybe"})


def test_missing_required_value_names_the_variable():
    env = {k: v for k, v in BASE.items() if k != "ALPACA_SECRET_KEY"}
    with pytest.raises(ConfigError, match="ALPACA_SECRET_KEY"):
        Config.from_env(env)


@pytest.mark.parametrize(
    "overrides, message",
    [
        ({"DISCORD_OWNER_ID": "me"}, "DISCORD_OWNER_ID"),
        ({"DISCORD_GUILD_ID": "abc"}, "DISCORD_GUILD_ID"),
        ({"MAX_ORDER_VALUE": "lots"}, "MAX_ORDER_VALUE"),
        ({"MAX_ORDER_VALUE": "0"}, "MAX_ORDER_VALUE"),
        ({"FILL_POLL_SECONDS": "1"}, "FILL_POLL_SECONDS"),
    ],
)
def test_bad_values_are_rejected(overrides, message):
    with pytest.raises(ConfigError, match=message):
        Config.from_env({**BASE, **overrides})
