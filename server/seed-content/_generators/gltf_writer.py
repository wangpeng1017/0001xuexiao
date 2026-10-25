"""Small dependency-free glTF 2.0 / GLB writer.

Only what the seed models need: flat-shaded boxes, cylinders and cones with
per-material PBR base colours, packed into a single GLB file.
"""

from __future__ import annotations

import json
import math
import struct
from collections import OrderedDict
from pathlib import Path


class GeometryBuilder:
    def __init__(self, materials: dict[str, dict]):
        self.materials = materials
        self.groups: "OrderedDict[str, dict]" = OrderedDict()

    def _group(self, material: str) -> dict:
        if material not in self.materials:
            raise KeyError(f"unknown material: {material}")
        if material not in self.groups:
            self.groups[material] = {"positions": [], "normals": [], "indices": []}
        return self.groups[material]

    @staticmethod
    def _normal(p0, p1, p2):
        ux, uy, uz = p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]
        vx, vy, vz = p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]
        nx, ny, nz = uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx
        length = math.sqrt(nx * nx + ny * ny + nz * nz)
        if length < 1e-12:
            raise ValueError("degenerate triangle")
        return (nx / length, ny / length, nz / length)

    def add_face(self, material: str, points, normals=None):
        if len(points) < 3:
            raise ValueError("a face needs at least 3 points")
        group = self._group(material)
        base = len(group["positions"])
        if normals is None:
            normal = self._normal(points[0], points[1], points[2])
            normals = [normal] * len(points)
        if len(normals) != len(points):
            raise ValueError("normal count mismatch")
        group["positions"].extend(tuple(float(v) for v in p) for p in points)
        group["normals"].extend(tuple(float(v) for v in n) for n in normals)
        for i in range(1, len(points) - 1):
            group["indices"].extend((base, base + i, base + i + 1))

    def add_box(
        self,
        material: str,
        center,
        size,
        rotation_y: float = 0.0,
    ):
        cx, cy, cz = center
        hx, hy, hz = size[0] / 2.0, size[1] / 2.0, size[2] / 2.0
        cos_a, sin_a = math.cos(rotation_y), math.sin(rotation_y)

        def point(x, y, z):
            return (
                cx + x * cos_a + z * sin_a,
                cy + y,
                cz - x * sin_a + z * cos_a,
            )

        # Corner ids: 0..3 bottom (-x-z, +x-z, +x+z, -x+z), 4..7 top.
        bottom = [
            point(-hx, -hy, -hz),
            point(hx, -hy, -hz),
            point(hx, -hy, hz),
            point(-hx, -hy, hz),
        ]
        top = [
            point(-hx, hy, -hz),
            point(hx, hy, -hz),
            point(hx, hy, hz),
            point(-hx, hy, hz),
        ]
        # Counter-clockwise when viewed from outside.
        self.add_face(material, [top[3], top[2], top[1], top[0]])  # +Y
        self.add_face(material, [bottom[0], bottom[1], bottom[2], bottom[3]])  # -Y
        self.add_face(material, [bottom[3], bottom[2], top[2], top[3]])  # +Z
        self.add_face(material, [bottom[0], top[0], top[1], bottom[1]])  # -Z
        self.add_face(material, [bottom[1], top[1], top[2], bottom[2]])  # +X
        self.add_face(material, [bottom[3], top[3], top[0], bottom[0]])  # -X

    def add_cylinder(
        self,
        material: str,
        base_center,
        radius_bottom: float,
        radius_top: float,
        height: float,
        segments: int = 16,
        bottom_cap: bool = True,
        top_cap: bool = True,
    ):
        if segments < 3:
            raise ValueError("segments must be >= 3")
        cx, base_y, cz = base_center
        top_y = base_y + height
        angles = [2.0 * math.pi * i / segments for i in range(segments)]

        def ring_point(angle, radius, y):
            return (cx + radius * math.cos(angle), y, cz + radius * math.sin(angle))

        if radius_top <= 1e-9:
            apex = (cx, top_y, cz)
            for i in range(segments):
                a0, a1 = angles[i], angles[(i + 1) % segments]
                p0 = ring_point(a0, radius_bottom, base_y)
                p1 = ring_point(a1, radius_bottom, base_y)
                self.add_face(material, [p0, apex, p1])
        else:
            for i in range(segments):
                a0, a1 = angles[i], angles[(i + 1) % segments]
                p0 = ring_point(a0, radius_bottom, base_y)
                p1 = ring_point(a1, radius_bottom, base_y)
                q1 = ring_point(a1, radius_top, top_y)
                q0 = ring_point(a0, radius_top, top_y)
                self.add_face(material, [p0, q0, q1, p1])

        if bottom_cap and radius_bottom > 1e-9:
            center = (cx, base_y, cz)
            for i in range(segments):
                a0, a1 = angles[i], angles[(i + 1) % segments]
                p0 = ring_point(a0, radius_bottom, base_y)
                p1 = ring_point(a1, radius_bottom, base_y)
                self.add_face(material, [center, p0, p1])
        if top_cap and radius_top > 1e-9:
            center = (cx, top_y, cz)
            for i in range(segments):
                a0, a1 = angles[i], angles[(i + 1) % segments]
                q0 = ring_point(a0, radius_top, top_y)
                q1 = ring_point(a1, radius_top, top_y)
                self.add_face(material, [center, q1, q0])

    def add_cone(
        self,
        material: str,
        base_center,
        radius: float,
        height: float,
        segments: int = 16,
    ):
        self.add_cylinder(
            material,
            base_center,
            radius_bottom=radius,
            radius_top=0.0,
            height=height,
            segments=segments,
            bottom_cap=True,
            top_cap=False,
        )

    def bounds(self):
        if not self.groups:
            return None
        points = [p for group in self.groups.values() for p in group["positions"]]
        if not points:
            return None
        mins = [min(p[i] for p in points) for i in range(3)]
        maxs = [max(p[i] for p in points) for i in range(3)]
        return mins, maxs

    def triangle_count(self):
        return sum(len(g["indices"]) // 3 for g in self.groups.values())

    def vertex_count(self):
        return sum(len(g["positions"]) for g in self.groups.values())

    def build_glb(self, path: Path, mesh_name: str) -> bytes:
        if not self.groups:
            raise ValueError("empty geometry")

        binary = bytearray()
        buffer_views = []
        accessors = []
        primitives = []
        gltf_materials = []

        def append_blob(blob: bytes, target: int) -> int:
            while len(binary) % 4:
                binary.append(0)
            offset = len(binary)
            binary.extend(blob)
            buffer_views.append(
                {"buffer": 0, "byteOffset": offset, "byteLength": len(blob), "target": target}
            )
            return len(buffer_views) - 1

        for material_key, group in self.groups.items():
            positions = group["positions"]
            normals = group["normals"]
            indices = group["indices"]
            if not positions or not indices:
                continue

            pos_flat = [component for p in positions for component in p]
            pos_blob = struct.pack(f"<{len(pos_flat)}f", *pos_flat)
            pos_values = struct.unpack(f"<{len(pos_flat)}f", pos_blob)
            pos_min = [min(pos_values[i::3]) for i in range(3)]
            pos_max = [max(pos_values[i::3]) for i in range(3)]
            pos_view = append_blob(pos_blob, 34962)
            pos_accessor = len(accessors)
            accessors.append(
                {
                    "bufferView": pos_view,
                    "componentType": 5126,
                    "count": len(positions),
                    "type": "VEC3",
                    "min": pos_min,
                    "max": pos_max,
                }
            )

            norm_flat = [component for n in normals for component in n]
            norm_blob = struct.pack(f"<{len(norm_flat)}f", *norm_flat)
            norm_view = append_blob(norm_blob, 34962)
            norm_accessor = len(accessors)
            accessors.append(
                {
                    "bufferView": norm_view,
                    "componentType": 5126,
                    "count": len(normals),
                    "type": "VEC3",
                }
            )

            if max(indices) <= 65535:
                idx_blob = struct.pack(f"<{len(indices)}H", *indices)
                idx_component_type = 5123
            else:
                idx_blob = struct.pack(f"<{len(indices)}I", *indices)
                idx_component_type = 5125
            idx_view = append_blob(idx_blob, 34963)
            idx_accessor = len(accessors)
            accessors.append(
                {
                    "bufferView": idx_view,
                    "componentType": idx_component_type,
                    "count": len(indices),
                    "type": "SCALAR",
                }
            )

            material_index = len(gltf_materials)
            material = self.materials[material_key]
            pbr = {
                "baseColorFactor": list(material["baseColorFactor"]),
                "metallicFactor": material.get("metallicFactor", 0.0),
                "roughnessFactor": material.get("roughnessFactor", 0.8),
            }
            gltf_material = {"name": material["name"], "pbrMetallicRoughness": pbr}
            if "emissiveFactor" in material:
                gltf_material["emissiveFactor"] = list(material["emissiveFactor"])
            gltf_materials.append(gltf_material)
            primitives.append(
                {
                    "attributes": {"POSITION": pos_accessor, "NORMAL": norm_accessor},
                    "indices": idx_accessor,
                    "material": material_index,
                    "mode": 4,
                }
            )

        while len(binary) % 4:
            binary.append(0)

        gltf = {
            "asset": {
                "version": "2.0",
                "generator": "vis-F018 procedural seed generator",
            },
            "scene": 0,
            "scenes": [{"name": mesh_name, "nodes": [0]}],
            "nodes": [{"name": mesh_name, "mesh": 0}],
            "meshes": [{"name": mesh_name, "primitives": primitives}],
            "materials": gltf_materials,
            "buffers": [{"byteLength": len(binary)}],
            "bufferViews": buffer_views,
            "accessors": accessors,
        }
        json_bytes = json.dumps(
            gltf, ensure_ascii=False, separators=(",", ":"), allow_nan=False
        ).encode("utf-8")
        while len(json_bytes) % 4:
            json_bytes += b" "

        total_length = 12 + 8 + len(json_bytes) + 8 + len(binary)
        header = struct.pack("<III", 0x46546C67, 2, total_length)
        json_chunk = struct.pack("<II", len(json_bytes), 0x4E4F534A) + json_bytes
        bin_chunk = struct.pack("<II", len(binary), 0x004E4942) + bytes(binary)
        glb = header + json_chunk + bin_chunk
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(glb)
        return glb
