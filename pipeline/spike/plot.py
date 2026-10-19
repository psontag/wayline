"""Draw all proposals over the route network into overview.png.

Usage: python plot.py <extract.json> <output_dir>
"""

import glob
import json
import sys
import xml.etree.ElementTree as ET

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

SRC, OUT = sys.argv[1], sys.argv[2]
ns = {"g": "http://www.topografix.com/GPX/1/1"}
d = json.load(open(SRC))
files = sorted(glob.glob(f"{OUT}/*.gpx"))
fig, axes = plt.subplots(2, 3, figsize=(24, 16))
for ax, f in zip(axes.flat, files):
    for w in d["ways"].values():
        xs, ys = zip(*w["coords"])
        ax.plot(xs, ys, color="#ddd", lw=0.4)
    t = ET.parse(f)
    colors = ["r", "b", "g", "m"]  # one color per stage
    for i, seg in enumerate(t.findall(".//g:trkseg", ns)):
        pts = [(float(p.get("lon")), float(p.get("lat"))) for p in seg.findall("g:trkpt", ns)]
        xs, ys = zip(*pts)
        ax.plot(xs, ys, color=colors[i], lw=1.5)
    for w in t.findall("g:wpt", ns):
        ax.plot(float(w.get("lon")), float(w.get("lat")), "ko")
        ax.annotate(w.find("g:name", ns).text, (float(w.get("lon")), float(w.get("lat"))), fontsize=8)
    ax.set_title(f.split("/")[-1])
    ax.set_aspect(1.5)
plt.tight_layout()
plt.savefig(f"{OUT}/overview.png", dpi=60)
