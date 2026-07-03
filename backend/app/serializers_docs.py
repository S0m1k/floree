"""JSON:API serializers for the six warehouse documents + their line items.

Shapes captured from the live Posiflora API 2026-07-01. Packing invoices and
their `packing-invoice-lines` are verified exactly; write-off / inventory /
sorting headers are verified; markdown / movement have no live sample (empty on
the account) and follow the common header shape. Values map from the Phase 1
inventory models; fields we don't store yet are emitted as sensible defaults
(filled in at data migration).
"""

from app.jsonapi import resource, rel_one, rel_many
from app.serializers import _iso, _date


def _posted(status: str) -> bool:
    return status == "posted"


# ---------- packing invoices ----------

def packing_invoice_line_resource(l) -> dict:
    a = {
        "qty": float(l.quantity),
        "amount": l.amount,
        "cost": l.price,
        "prevCost": 0,
        "costPrice": l.amount,
        "idExternal": None,
    }
    rels = {
        "item": rel_one("inventory-items", l.item_id),
        "measure": rel_one("measures", None),
        "invoice": rel_one("packing-invoices", l.invoice_id),
    }
    return resource("packing-invoice-lines", l.id, a, rels)


def packing_invoice_resource(doc, lines: list | None = None) -> dict:
    line_ids = [l.id for l in (lines or [])]
    a = {
        "date": _date(doc.date),
        "docNo": doc.doc_no,
        "amount": doc.total_amount,
        "linesCount": doc.items_count,
        "createdAt": _iso(doc.created_at),
        "posted": _posted(doc.status),
        "postedAt": None,
        "calculated": True,
        "processing": False,
        "footnote": None,
        "status": doc.status,
        "wasPostedBefore": False,
        "link": None,
        "idParent": None,
        "distribution": None,
        "overturn": False,
    }
    rels = {
        "createdBy": rel_one("workers", doc.worker_id),
        "postedBy": rel_one("workers", None),
        "store": rel_one("stores", doc.store_id),
        "vendor": rel_one("vendors", doc.vendor_id),
        "lines": rel_many("packing-invoice-lines", line_ids),
        "overheads": rel_many("overheads", []),
        "bill": rel_one("bills", None),
        "inventoryAct": rel_one("inventory-acts", None),
    }
    return resource("packing-invoices", doc.id, a, rels,
                    links={"self": f"/packing-invoices/{doc.id}"})


# ---------- write-off invoices ----------

def writeoff_invoice_line_resource(l) -> dict:
    a = {
        "qty": float(l.quantity),
        "cost": l.cost_price,
        "costPrice": l.cost_price,
        "idExternal": None,
    }
    rels = {
        "item": rel_one("inventory-items", l.item_id),
        "measure": rel_one("measures", None),
        "invoice": rel_one("write-off-invoices", l.invoice_id),
    }
    return resource("write-off-invoice-lines", l.id, a, rels)


def writeoff_invoice_resource(doc, lines: list | None = None) -> dict:
    line_ids = [l.id for l in (lines or [])]
    a = {
        "date": _date(doc.date),
        "docNo": doc.doc_no,
        "amount": doc.total_amount,
        "linesCount": doc.items_count,
        "createdAt": _iso(doc.created_at),
        "posted": _posted(doc.status),
        "postedAt": None,
        "calculated": True,
        "processing": False,
        "footnote": None,
        "status": doc.status,
        "wasPostedBefore": False,
        "link": None,
        "idParent": None,
        "description": None,
    }
    rels = {
        "createdBy": rel_one("workers", doc.worker_id),
        "postedBy": rel_one("workers", None),
        "store": rel_one("stores", doc.store_id),
        "reason": rel_one("cash-reasons", None),
        "lines": rel_many("write-off-invoice-lines", line_ids),
        "images": rel_many("images", []),
        "inventoryAct": rel_one("inventory-acts", None),
    }
    return resource("write-off-invoices", doc.id, a, rels,
                    links={"self": f"/write-off-invoices/{doc.id}"})


# ---------- inventory acts ----------

def inventory_act_line_resource(l) -> dict:
    a = {
        "qty": float(l.actual_qty),
        "expectedQty": float(l.expected_qty),
        "idExternal": None,
    }
    rels = {
        "item": rel_one("inventory-items", l.item_id),
        "measure": rel_one("measures", None),
        "act": rel_one("inventory-acts", l.act_id),
    }
    return resource("inventory-act-lines", l.id, a, rels)


