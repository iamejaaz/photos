import json
import math

import frappe

from photos.smart import assets
from photos.smart.settings import enabled

MAX_DISTANCE_KM = 60
NEARBY_KM = 20

_index = None


def available():
    return enabled("places") and assets.ready("cities")


def _load():
    global _index
    if _index is None:
        import numpy as np

        names, ascii_names, countries, lats, lons, populations = [], [], [], [], [], []
        with assets.path("cities").open(encoding="utf-8") as cities:
            for line in cities:
                columns = line.rstrip("\n").split("\t")
                if columns[7] == "PPLX":
                    continue
                names.append(columns[1])
                ascii_names.append(columns[2].lower())
                countries.append(columns[8])
                lats.append(float(columns[4]))
                lons.append(float(columns[5]))
                populations.append(int(columns[14] or 0))
        with open(frappe.get_app_path("frappe", "geo", "country_info.json")) as info:
            country_names = {row.get("code", "").upper(): name for name, row in json.load(info).items()}
        _index = {
            "names": names,
            "ascii": ascii_names,
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


def search(query, limit=8):
    query = (query or "").strip().lower()
    if len(query) < 2 or not assets.ready("cities"):
        return []
    index = _load()
    matches = [i for i, name in enumerate(index["ascii"]) if name.startswith(query)]
    matches.sort(key=lambda i: -int(index["population"][i]))
    results, cities = [], []
    for i in matches:
        name, country = index["names"][i], index["countries"][i]
        if any(name.startswith(f"{city} ") and country == other for city, other in cities):
            continue
        cities.append((name, country))
        results.append(
            {
                "label": f"{name}, {country}",
                "country": country,
                "latitude": round(math.degrees(index["lat"][i]), 5),
                "longitude": round(math.degrees(index["lon"][i]), 5),
            }
        )
        if len(results) == limit:
            break
    return results
