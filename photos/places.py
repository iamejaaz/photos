import json
import math

import frappe

from photos import assets
from photos.settings import enabled

MAX_DISTANCE_KM = 60
NEARBY_KM = 20

_index = None


def available():
    return enabled("places") and assets.ready("cities")


def _load():
    global _index
    if _index is None:
        import numpy as np

        names, countries, lats, lons, populations = [], [], [], [], []
        with assets.path("cities").open(encoding="utf-8") as cities:
            for line in cities:
                columns = line.rstrip("\n").split("\t")
                if columns[7] == "PPLX":
                    continue
                names.append(columns[1])
                countries.append(columns[8])
                lats.append(float(columns[4]))
                lons.append(float(columns[5]))
                populations.append(int(columns[14] or 0))
        with open(frappe.get_app_path("frappe", "geo", "country_info.json")) as info:
            country_names = {row.get("code", "").upper(): name for name, row in json.load(info).items()}
        _index = {
            "names": names,
            "countries": [country_names.get(code, code) for code in countries],
            "lat": np.radians(np.array(lats)),
            "lon": np.radians(np.array(lons)),
            "population": np.array(populations),
        }
    return _index


def lookup(latitude, longitude):
    if not available() or not (latitude or longitude):
        return None
    import numpy as np

    index = _load()
    lat, lon = math.radians(latitude), math.radians(longitude)
    x = (index["lon"] - lon) * np.cos((index["lat"] + lat) / 2)
    y = index["lat"] - lat
    distances = np.sqrt(x * x + y * y) * 6371
    nearby = np.flatnonzero(distances <= NEARBY_KM)
    if len(nearby):
        best = int(nearby[np.argmax(index["population"][nearby])])
    else:
        best = int(np.argmin(distances))
        if distances[best] > MAX_DISTANCE_KM:
            return None
    return {"city": index["names"][best], "country": index["countries"][best]}
