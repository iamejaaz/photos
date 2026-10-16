import json

import frappe

DEFAULTS = {"memories": True, "memory_hidden_people": [], "memory_removed": []}
REMOVED_LIMIT = 2000


@frappe.whitelist()
def get_preferences():
    saved = frappe.defaults.get_user_default("photos_preferences")
    return DEFAULTS | (json.loads(saved) if saved else {})


@frappe.whitelist()
def save_preferences(memories: bool = True, memory_hidden_people: list[str] | str | None = None):
    hidden = (
        json.loads(memory_hidden_people) if isinstance(memory_hidden_people, str) else memory_hidden_people
    )
    own = set(frappe.get_all("Photo Person", filters={"owner": frappe.session.user}, pluck="name"))
    values = get_preferences() | {
        "memories": bool(memories),
        "memory_hidden_people": [p for p in hidden or [] if p in own],
    }
    return _save(values)


@frappe.whitelist(methods=["POST"])
def remove_from_memories(file: str):
    values = get_preferences()
    removed = [name for name in values["memory_removed"] if name != file] + [file]
    return _save(values | {"memory_removed": removed[-REMOVED_LIMIT:]})


def _save(values):
    from photos.api.photos import forget_memories

    frappe.defaults.set_user_default("photos_preferences", json.dumps(values))
    forget_memories(frappe.session.user)
    return values
