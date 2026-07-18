"""Unit tests for app/etl/transforms.py — pure, no network/DB.

Covers the mapping fixes made against a live Posiflora account (2026-07-18):
order status vocabulary, the order/worker field mapping that was previously
dropped on the floor (customer, author, real timestamps), and the docNo ->
order_number best-effort extraction.
"""

from decimal import Decimal

import pytest

from app.etl import transforms as T


# ---------- order status mapping ----------

@pytest.mark.parametrize(
    "raw_status,expected",
    [
        ("new", "new"),
        ("assembled", "assembled"),
        ("done", "completed"),
        ("canceled", "cancelled"),
        ("returned", "return"),
    ],
)
def test_map_order_status_known_values(raw_status, expected):
    assert T.map_order_status(raw_status) == expected


def test_map_order_status_unknown_falls_back_to_new():
    assert T.map_order_status("some-new-posiflora-status") == "new"


def test_map_order_status_none_falls_back_to_new():
    assert T.map_order_status(None) == "new"


# ---------- docNo -> order_number ----------

@pytest.mark.parametrize(
    "doc_no,expected",
    [
        ("25aaaa000164", 164),
        ("aaab25001495", 25001495),
        (None, None),
        ("", None),
        ("no-digits-here", None),
    ],
)
def test_order_number_from_doc_no(doc_no, expected):
    assert T._order_number_from_doc_no(doc_no) == expected


# ---------- map_order ----------

def _order_resource(**attr_overrides) -> dict:
    """A JSON:API order resource shaped like the live Posiflora response
    (floreii.posiflora.com/api /v1/orders), with sane defaults."""
    attrs = {
        "status": "done",
        "date": "2026-05-27",
        "docNo": "25aaaa000164",
        "description": "Нежнятина",
        "budget": 5000,
        "dueTime": "2026-05-31T10:30:00+00:00",
        "deliveryTimeFrom": "2026-05-31T10:30:00+00:00",
        "deliveryTimeTo": "2026-05-31T11:00:00+00:00",
        "deliveryContact": "",
        "deliveryPhoneNumber": "",
        "deliveryPhoneCode": "",
        "deliveryCity": "",
        "deliveryStreet": "",
        "deliveryHouse": "",
        "deliveryApartment": "",
        "deliveryBuilding": "",
        "deliveryComments": "",
        "createdAt": "2026-05-27T15:37:13+00:00",
        "updatedAt": "2026-05-31T11:46:32+00:00",
        "postedAt": "2026-05-31T11:46:05+00:00",
        "totalAmount": 5142.5,
        "paymentsAmount": 5142.5,
    }
    attrs.update(attr_overrides)
    return {
        "type": "orders",
        "id": "00200458-9129-4de9-937c-3a063b335362",
        "attributes": attrs,
        "relationships": {
            "source": {"data": {"type": "order-sources", "id": "src-1"}},
            "store": {"data": {"type": "stores", "id": "store-1"}},
            "customer": {"data": {"type": "customers", "id": "cust-1"}},
            "postedBy": {"data": {"type": "workers", "id": "worker-posted"}},
            "createdBy": {"data": {"type": "workers", "id": "worker-created"}},
        },
    }


def test_map_order_full_mapping():
    row = T.map_order(_order_resource())

    assert row["id"] == "00200458-9129-4de9-937c-3a063b335362"
    assert row["posiflora_doc_no"] == "25aaaa000164"
    assert row["order_number"] == 164
    assert row["status"] == "completed"  # done -> completed
    assert row["store_id"] == "store-1"
    assert row["source_id"] == "src-1"
    assert row["customer_id"] == "cust-1"
    assert row["created_by_id"] == "worker-created"
    assert row["closed_by_id"] == "worker-posted"
    assert row["comment"] == "Нежнятина"
    assert row["due_time"] == "2026-05-31T10:30:00+00:00"
    assert row["due_date"] == "2026-05-31"  # date-part of dueTime, not `date`
    # totalAmount (the order's own sum), never paymentsAmount.
    assert float(row["total_amount"]) == pytest.approx(5142.5)
    assert row["created_at"].isoformat().startswith("2026-05-27T15:37:13")
    assert row["updated_at"].isoformat().startswith("2026-05-31T11:46:32")
    assert row["closed_at"].isoformat().startswith("2026-05-31T11:46:05")


