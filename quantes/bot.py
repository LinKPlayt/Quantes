"""The Discord bot: owner-only slash commands plus fill alerts by DM."""

from __future__ import annotations

import asyncio
import logging
import re
from collections.abc import Awaitable, Callable, Iterable
from decimal import Decimal

import discord
from discord import app_commands

from quantes import formatting as fmt
from quantes.broker import AlpacaBroker, Order
from quantes.config import Config

log = logging.getLogger(__name__)

_SYMBOL = re.compile(r"^[A-Z][A-Z.]{0,9}$")
_MAX_MESSAGE = 1900  # Discord's hard limit is 2000 characters


class NotOwner(app_commands.CheckFailure):
    pass


class UserError(Exception):
    """An error whose message is safe and useful to show in Discord."""


def clean_symbol(raw: str) -> str:
    symbol = raw.strip().upper()
    if not _SYMBOL.match(symbol):
        raise UserError(f"`{raw}` doesn't look like a stock symbol.")
    return symbol


def check_order(qty: Decimal, price: Decimal, max_value: Decimal, paused: bool) -> str | None:
    """Return why an order must be refused, or None if it may go ahead."""
    if paused:
        return "Trading is paused. Use `/resume` first."
    if qty <= 0:
        return "Quantity must be greater than 0."
    value = qty * price
    if value > max_value:
        return (
            f"That's about {fmt.money(value)}, over your {fmt.money(max_value)} "
            "per-order limit (MAX_ORDER_VALUE)."
        )
    return None


class FillTracker:
    """Works out which filled orders are new since the last poll.

    The first poll only records what's already filled, so restarting the bot
    doesn't re-send old alerts.
    """

    def __init__(self) -> None:
        self._seen: set[str] | None = None

    def new_fills(self, orders: Iterable[Order]) -> list[Order]:
        filled = [o for o in orders if o.status == "filled"]
        if self._seen is None:
            self._seen = {o.id for o in filled}
            return []
        fresh = [o for o in filled if o.id not in self._seen]
        self._seen.update(o.id for o in fresh)
        return fresh


def _truncate(text: str) -> str:
    return text if len(text) <= _MAX_MESSAGE else text[: _MAX_MESSAGE - 1] + "…"


class ConfirmView(discord.ui.View):
    """Confirm / Cancel buttons; nothing is sent to the broker until Confirm is tapped."""

    def __init__(self, owner_id: int, action: Callable[[], Awaitable[str]]) -> None:
        super().__init__(timeout=60)
        self.owner_id = owner_id
        self.action = action
        self.original: discord.Interaction | None = None
        self.done = False

    async def interaction_check(self, interaction: discord.Interaction) -> bool:
        return interaction.user.id == self.owner_id

    @discord.ui.button(label="Confirm", style=discord.ButtonStyle.success)
    async def confirm(self, interaction: discord.Interaction, _: discord.ui.Button) -> None:
        if self.done:
            return
        self.done = True
        self.stop()
        await interaction.response.edit_message(content="⏳ Sending…", view=None)
        try:
            result = await self.action()
        except UserError as exc:
            result = f"❌ {exc}"
        except Exception as exc:
            log.exception("Confirmed action failed")
            result = f"❌ Broker error: {exc}"
        await interaction.edit_original_response(content=_truncate(result))

    @discord.ui.button(label="Cancel", style=discord.ButtonStyle.secondary)
    async def cancel(self, interaction: discord.Interaction, _: discord.ui.Button) -> None:
        if self.done:
            return
        self.done = True
        self.stop()
        await interaction.response.edit_message(content="Cancelled. Nothing was sent.", view=None)

    async def on_timeout(self) -> None:
        if self.done or self.original is None:
            return
        self.done = True
        try:
            await self.original.edit_original_response(content="Timed out. Nothing was sent.", view=None)
        except discord.HTTPException:
            pass


