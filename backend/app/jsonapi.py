"""Minimal JSON:API document builder.

The clone must emit the same JSON:API shapes Posiflora does so the existing
frontend keeps working unchanged. These primitives build resource objects,
relationship linkages and the top-level document with a de-duplicated
`included` section.
"""

from typing import Any, Iterable


def resource(
    type_: str,
    id_: Any,
    attributes: dict,
    relationships: dict | None = None,
    links: dict | None = None,
) -> dict:
    obj: dict = {"type": type_, "id": str(id_), "attributes": attributes}
    if relationships is not None:
        obj["relationships"] = relationships
    if links is not None:
        obj["links"] = links
    return obj


def rel_one(type_: str, id_: Any) -> dict:
    """To-one relationship; `data` is null when id_ is None."""
    return {"data": ({"type": type_, "id": str(id_)} if id_ is not None else None)}


def rel_many(type_: str, ids: Iterable[Any]) -> dict:
    return {"data": [{"type": type_, "id": str(i)} for i in ids]}


class Included:
    """Collects included resources, keyed by (type, id) so each appears once."""

    def __init__(self) -> None:
        self._by: dict[tuple[str, str], dict] = {}

    def add(self, res: dict | None) -> None:
        if res is None:
            return
        self._by[(res["type"], res["id"])] = res

    def extend(self, items: Iterable[dict | None]) -> None:
        for it in items:
            self.add(it)

    def as_list(self) -> list[dict]:
        return list(self._by.values())


def document(
    data: Any,
    included: list[dict] | None = None,
    meta: dict | None = None,
) -> dict:
    doc: dict = {"data": data}
    if included is not None:
        doc["included"] = included
    if meta is not None:
        doc["meta"] = meta
    return doc