def test_map_order_customer_name_phone_fallback_to_customer():
    """Live data: deliveryContact/deliveryPhoneNumber are empty on ~98% of
    orders — customer_name/phone must fall back to the linked customer."""
    row = T.map_order(
        _order_resource(deliveryContact="", deliveryPhoneNumber="", deliveryPhoneCode=""),
        customer_lookup={"cust-1": {"name": "Алла Чумичева", "phone": "89135316951"}},
    )
    assert row["customer_name"] == "Алла Чумичева"
    assert row["phone"] == "89135316951"


def test_map_order_customer_name_phone_prefers_explicit_delivery_contact():
    """When Posiflora *does* fill deliveryContact (a different recipient),
    that takes priority over the account holder's own name/phone."""
    row = T.map_order(
        _order_resource(
            deliveryContact="Иван Получатель",
            deliveryPhoneCode="+7",
            deliveryPhoneNumber="9001234567",
        ),
        customer_lookup={"cust-1": {"name": "Алла Чумичева", "phone": "89135316951"}},
    )
    assert row["customer_name"] == "Иван Получатель"
    assert row["phone"] == "+79001234567"


def test_map_order_missing_customer_lookup_entry_is_blank_not_crash():
    row = T.map_order(_order_resource(deliveryContact="", deliveryPhoneNumber=""), customer_lookup={})
    assert row["customer_name"] == ""
    assert row["phone"] == ""


def test_map_order_no_customer_relationship():
    resource = _order_resource()
    del resource["relationships"]["customer"]
    row = T.map_order(resource, customer_lookup={"cust-1": {"name": "X", "phone": "Y"}})
    assert row["customer_id"] is None
    assert row["customer_name"] == ""


def test_map_order_delivery_fields():
    row = T.map_order(_order_resource(
        deliveryCity="Москва", deliveryStreet="Тверская", deliveryHouse="1",
        deliveryApartment="5", deliveryBuilding="к2", deliveryComments="Домофон 123",
    ))
    assert row["delivery_city"] == "Москва"
    assert row["delivery_street"] == "Тверская"
    assert row["delivery_house"] == "1"
    assert row["delivery_apartment"] == "5"
    assert row["delivery_building"] == "к2"
    assert row["delivery_comment"] == "Домофон 123"
    assert row["address"] == "Москва, Тверская, 1, кв. 5"


def test_map_order_budget_and_missing_budget():
    assert T.map_order(_order_resource(budget=3000))["budget"] == 3000
    assert T.map_order(_order_resource(budget=None))["budget"] is None


# ---------- map_worker ----------

def _worker_resource(**attr_overrides) -> dict:
    attrs = {
        "firstName": "Диана",
        "lastName": "Кирпач",
        "middleName": None,
        "countryCode": 7,
        "phone": "9500491123",
        "email": None,
    }
    attrs.update(attr_overrides)
    return {
        "type": "workers",
        "id": "worker-1",
        "attributes": attrs,
        "relationships": {
            "user": {"data": {"type": "users", "id": "user-1"}},
            "position": {"data": None},
            "stores": {"data": [{"type": "stores", "id": "store-1"}]},
        },
    }


def test_map_worker_basic():
    users_by_id = {"user-1": {"login": "diana", "status": "on"}}
    row = T.map_worker(_worker_resource(), users_by_id)

    assert row["id"] == "worker-1"
    assert row["name"] == "Диана Кирпач"
    assert row["surname"] == "Кирпач"
    assert row["login"] == "diana"
    assert row["status"] == "active"
    assert row["store_id"] == "store-1"
    assert row["store_ids"] == '["store-1"]'
    # never touches auth secrets
    assert "password_hash" not in row
    assert "pin_hash" not in row


def test_map_worker_status_off_maps_to_inactive():
    users_by_id = {"user-1": {"login": None, "status": "off"}}
    row = T.map_worker(_worker_resource(), users_by_id)
    assert row["status"] == "inactive"


def test_map_worker_no_user_relationship_defaults_active_no_login():
    row = T.map_worker(_worker_resource(), users_by_id={})
    assert row["login"] is None
    assert row["status"] == "active"


def test_map_worker_no_stores():
    resource = _worker_resource()
    resource["relationships"]["stores"] = {"data": []}
    row = T.map_worker(resource, {})
    assert row["store_id"] is None
    assert row["store_ids"] is None


def test_index_included_users():
    included = [
        {"type": "users", "id": "u1", "attributes": {"login": "a", "status": "on"}},
        {"type": "positions", "id": "p1", "attributes": {"title": "Директор"}},
        {"type": "users", "id": "u2", "attributes": {"login": None, "status": "off"}},
    ]
    result = T.index_included_users(included)
    assert result == {
        "u1": {"login": "a", "status": "on"},
        "u2": {"login": None, "status": "off"},
    }


