"""Thin wrapper around Alpaca that returns plain dataclasses.

All methods are blocking; the bot calls them through asyncio.to_thread.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Any

from alpaca.data.enums import DataFeed
from alpaca.data.historical import StockHistoricalDataClient
from alpaca.data.requests import StockLatestTradeRequest
from alpaca.trading.client import TradingClient
from alpaca.trading.enums import OrderSide, QueryOrderStatus, TimeInForce
from alpaca.trading.requests import GetOrdersRequest, MarketOrderRequest


@dataclass(frozen=True)
class AccountSummary:
    equity: Decimal
    last_equity: Decimal
    cash: Decimal
    buying_power: Decimal
    status: str

    @property
    def day_change(self) -> Decimal:
        return self.equity - self.last_equity


@dataclass(frozen=True)
class MarketClock:
    is_open: bool
    next_open: datetime
    next_close: datetime


@dataclass(frozen=True)
class Position:
    symbol: str
    qty: Decimal
    avg_entry_price: Decimal
    current_price: Decimal
    unrealized_pl: Decimal
    unrealized_plpc: Decimal


@dataclass(frozen=True)
class Order:
    id: str
    symbol: str
    side: str
    qty: Decimal | None
    filled_qty: Decimal
    filled_avg_price: Decimal | None
    status: str


def _dec(value: Any, default: Decimal | None = Decimal(0)) -> Decimal | None:
    return default if value is None or value == "" else Decimal(str(value))


def _enum(value: Any) -> str:
    return str(getattr(value, "value", value))


def to_account(raw: Any) -> AccountSummary:
    return AccountSummary(
        equity=_dec(raw.equity),
        last_equity=_dec(raw.last_equity),
        cash=_dec(raw.cash),
        buying_power=_dec(raw.buying_power),
        status=_enum(raw.status),
    )


def to_position(raw: Any) -> Position:
    return Position(
        symbol=raw.symbol,
        qty=_dec(raw.qty),
        avg_entry_price=_dec(raw.avg_entry_price),
        current_price=_dec(raw.current_price),
        unrealized_pl=_dec(raw.unrealized_pl),
        unrealized_plpc=_dec(raw.unrealized_plpc),
    )


def to_order(raw: Any) -> Order:
    return Order(
        id=str(raw.id),
        symbol=raw.symbol,
        side=_enum(raw.side),
        qty=_dec(raw.qty, default=None),
        filled_qty=_dec(raw.filled_qty),
        filled_avg_price=_dec(raw.filled_avg_price, default=None),
        status=_enum(raw.status),
    )


class AlpacaBroker:
    def __init__(self, api_key: str, secret_key: str, paper: bool) -> None:
        self.paper = paper
        self._trading = TradingClient(api_key, secret_key, paper=paper)
        self._data = StockHistoricalDataClient(api_key, secret_key)

    def account(self) -> AccountSummary:
        return to_account(self._trading.get_account())

    def clock(self) -> MarketClock:
        raw = self._trading.get_clock()
        return MarketClock(is_open=raw.is_open, next_open=raw.next_open, next_close=raw.next_close)

    def positions(self) -> list[Position]:
        return [to_position(p) for p in self._trading.get_all_positions()]

    def open_orders(self) -> list[Order]:
        request = GetOrdersRequest(status=QueryOrderStatus.OPEN, limit=50)
        return [to_order(o) for o in self._trading.get_orders(filter=request)]

    def recent_closed_orders(self, limit: int = 50) -> list[Order]:
        request = GetOrdersRequest(status=QueryOrderStatus.CLOSED, limit=limit)
        return [to_order(o) for o in self._trading.get_orders(filter=request)]

    def latest_price(self, symbol: str) -> Decimal:
        # IEX is the feed free Alpaca accounts are allowed to query.
        request = StockLatestTradeRequest(symbol_or_symbols=symbol, feed=DataFeed.IEX)
        trades = self._data.get_stock_latest_trade(request)
        if symbol not in trades:
            raise LookupError(f"No price found for {symbol}")
        return Decimal(str(trades[symbol].price))

    def market_order(self, symbol: str, qty: Decimal, side: str) -> Order:
        request = MarketOrderRequest(
            symbol=symbol,
            qty=float(qty),
            side=OrderSide(side),
            time_in_force=TimeInForce.DAY,
        )
        return to_order(self._trading.submit_order(request))

    def close_position(self, symbol: str) -> Order:
        return to_order(self._trading.close_position(symbol))

    def cancel_all_orders(self) -> int:
        return len(self._trading.cancel_orders())

    def close_all_positions(self) -> int:
        return len(self._trading.close_all_positions(cancel_orders=True))
