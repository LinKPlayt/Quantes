from decimal import Decimal
from types import SimpleNamespace
from uuid import UUID

from alpaca.trading.enums import AccountStatus, OrderSide, OrderStatus

from quantes.broker import to_account, to_order, to_position


def test_to_account_parses_string_numbers():
    raw = SimpleNamespace(
        equity="10500.25", last_equity="10000", cash="2500", buying_power="5000",
        status=AccountStatus.ACTIVE,
    )
    account = to_account(raw)
    assert account.equity == Decimal("10500.25")
    assert account.day_change == Decimal("500.25")
    assert account.status == "ACTIVE"


def test_to_order_handles_unfilled_and_enum_fields():
    raw = SimpleNamespace(
        id=UUID(int=1), symbol="AAPL", side=OrderSide.BUY, qty="2",
        filled_qty="0", filled_avg_price=None, status=OrderStatus.NEW,
    )
    order = to_order(raw)
    assert order.id == str(UUID(int=1))
    assert order.side == "buy"
    assert order.status == "new"
    assert order.qty == Decimal("2")
    assert order.filled_avg_price is None


def test_to_position():
    raw = SimpleNamespace(
        symbol="MSFT", qty="1.5", avg_entry_price="400", current_price="410",
        unrealized_pl="15", unrealized_plpc="0.025",
    )
    position = to_position(raw)
    assert position.qty == Decimal("1.5")
    assert position.unrealized_plpc == Decimal("0.025")