# ---------- build_order_item_rows (order composition) ----------
# Fixtures shaped like live GET /v1/orders/{id}?include=lines `order-lines`
# resources (floreii.posiflora.com/api, store 04797ede-f160-408a-b54e-96b4cd7282c3).

def _order_line(
    line_id: str,
    qty=1,
    price=100,
    amount=None,
    total_amount=None,
    item_id="item-1",
    bouquet_id=None,
    measure_id="measure-1",
) -> dict:
    amount = amount if amount is not None else qty * price
    total_amount = total_amount if total_amount is not None else amount
    rels = {
        "item": {"data": {"type": "inventory-items", "id": item_id} if item_id else None},
        "bouquet": {"data": {"type": "bouquets", "id": bouquet_id} if bouquet_id else None},
        "measure": {"data": {"type": "measures", "id": measure_id} if measure_id else None},
    }
    return {
        "type": "order-lines",
        "id": line_id,
        "attributes": {
            "qty": qty,
            "price": price,
            "amount": amount,
            "totalAmount": total_amount,
            "totalAmountWithDiscount": amount,  # deliberately unreliable/unused
            "manualSetting": False,
        },
        "relationships": rels,
    }


ITEM_TITLES = {"item-1": "Роза 60см", "item-2": "Лента упаковочная"}
BOUQUET_TITLES = {"bq-1": "Нежность"}
MEASURE_TITLES = {"measure-1": "Штука"}


def test_flat_item_line_no_bouquet_relationship():
    lines = [_order_line("line-1", qty=3, price=200, item_id="item-1")]
    rows = T.build_order_item_rows("order-1", lines, ITEM_TITLES, BOUQUET_TITLES, MEASURE_TITLES)

    assert len(rows) == 1
    row = rows[0]
    assert row["id"] == "line-1"
    assert row["order_id"] == "order-1"
    assert row["parent_id"] is None
    assert row["kind"] == "item"
    assert row["bouquet_id"] is None
    assert row["inventory_item_id"] == "item-1"
    assert row["title"] == "Роза 60см"
    assert row["unit_price"] == Decimal("200")
    assert row["quantity"] == Decimal("3")
    assert row["measure"] == "Штука"
    assert row["discount"] == Decimal("0")


def test_line_discount_is_amount_minus_total_amount():
    # amount=3600 (qty*price), totalAmount=3060 after a 15% order discount.
    lines = [_order_line("line-1", qty=2, price=1800, amount=3600, total_amount=3060)]
    rows = T.build_order_item_rows("order-1", lines, ITEM_TITLES, {}, MEASURE_TITLES)

    assert rows[0]["unit_price"] == Decimal("1800")
    assert rows[0]["discount"] == Decimal("540")  # 3600 - 3060


def test_line_markup_when_total_amount_exceeds_amount():
    """Live case: a `manualSetting: true` line where the cashier keyed a total
    above price*qty (price=330, qty=1, amount=330, totalAmount=1600) — must
    surface as a markup, not silently vanish as a clamped-to-zero discount
    (which previously under-counted the order by the full 1270 difference)."""
    lines = [_order_line("line-1", qty=1, price=330, amount=330, total_amount=1600)]
    rows = T.build_order_item_rows("order-1", lines, ITEM_TITLES, {}, MEASURE_TITLES)
    assert rows[0]["discount"] == Decimal("0")
    assert rows[0]["markup"] == Decimal("1270")
    assert rows[0]["unit_price"] * rows[0]["quantity"] - rows[0]["discount"] + rows[0]["markup"] == Decimal("1600")


def test_line_discount_and_markup_never_both_nonzero():
    # A one-cent rounding wobble the other direction — still just one field.
    lines = [_order_line("line-1", qty=1, price=100, amount=100, total_amount=100.5)]
    rows = T.build_order_item_rows("order-1", lines, ITEM_TITLES, {}, MEASURE_TITLES)
    assert rows[0]["discount"] == Decimal("0")
    assert rows[0]["markup"] == Decimal("0.5")


def test_unknown_item_id_falls_back_to_generic_title():
    lines = [_order_line("line-1", item_id="item-unknown")]
    rows = T.build_order_item_rows("order-1", lines, ITEM_TITLES, {}, MEASURE_TITLES)
    assert rows[0]["title"] == "Товар"
    # inventory_item_id is still the raw Posiflora id — FK safety (dropping
    # ids unknown to our own catalog) is the ETL importer's job, not the
    # pure transform's.
    assert rows[0]["inventory_item_id"] == "item-unknown"


