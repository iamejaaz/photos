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


@click.command("photos-setup")
@click.option("--scan", is_flag=True, help="Also scan existing photos and videos")
@pass_context
def photos_setup(context, scan=False):
    "Download the models and city list Photos uses for people, places and things"
    import frappe

    frappe.init(site=get_site(context))
    frappe.connect()
    try:
        from photos import assets
        from photos import scan as scanner

        assets.setup()
        if not assets.opencv_installed():
            print("People and things need OpenCV: bench pip install opencv-python-headless")
        if scan:
            scanner.run()
    finally:
        frappe.destroy()


commands = [photos_demo_data, photos_setup]