def inventory_act_resource(doc, lines: list | None = None) -> dict:
    line_ids = [l.id for l in (lines or [])]
    a = {
        "date": _date(doc.act_date),
        "docNo": doc.doc_no,
        "amount": doc.financial_result,
        "linesCount": doc.items_count,
        "createdAt": _iso(doc.created_at),
        "posted": _posted(doc.status),
        "postedAt": None,
        "calculated": True,
        "processing": False,
        "footnote": None,
        "status": doc.status,
        "wasPostedBefore": False,
        "link": None,
        "idParent": None,
    }
    rels = {
        "createdBy": rel_one("workers", doc.worker_id),
        "postedBy": rel_one("workers", None),
        "packingInvoice": rel_one("packing-invoices", None),
        "writeOffInvoice": rel_one("write-off-invoices", None),
        "store": rel_one("stores", doc.store_id),
        "lines": rel_many("inventory-act-lines", line_ids),
    }
    return resource("inventory-acts", doc.id, a, rels,
                    links={"self": f"/inventory-acts/{doc.id}"})


# ---------- sorting acts (reduced header set on the live API) ----------

def sorting_act_line_resource(l) -> dict:
    a = {"qty": float(l.quantity), "idExternal": None}
    rels = {
        "itemFrom": rel_one("inventory-items", l.item_from_id),
        "itemTo": rel_one("inventory-items", l.item_to_id),
        "act": rel_one("sorting-acts", l.act_id),
    }
    return resource("sorting-act-lines", l.id, a, rels)


def sorting_act_resource(doc, lines: list | None = None) -> dict:
    line_ids = [l.id for l in (lines or [])]
    a = {
        "date": _date(doc.created_date),
        "docNo": doc.doc_no,
        "createdAt": _iso(doc.created_at),
        "linesCount": doc.items_count,
        "amount": 0,
        "posted": _posted(doc.status),
        "postedAt": None,
        "calculated": True,
        "processing": False,
    }
    rels = {
        "createdBy": rel_one("workers", doc.author_id),
        "packingInvoice": rel_one("packing-invoices", None),
        "writeOffInvoice": rel_one("write-off-invoices", None),
        "postedBy": rel_one("workers", None),
        "lines": rel_many("sorting-act-lines", line_ids),
        "store": rel_one("stores", doc.store_id),
    }
    return resource("sorting-acts", doc.id, a, rels,
                    links={"self": f"/sorting-acts/{doc.id}"})


# ---------- markdown acts (no live sample — common header shape) ----------

def markdown_act_line_resource(l) -> dict:
    a = {
        "qty": float(l.quantity),
        "oldPrice": l.old_price,
        "newPrice": l.new_price,
        "idExternal": None,
    }
    rels = {
        "item": rel_one("inventory-items", l.item_id),
        "measure": rel_one("measures", None),
        "act": rel_one("markdown-acts", l.act_id),
    }
    return resource("markdown-act-lines", l.id, a, rels)


def markdown_act_resource(doc, lines: list | None = None) -> dict:
    line_ids = [l.id for l in (lines or [])]
    a = {
        "date": _date(doc.created_date),
        "docNo": doc.doc_no,
        "amount": 0,
        "linesCount": doc.items_count,
        "createdAt": _iso(doc.created_at),
        "posted": _posted(doc.status),
        "postedAt": None,
        "calculated": True,
        "processing": False,
        "status": doc.status,
    }
    rels = {
        "createdBy": rel_one("workers", doc.author_id),
        "postedBy": rel_one("workers", None),
        "store": rel_one("stores", doc.store_id),
        "lines": rel_many("markdown-act-lines", line_ids),
    }
    return resource("markdown-acts", doc.id, a, rels,
                    links={"self": f"/markdown-acts/{doc.id}"})


# ---------- movement acts (no live sample — common header shape) ----------

def movement_act_line_resource(l) -> dict:
    a = {"qty": float(l.quantity), "cost": l.cost_price, "idExternal": None}
    rels = {
        "item": rel_one("inventory-items", l.item_id),
        "measure": rel_one("measures", None),
        "act": rel_one("movement-acts", l.act_id),
    }
    return resource("movement-act-lines", l.id, a, rels)


def movement_act_resource(doc, lines: list | None = None) -> dict:
    line_ids = [l.id for l in (lines or [])]
    a = {
        "date": _date(doc.date),
        "docNo": doc.doc_no,
        "amount": doc.cost,
        "linesCount": doc.items_count,
        "createdAt": _iso(doc.created_at),
        "posted": _posted(doc.status),
        "postedAt": None,
        "calculated": True,
        "processing": False,
        "status": doc.status,
    }
    rels = {
        "createdBy": rel_one("workers", doc.worker_id),
        "postedBy": rel_one("workers", None),
        "fromStore": rel_one("stores", doc.from_store_id),
        "toStore": rel_one("stores", doc.to_store_id),
        "lines": rel_many("movement-act-lines", line_ids),
    }
    return resource("movement-acts", doc.id, a, rels,
                    links={"self": f"/movement-acts/{doc.id}"})
