app_name = "photos"
app_title = "Photos"
app_publisher = "Ejaaz"
app_description = "Google Photos style library for Frappe, built on Frappe Drive"
app_email = "ejaaz@frappe.io"
app_license = "agpl-3.0"

required_apps = ["suite"]

home_page = "photos"

add_to_apps_screen = [
    {
        "name": "photos",
        "logo": "/assets/photos/frontend/logo.svg",
        "title": "Photos",
        "route": "/photos",
    },
]

website_route_rules = [
    {"from_route": "/photos/<path:app_path>", "to_route": "photos"},
]

doc_events = {
    "File": {
        "after_insert": "photos.utils.metadata.enqueue_extract",
    },
    "Photo Album": {
        "on_update": "suite.drive.overrides.file.sync_content_file",
        "on_trash": "suite.drive.overrides.file.sync_content_file",
    },
    "Personal Data Deletion Request": {
        "on_change": "photos.api.account.after_account_deletion",
    },
}

before_request = [
    "photos.utils.privacy.install",
    "photos.api.native.set_cors",
    "photos.utils.permissions.block_impersonation",
    "photos.utils.privacy.guard_file_url",
]
before_job = ["photos.utils.privacy.install"]

scheduler_events = {
    "cron": {"*/10 * * * *": ["photos.api.signups.notify_failed_emails"]},
    "daily_long": ["photos.smart.faces.regroup_recent"],
}
after_install = ["photos.api.native.ensure_oauth_client", "photos.utils.managers.ensure_role"]
after_migrate = [
    "photos.api.native.ensure_oauth_client",
    "photos.smart.settings.ensure_models",
    "photos.utils.managers.ensure_role",
]

has_permission = {
    "Photo Album": "suite.drive.overrides.file.content_has_permission",
}

permission_query_conditions = {
    doctype: "photos.utils.privacy.private_rows_condition"
    for doctype in (
        "Photo Metadata",
        "Photo Person",
        "Photo Face",
        "Photo Import",
        "Photo Archive",
        "Photo Hidden",
    )
}

override_doctype_class = {"File": "photos.utils.privacy.File"}

export_python_type_annotations = True
require_type_annotated_api_methods = True
