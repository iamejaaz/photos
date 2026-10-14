app_name = "photos"
app_title = "Photos"
app_publisher = "Ejaaz"
app_description = "Google Photos style library for Frappe, built on Frappe Drive"
app_email = "ejaaz@frappe.io"
app_license = "agpl-3.0"

required_apps = ["suite"]

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
        "after_insert": "photos.metadata.enqueue_extract",
    },
    "Photo Album": {
        "on_update": "suite.drive.overrides.file.sync_content_file",
        "on_trash": "suite.drive.overrides.file.sync_content_file",
    },
}

has_permission = {
    "Photo Album": "suite.drive.overrides.file.content_has_permission",
}

# Send non-GET requests for this app's endpoints as native `application/json`
# bodies instead of form-encoded, per-key JSON-stringified values.

# Apps
# ------------------

# required_apps = []

# Each item in the list will be shown as an app in the apps page
# add_to_apps_screen = [
# 	{
# 		"name": "photos",
# 		"logo": "/assets/photos/logo.png",
# 		"title": "Photos",
# 		"route": "/photos",
# 		"has_permission": "photos.api.permission.has_app_permission",
# 	}
# ]

# The dock, the rail down the left of the desk, is a document rather than a hook. Author it in
# Manage Dock on a developer-mode site and press Export to App, and it is written to
# `photos/dock/photos/photos.json` for git to carry. An app that ships none has no
# rail: its sidebar gets a switcher in the header instead.
#
# A companion app, one that extends a host app rather than standing on its own, says so with
# `mount_on` on that same record, and its entries are appended to the host's rail. Mounting keeps
# the companion off the apps screen, so it takes precedence over any add_to_apps_screen above.

# Includes in <head>
# ------------------

# include js, css files in header of desk.html
# app_include_css = "/assets/photos/css/photos.css"
# app_include_js = "/assets/photos/js/photos.js"

# include js, css files in header of web template
# web_include_css = "/assets/photos/css/photos.css"
# web_include_js = "/assets/photos/js/photos.js"

# include custom scss in every website theme (without file extension ".scss")
# website_theme_scss = "photos/public/scss/website"

# include js, css files in header of web form
# webform_include_js = {"doctype": "public/js/doctype.js"}
# webform_include_css = {"doctype": "public/css/doctype.css"}

# include js in page
# page_js = {"page" : "public/js/file.js"}

# include js in doctype views
# doctype_js = {"doctype" : "public/js/doctype.js"}
# doctype_list_js = {"doctype" : "public/js/doctype_list.js"}
# doctype_kanban_js = {"doctype" : "public/js/doctype_kanban.js"}
# doctype_tree_js = {"doctype" : "public/js/doctype_tree.js"}
# doctype_calendar_js = {"doctype" : "public/js/doctype_calendar.js"}

# Svg Icons
# ------------------
# include app icons in desk
# app_include_icons = "photos/public/icons.svg"

# Home Pages
# ----------

# application home page (will override Website Settings)
# home_page = "login"

# website user home page (by Role)
# role_home_page = {
# 	"Role": "home_page"
# }

# Setup Wizard
# ------------

# open a fresh site's setup in this app's own UI instead of the desk wizard.
# must be a non-desk route (not under /desk or /app); to customize setup within
# desk, use setup_wizard_stages / setup_wizard_complete instead.
# setup_wizard_url = "/photos/setup"

# Generators
# ----------

# automatically create page for each record of this doctype
# website_generators = ["Web Page"]

# automatically load and sync documents of this doctype from downstream apps
# importable_doctypes = [doctype_1]

# Jinja
# ----------

# add methods and filters to jinja environment
# jinja = {
# 	"methods": "photos.utils.jinja_methods",
# 	"filters": "photos.utils.jinja_filters"
# }

# Installation
# ------------

# before_install = "photos.install.before_install"
# after_install = "photos.install.after_install"

# Uninstallation
# ------------

# before_uninstall = "photos.uninstall.before_uninstall"
# after_uninstall = "photos.uninstall.after_uninstall"

# Disable / Enable
# ----------------
# Called when this app is logically disabled or re-enabled on a site,
# without uninstalling it. Use this to hide/restore fields this app adds
# to other apps' doctypes.

# before_disable = "photos.uninstall.before_disable"
# after_disable = "photos.uninstall.after_disable"
# before_enable = "photos.install.before_enable"
# after_enable = "photos.install.after_enable"

