from datetime import datetime
from decimal import Decimal

from quantes import formatting as fmt
from quantes.broker import AccountSummary, MarketClock, Position


def test_money_formatting():
    assert fmt.money(Decimal("1234.5")) == "$1,234.50"
    assert fmt.money(Decimal("-3")) == "-$3.00"
    assert fmt.signed_money(Decimal("3")) == "+$3.00"
    assert fmt.signed_pct(Decimal("0.0123")) == "+1.23%"
    assert fmt.qty(Decimal("2.500")) == "2.5"
    assert fmt.qty(Decimal("10")) == "10"


def test_status_text_shows_mode_and_pnl():
    account = AccountSummary(
        equity=Decimal(10100), last_equity=Decimal(10000), cash=Decimal(5000),
        buying_power=Decimal(10000), status="ACTIVE",
    )
    clock = MarketClock(is_open=False, next_open=datetime(2026, 10, 26, 9, 30), next_close=datetime(2026, 10, 26, 16))
    text = fmt.status_text(account, clock, paper=True, paused=False)
    assert "PAPER" in text
    assert "+$100.00 (+1.00%)" in text
    assert "Market closed" in text


def test_positions_text():
    assert fmt.positions_text([]) == "No open positions."
    text = fmt.positions_text([
        Position("MSFT", Decimal(1), Decimal(400), Decimal(390), Decimal(-10), Decimal("-0.025")),
    ])
    assert "-$10.00 (-2.50%)" in text
