"""Unit tests for app/etl/transforms.py — pure, no network/DB.

Covers the mapping fixes made against a live Posiflora account (2026-07-18):
order status vocabulary, the order/worker field mapping that was previously
dropped on the floor (customer, author, real timestamps), and the docNo ->
order_number best-effort extraction.
"""

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