# Integration Setup
# ------------------
# To set up dependencies/integrations with other apps
# Name of the app being installed is passed as an argument

# before_app_install = "photos.utils.before_app_install"
# after_app_install = "photos.utils.after_app_install"

# Integration Cleanup
# -------------------
# To clean up dependencies/integrations with other apps
# Name of the app being uninstalled is passed as an argument

# before_app_uninstall = "photos.utils.before_app_uninstall"
# after_app_uninstall = "photos.utils.after_app_uninstall"

# Build
# ------------------
# To hook into the build process

# after_build = "photos.build.after_build"

# To hook into the build process of other apps
# The list of apps being built is passed as an argument

# after_app_build = "photos.build.after_app_build"

# Desk Notifications
# ------------------
# See frappe.core.notifications.get_notification_config

# notification_config = "photos.notifications.get_notification_config"

# Awesome Bar
# -----------
# Extra search results: list of dicts with label, description, route, index.
# route: ["List", "ToDo"], "/desk/docs/some/page", or "https://example.com"
# awesomebar_search = ["photos.search.awesomebar_results"]

# Permissions
# -----------
# Permissions evaluated in scripted ways

# permission_query_conditions = {
# 	"Event": "frappe.desk.doctype.event.event.get_permission_query_conditions",
# }
#
# has_permission = {
# 	"Event": "frappe.desk.doctype.event.event.has_permission",
# }

# Document Events
# ---------------
# Hook on document methods and events

# doc_events = {
# 	"*": {
# 		"on_update": "method",
# 		"on_cancel": "method",
# 		"on_trash": "method"
# 	}
# }

# Scheduled Tasks
# ---------------

# scheduler_events = {
# 	"all": [
# 		"photos.tasks.all"
# 	],
# 	"daily": [
# 		"photos.tasks.daily"
# 	],
# 	"hourly": [
# 		"photos.tasks.hourly"
# 	],
# 	"weekly": [
# 		"photos.tasks.weekly"
# 	],
# 	"monthly": [
# 		"photos.tasks.monthly"
# 	],
# }

# Testing
# -------

# before_tests = "photos.install.before_tests"

# Extend DocType Class
# ------------------------------
#
# Specify custom mixins to extend the standard doctype controller.
# extend_doctype_class = {
# 	"Task": "photos.custom.task.CustomTaskMixin"
# }

# Overriding Methods
# ------------------------------
#
# override_whitelisted_methods = {
# 	"frappe.desk.doctype.event.event.get_events": "photos.event.get_events"
# }
#
# each overriding function accepts a `data` argument;
# generated from the base implementation of the doctype dashboard,
# along with any modifications made in other Frappe apps
# override_doctype_dashboards = {
# 	"Task": "photos.task.get_dashboard_data"
# }

# exempt linked doctypes from being automatically cancelled
#
# auto_cancel_exempted_doctypes = ["Auto Repeat"]

# Ignore links to specified DocTypes when deleting documents
# -----------------------------------------------------------

# ignore_links_on_delete = ["Communication", "ToDo"]

# Request Events
# ----------------
# before_request = ["photos.utils.before_request"]
# after_request = ["photos.utils.after_request"]

# Job Events
# ----------
# before_job = ["photos.utils.before_job"]
# after_job = ["photos.utils.after_job"]

# after_file_upload = ["photos.utils.after_file_upload"]

# User Data Protection
# --------------------

# user_data_fields = [
# 	{
# 		"doctype": "{doctype_1}",
# 		"filter_by": "{filter_by}",
# 		"redact_fields": ["{field_1}", "{field_2}"],
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_2}",
# 		"filter_by": "{filter_by}",
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_3}",
# 		"strict": False,
# 	},
# 	{
# 		"doctype": "{doctype_4}"
# 	}
# ]

# Authentication and authorization
# --------------------------------

# auth_hooks = [
# 	"photos.auth.validate"
# ]

# Automatically update python controller files with type annotations for this app.
export_python_type_annotations = True

# Require all whitelisted methods to have type annotations
require_type_annotated_api_methods = True

# default_log_clearing_doctypes = {
# 	"Logging DocType Name": 30  # days to retain logs
# }

# Translation
# ------------
# List of apps whose translatable strings should be excluded from this app's translations.
# ignore_translatable_strings_from = []
