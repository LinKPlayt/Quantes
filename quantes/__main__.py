"""Start the bot: `python -m quantes`."""

import logging
import sys

from dotenv import load_dotenv

from quantes.bot import QuantesBot
from quantes.broker import AlpacaBroker
from quantes.config import Config, ConfigError


def main() -> None:
    load_dotenv()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    try:
        config = Config.from_env()
    except ConfigError as exc:
        sys.exit(f"Config error: {exc}")
    broker = AlpacaBroker(config.alpaca_key, config.alpaca_secret, paper=config.paper)
    QuantesBot(config, broker).run(config.discord_token, log_handler=None)


if __name__ == "__main__":
    main()