class QuantesBot(discord.Client):
    def __init__(self, config: Config, broker: AlpacaBroker) -> None:
        super().__init__(intents=discord.Intents.default())
        self.config = config
        self.broker = broker
        self.paused = False
        self.fills = FillTracker()
        self.tree = app_commands.CommandTree(self)
        self.tree.on_error = self._on_command_error
        self._register_commands()

    async def setup_hook(self) -> None:
        if self.config.guild_id:
            guild = discord.Object(id=self.config.guild_id)
            self.tree.copy_global_to(guild=guild)
            await self.tree.sync(guild=guild)
        else:
            await self.tree.sync()  # global commands can take up to an hour to appear
        asyncio.create_task(self._watch_fills())

    async def on_ready(self) -> None:
        mode = "PAPER" if self.config.paper else "LIVE"
        log.info("Logged in as %s (%s trading)", self.user, mode)

    async def call(self, func: Callable, *args):
        """Run a blocking broker call without freezing the bot."""
        return await asyncio.to_thread(func, *args)

    # ---- fill alerts -------------------------------------------------------

    async def _watch_fills(self) -> None:
        await self.wait_until_ready()
        while not self.is_closed():
            try:
                orders = await self.call(self.broker.recent_closed_orders)
                for order in reversed(self.fills.new_fills(orders)):
                    await self.notify_owner(f"✅ Filled: {fmt.order_text(order)}")
            except Exception:
                log.exception("Checking for fills failed")
            await asyncio.sleep(self.config.fill_poll_seconds)

    async def notify_owner(self, text: str) -> None:
        try:
            owner = await self.fetch_user(self.config.owner_id)
            await owner.send(_truncate(text))
        except discord.HTTPException:
            log.warning("Couldn't DM the owner; are DMs from server members allowed?")

    # ---- commands ----------------------------------------------------------

    async def _on_command_error(
        self, interaction: discord.Interaction, error: app_commands.AppCommandError
    ) -> None:
        if isinstance(error, NotOwner):
            message = "🔒 This bot only takes commands from its owner."
        elif isinstance(error, app_commands.CommandInvokeError) and isinstance(error.original, UserError):
            message = f"❌ {error.original}"
        else:
            original = getattr(error, "original", error)
            log.error("Command failed", exc_info=original)
            message = f"❌ Something went wrong: {original}"
        if interaction.response.is_done():
            await interaction.followup.send(_truncate(message), ephemeral=True)
        else:
            await interaction.response.send_message(_truncate(message), ephemeral=True)

    async def _ask_confirm(
        self, interaction: discord.Interaction, prompt: str, action: Callable[[], Awaitable[str]]
    ) -> None:
        view = ConfirmView(self.config.owner_id, action)
        view.original = interaction
        await interaction.followup.send(_truncate(prompt), view=view, ephemeral=True)

    def _register_commands(self) -> None:
        tree = self.tree
        owner_id = self.config.owner_id
        mode = "📝 PAPER" if self.config.paper else "💵 LIVE"

        def owner_only(interaction: discord.Interaction) -> bool:
            if interaction.user.id != owner_id:
                raise NotOwner()
            return True

        def command(name: str, description: str):
            def wrap(func):
                return tree.command(name=name, description=description)(
                    app_commands.check(owner_only)(func)
                )

            return wrap

        @command("status", "Account value, today's P&L and whether the market is open")
        async def status(interaction: discord.Interaction) -> None:
            await interaction.response.defer(ephemeral=True)
            account, clock = await asyncio.gather(
                self.call(self.broker.account), self.call(self.broker.clock)
            )
            text = fmt.status_text(account, clock, self.config.paper, self.paused)
            await interaction.followup.send(text, ephemeral=True)

        @command("positions", "Your open positions and their profit/loss")
        async def positions(interaction: discord.Interaction) -> None:
            await interaction.response.defer(ephemeral=True)
            text = fmt.positions_text(await self.call(self.broker.positions))
            await interaction.followup.send(_truncate(text), ephemeral=True)

        @command("orders", "Orders that haven't filled yet")
        async def orders(interaction: discord.Interaction) -> None:
            await interaction.response.defer(ephemeral=True)
            text = fmt.orders_text(await self.call(self.broker.open_orders))
            await interaction.followup.send(_truncate(text), ephemeral=True)

        @command("price", "Latest trade price for a stock")
        @app_commands.describe(symbol="Ticker, e.g. AAPL")
        async def price(interaction: discord.Interaction, symbol: str) -> None:
            symbol = clean_symbol(symbol)
            await interaction.response.defer(ephemeral=True)
            last = await self.call(self.broker.latest_price, symbol)
            await interaction.followup.send(f"**{symbol}** {fmt.money(last)}", ephemeral=True)

        async def place(interaction: discord.Interaction, side: str, symbol: str, shares: float) -> None:
            symbol = clean_symbol(symbol)
            size = Decimal(str(shares))
            await interaction.response.defer(ephemeral=True)
            last = await self.call(self.broker.latest_price, symbol)
            problem = check_order(size, last, self.config.max_order_value, self.paused)
            if problem:
                raise UserError(problem)

            async def submit() -> str:
                if self.paused:  # paused while the confirm buttons were showing
                    raise UserError("Trading was paused. Nothing was sent.")
                order = await self.call(self.broker.market_order, symbol, size, side)
                return f"📨 Order sent: {fmt.order_text(order)}\nYou'll get a DM when it fills."

            await self._ask_confirm(
                interaction,
                f"{mode} · **{side.upper()} {fmt.qty(size)} {symbol}** at market\n"
                f"Last price {fmt.money(last)} · about {fmt.money(size * last)}",
                submit,
            )

        @command("buy", "Buy shares at market price (asks you to confirm)")
        @app_commands.describe(symbol="Ticker, e.g. AAPL", shares="Number of shares (fractions allowed)")
        async def buy(interaction: discord.Interaction, symbol: str, shares: float) -> None:
            await place(interaction, "buy", symbol, shares)

        @command("sell", "Sell shares at market price (asks you to confirm)")
        @app_commands.describe(symbol="Ticker, e.g. AAPL", shares="Number of shares (fractions allowed)")
        async def sell(interaction: discord.Interaction, symbol: str, shares: float) -> None:
            await place(interaction, "sell", symbol, shares)

        @command("close", "Sell your whole position in one stock (asks you to confirm)")
        @app_commands.describe(symbol="Ticker of the position to close")
        async def close(interaction: discord.Interaction, symbol: str) -> None:
            symbol = clean_symbol(symbol)
            await interaction.response.defer(ephemeral=True)

            async def submit() -> str:
                order = await self.call(self.broker.close_position, symbol)
                return f"📨 Closing order sent: {fmt.order_text(order)}"

            await self._ask_confirm(interaction, f"{mode} · Close your entire **{symbol}** position?", submit)

        @command("cancelall", "Cancel every open order (asks you to confirm)")
        async def cancelall(interaction: discord.Interaction) -> None:
            await interaction.response.defer(ephemeral=True)

            async def submit() -> str:
                count = await self.call(self.broker.cancel_all_orders)
                return f"🧹 Cancelled {count} open order(s)."

            await self._ask_confirm(interaction, f"{mode} · Cancel **all** open orders?", submit)

        @command("panic", "Pause trading, cancel all orders and sell everything (asks you to confirm)")
        async def panic(interaction: discord.Interaction) -> None:
            await interaction.response.defer(ephemeral=True)

            async def submit() -> str:
                self.paused = True
                count = await self.call(self.broker.close_all_positions)
                return f"🛑 Trading paused, orders cancelled, closing {count} position(s)."

            await self._ask_confirm(
                interaction,
                f"{mode} · 🛑 **Sell every position and cancel every order?**\nTrading will also be paused.",
                submit,
            )

        @command("pause", "Block new buy/sell orders until you /resume")
        async def pause(interaction: discord.Interaction) -> None:
            self.paused = True
            await interaction.response.send_message("⏸️ Trading paused.", ephemeral=True)

        @command("resume", "Allow buy/sell orders again")
        async def resume(interaction: discord.Interaction) -> None:
            self.paused = False
            await interaction.response.send_message("▶️ Trading resumed.", ephemeral=True)
