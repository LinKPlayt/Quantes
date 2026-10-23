from decimal import Decimal

import pytest

from quantes.bot import FillTracker, UserError, check_order, clean_symbol
from quantes.broker import Order


def order(id: str, status: str = "filled") -> Order:
    return Order(
        id=id, symbol="AAPL", side="buy", qty=Decimal(1), filled_qty=Decimal(1),
        filled_avg_price=Decimal(100), status=status,
    )


def test_clean_symbol():
    assert clean_symbol(" aapl ") == "AAPL"
    assert clean_symbol("brk.b") == "BRK.B"
    for bad in ["", "1ABC", "AAPL; DROP", "TOOLONGSYMBOL"]:
        with pytest.raises(UserError):
            clean_symbol(bad)


def test_check_order_limits():
    limit = Decimal(1000)
    assert check_order(Decimal(5), Decimal(100), limit, paused=False) is None
    assert "paused" in check_order(Decimal(1), Decimal(1), limit, paused=True)
    assert "greater than 0" in check_order(Decimal(0), Decimal(100), limit, paused=False)
    assert "limit" in check_order(Decimal(11), Decimal(100), limit, paused=False)


def test_fill_tracker_skips_existing_fills_then_reports_new_ones():
    tracker = FillTracker()
    assert tracker.new_fills([order("a"), order("b", status="canceled")]) == []
    fresh = tracker.new_fills([order("c"), order("a"), order("b", status="canceled")])
    assert [o.id for o in fresh] == ["c"]
    assert tracker.new_fills([order("c"), order("a")]) == []