def test_unknown_measure_falls_back_to_default_measure():
    lines = [_order_line("line-1", measure_id="measure-unknown")]
    rows = T.build_order_item_rows("order-1", lines, ITEM_TITLES, {}, {})
    assert rows[0]["measure"] == "Штука"


def test_bouquet_lines_grouped_under_one_synthetic_parent_row():
    """Several lines sharing a `bouquet` relationship are the flower/material
    breakdown of one physical bouquet (live-verified — see
    transforms.build_order_item_rows docstring): they become nested `item`
    component rows under one synthetic top-level `bouquet` row, not five
    separate top-level rows."""
    lines = [
        _order_line("line-1", qty=4, price=370, amount=1480, total_amount=1329.69,
                    item_id="item-1", bouquet_id="bq-1"),
        _order_line("line-2", qty=1, price=850, amount=850, total_amount=763.67,
                    item_id="item-2", bouquet_id="bq-1"),
    ]
    rows = T.build_order_item_rows("order-1", lines, ITEM_TITLES, BOUQUET_TITLES, MEASURE_TITLES)

    by_kind = {"bouquet": [], "item": []}
    for r in rows:
        by_kind[r["kind"]].append(r)

    assert len(by_kind["bouquet"]) == 1
    parent = by_kind["bouquet"][0]
    assert parent["id"] == "bq-1"  # the Posiflora bouquet's own id — stable across re-imports
    assert parent["order_id"] == "order-1"
    assert parent["parent_id"] is None
    assert parent["bouquet_id"] == "bq-1"
    assert parent["title"] == "Букет - Нежность"
    assert parent["quantity"] == Decimal("1")
    # unit_price is the sum of the components' pre-discount amount (qty*price)...
    assert parent["unit_price"] == Decimal("4") * Decimal("370") + Decimal("1") * Decimal("850")
    # ...and discount is the sum of their (amount - totalAmount), so the parent
    # row alone contributes the bouquet's true post-discount total once.
    expected_discount = (Decimal("1480") - Decimal("1329.69")) + (Decimal("850") - Decimal("763.67"))
    assert parent["discount"] == expected_discount

    assert len(by_kind["item"]) == 2
    for comp in by_kind["item"]:
        assert comp["parent_id"] == "bq-1"
        assert comp["bouquet_id"] is None
        # Components are informational only — their own discount/markup are 0
        # so _compute_totals doesn't double-count what the parent row carries.
        assert comp["discount"] == Decimal("0")
        assert comp["markup"] == Decimal("0")
    comp_by_id = {c["id"]: c for c in by_kind["item"]}
    assert comp_by_id["line-1"]["inventory_item_id"] == "item-1"
    assert comp_by_id["line-1"]["unit_price"] == Decimal("370")
    assert comp_by_id["line-1"]["quantity"] == Decimal("4")
    assert comp_by_id["line-2"]["inventory_item_id"] == "item-2"


def test_bouquet_parent_row_precedes_its_components_in_return_order():
    """Callers insert in list order and rely on the parent existing before its
    children's parent_id FK is written (see import_order_lines)."""
    lines = [_order_line("line-1", bouquet_id="bq-1")]
    rows = T.build_order_item_rows("order-1", lines, ITEM_TITLES, BOUQUET_TITLES, MEASURE_TITLES)
    assert rows[0]["kind"] == "bouquet"
    assert rows[1]["kind"] == "item"
    assert rows[1]["parent_id"] == rows[0]["id"]


def test_unknown_bouquet_id_falls_back_to_generic_title():
    lines = [_order_line("line-1", bouquet_id="bq-unknown")]
    rows = T.build_order_item_rows("order-1", lines, ITEM_TITLES, {}, MEASURE_TITLES)
    parent = next(r for r in rows if r["kind"] == "bouquet")
    assert parent["title"] == "Букет"


def test_mixed_order_flat_items_and_a_bouquet():
    """An order can contain both standalone goods and a bouquet — flat rows
    and the bouquet group coexist without cross-contamination."""
    lines = [
        _order_line("line-flat", qty=1, price=150, item_id="item-2"),
        _order_line("line-bq-1", qty=2, price=300, item_id="item-1", bouquet_id="bq-1"),
    ]
    rows = T.build_order_item_rows("order-1", lines, ITEM_TITLES, BOUQUET_TITLES, MEASURE_TITLES)
    kinds = sorted((r["kind"], r["parent_id"] or "") for r in rows)
    assert kinds == [("bouquet", ""), ("item", ""), ("item", "bq-1")]
