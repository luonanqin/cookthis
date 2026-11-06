"""用 page_source 一次拉取解析控件，避免对每个节点远程读 text/rect。"""

from __future__ import annotations

import re
import time
import xml.etree.ElementTree as ET
from dataclasses import dataclass

_BOUNDS_RE = re.compile(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]")


@dataclass
class NodeInfo:
    text: str
    x: int
    y: int
    x2: int
    y2: int
    class_name: str
    resource_id: str


def parse_page_nodes(driver) -> tuple[list[NodeInfo], float]:
    """返回 (节点列表, page_source 耗时秒)。"""
    t0 = time.perf_counter()
    src = driver.page_source
    fetch_s = time.perf_counter() - t0
    t1 = time.perf_counter()
    try:
        root = ET.fromstring(src)
    except ET.ParseError:
        return [], fetch_s
    nodes: list[NodeInfo] = []
    for el in root.iter():
        text = (el.attrib.get("text") or "").strip()
        if not text:
            continue
        bounds = el.attrib.get("bounds") or ""
        m = _BOUNDS_RE.match(bounds)
        if not m:
            continue
        x1, y1, x2, y2 = map(int, m.groups())
        nodes.append(
            NodeInfo(
                text=text,
                x=x1,
                y=y1,
                x2=x2,
                y2=y2,
                class_name=el.attrib.get("class") or "",
                resource_id=el.attrib.get("resource-id") or "",
            )
        )
    _ = time.perf_counter() - t1
    return nodes, fetch_s


def tap_node_center(driver, node: NodeInfo) -> None:
    x = (node.x + node.x2) // 2
    y = (node.y + node.y2) // 2
    driver.execute_script("mobile: clickGesture", {"x": x, "y": y})
