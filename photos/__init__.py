__version__ = "0.0.1"

try:
    from pillow_heif import register_heif_opener

    register_heif_opener()
except ImportError:
    pass
