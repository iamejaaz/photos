import json

import frappe

DEFAULTS = {"memories": True, "memory_hidden_people": []}


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
    values = {"memories": bool(memories), "memory_hidden_people": [p for p in hidden or [] if p in own]}
    frappe.defaults.set_user_default("photos_preferences", json.dumps(values))
    return values
