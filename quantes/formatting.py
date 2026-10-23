"""Small helpers for turning numbers into phone-friendly text."""

from __future__ import annotations

from decimal import Decimal

from quantes.broker import AccountSummary, MarketClock, Order, Position


def money(value: Decimal) -> str:
    sign = "-" if value < 0 else ""
    return f"{sign}${abs(value):,.2f}"


def signed_money(value: Decimal) -> str:
    return money(value) if value < 0 else f"+{money(value)}"


def signed_pct(fraction: Decimal) -> str:
    return f"{fraction * 100:+.2f}%"


def qty(value: Decimal) -> str:
    return f"{value.normalize():f}"


def status_text(account: AccountSummary, clock: MarketClock, paper: bool, paused: bool) -> str:
    day_pct = account.day_change / account.last_equity if account.last_equity else Decimal(0)
    if clock.is_open:
        market = f"🟢 Market open (closes {clock.next_close:%a %H:%M} ET)"
    else:
        market = f"🔴 Market closed (opens {clock.next_open:%a %H:%M} ET)"
    return "\n".join(
        [
            f"**{'📝 PAPER' if paper else '💵 LIVE'}** account · {'⏸️ trading paused' if paused else '▶️ trading active'}",
            market,
            f"Equity: **{money(account.equity)}**",
            f"Today: {signed_money(account.day_change)} ({signed_pct(day_pct)})",
            f"Cash: {money(account.cash)} · Buying power: {money(account.buying_power)}",
        ]
    )


def positions_text(positions: list[Position]) -> str:
    if not positions:
        return "No open positions."
    lines = [
        f"**{p.symbol}** {qty(p.qty)} @ {money(p.avg_entry_price)} → {money(p.current_price)} "
        f"· {signed_money(p.unrealized_pl)} ({signed_pct(p.unrealized_plpc)})"
        for p in sorted(positions, key=lambda p: p.symbol)
    ]
    return "\n".join(lines)


def order_text(order: Order) -> str:
    size = qty(order.qty) if order.qty is not None else "?"
    text = f"{order.side.upper()} {size} **{order.symbol}** · {order.status}"
    if order.filled_avg_price is not None and order.filled_qty:
        text += f" · filled {qty(order.filled_qty)} @ {money(order.filled_avg_price)}"
    return text


def orders_text(orders: list[Order]) -> str:
    if not orders:
        return "No open orders."
    return "\n".join(order_text(o) for o in orders)
