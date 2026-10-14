import click
from frappe.commands import get_site, pass_context


@click.command("photos-demo-data")
@click.option("--images", "images_dir", help="Folder of .jpg or .png files to use instead of downloading")
@click.option("--count", default=80, show_default=True, help="Number of photos to load")
@pass_context
def photos_demo_data(context, images_dir=None, count=80):
    "Load demo photos, people and shared albums into Photos"
    import frappe

    frappe.init(site=get_site(context))
    frappe.connect()
    try:
        from photos.demo import load

        load(images_dir=images_dir, count=count)
    finally:
        frappe.destroy()


commands = [photos_demo_data]
