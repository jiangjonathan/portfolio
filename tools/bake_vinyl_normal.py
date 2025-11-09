#!/usr/bin/env python3
"""Bake the concentric vinyl groove normal map into public/vinyl-normal.png."""
from __future__ import annotations
import math
import struct
import zlib
from pathlib import Path

SIZE = 2048
UV_SPAN = 10.0
DISC_RADIUS = 2.6
RING_COUNT = 200
GROOVE_WIDTH = 0.5
GROOVE_DEPTH = 1.0
SEPARATOR_INTERVAL = 48
SEPARATOR_WIDTH_MULTIPLIER = 2.5
SEPARATOR_DEPTH = 0.45
INNER_LABEL_GUARD = 0.445
SAMPLE_OFFSETS = (0.15, 0.5, 0.85)
NORMAL_STRENGTH = 1.85
BASE_CENTERS = ((2.5, 2.5), (2.5, 7.5))


def clamp(value: float, min_value: float, max_value: float) -> float:
    return max(min_value, min(max_value, value))


def hash_value(value: float) -> float:
    return abs(math.sin(value * 127.1 + 311.7) * 43758.5453) % 1


def closest_center(u_coord: float, v_coord: float) -> tuple[float, float, float, int]:
    min_distance = float("inf")
    best = (BASE_CENTERS[0][0], BASE_CENTERS[0][1], 0)

    for index, (cu, cv) in enumerate(BASE_CENTERS):
        v_offset = round((v_coord - cv) / UV_SPAN) * UV_SPAN
        effective_v = cv + v_offset
        du = u_coord - cu
        dv = v_coord - effective_v
        distance = math.hypot(du, dv)
        if distance < min_distance:
            min_distance = distance
            best = (cu, effective_v, index)

    return min_distance, *best


def sample_height(px: float, py: float) -> float:
    u_coord = (px / SIZE) * UV_SPAN
    v_coord = (1 - py / SIZE) * UV_SPAN
    min_distance, center_u, center_v, center_index = closest_center(u_coord, v_coord)

    if min_distance > DISC_RADIUS:
        return 0.0

    radius_norm = min(min_distance / DISC_RADIUS, 1.0)
    if radius_norm < INNER_LABEL_GUARD:
        return SEPARATOR_DEPTH

    radial_variation = (
        0.02 * math.sin(radius_norm * 80 + center_u)
        + 0.013 * math.sin(radius_norm * 200 + center_v)
    )
    warped_radius = clamp(radius_norm + radial_variation, 0.0, 1.0)
    angle = math.atan2(v_coord - center_v, u_coord - center_u)
    rotation_noise_raw = (
        0.08 * math.sin(angle * 16 + center_u * 7)
        + 0.03 * math.sin(radius_norm * 180 + center_v * 11)
        + (hash_value(math.floor(radius_norm * RING_COUNT) + center_u * 17) - 0.5)
        * 0.15
    )
    max_noise_offset = GROOVE_WIDTH * 0.18
    rotation_noise = clamp(rotation_noise_raw, -max_noise_offset, max_noise_offset)

    base_position = warped_radius * RING_COUNT
    track_index = math.floor(base_position)
    is_separator = track_index % SEPARATOR_INTERVAL == 0
    position_for_phase = base_position + (0 if is_separator else rotation_noise)
    groove_phase = (position_for_phase % 1 + 1) % 1

    if is_separator:
        separator_width = GROOVE_WIDTH * SEPARATOR_WIDTH_MULTIPLIER
        return SEPARATOR_DEPTH if groove_phase < separator_width else 0.0

    track_variation = 0.65 + hash_value(
        track_index * 19.19 + center_v * 23.3 + center_index * 11.17
    ) * 0.55
    effective_groove_width = GROOVE_WIDTH * track_variation

    if groove_phase >= effective_groove_width:
        return 0.0

    local = groove_phase / effective_groove_width
    triangle = 1 - abs(local * 2 - 1)
    return triangle * GROOVE_DEPTH


def build_height_field() -> list[float]:
    height_field = [0.0] * (SIZE * SIZE)
    sample_count = len(SAMPLE_OFFSETS) ** 2
    for y in range(SIZE):
        for x in range(SIZE):
            accum = 0.0
            for oy in SAMPLE_OFFSETS:
                for ox in SAMPLE_OFFSETS:
                    sample_x = min(SIZE - 1.0, x + ox)
                    sample_y = min(SIZE - 1.0, y + oy)
                    accum += sample_height(sample_x, sample_y)
            height_field[y * SIZE + x] = accum / sample_count
    return height_field


def height_to_png_bytes(height_field: list[float]) -> bytes:
    data = bytearray(SIZE * SIZE * 4)
    for y in range(SIZE):
        for x in range(SIZE):
            index = y * SIZE + x
            left = height_field[y * SIZE + max(x - 1, 0)]
            right = height_field[y * SIZE + min(x + 1, SIZE - 1)]
            top = height_field[max(y - 1, 0) * SIZE + x]
            bottom = height_field[min(y + 1, SIZE - 1) * SIZE + x]

            dx = (right - left) * NORMAL_STRENGTH
            dy = (bottom - top) * NORMAL_STRENGTH
            dz = 1.0
            length = math.sqrt(dx * dx + dy * dy + dz * dz) or 1.0

            nx = dx / length
            ny = dy / length
            nz = dz / length

            di = index * 4
            data[di] = int((nx * 0.5 + 0.5) * 255) & 0xFF
            data[di + 1] = int((ny * 0.5 + 0.5) * 255) & 0xFF
            data[di + 2] = int((nz * 0.5 + 0.5) * 255) & 0xFF
            data[di + 3] = 255
    return bytes(data)


def write_png(path: Path, rgba_bytes: bytes) -> None:
    def chunk(chunk_type: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + chunk_type
            + data
            + struct.pack(">I", zlib.crc32(chunk_type + data) & 0xFFFFFFFF)
        )

    raw = bytearray()
    row_bytes = SIZE * 4
    for y in range(SIZE):
        raw.append(0)
        start = y * row_bytes
        raw.extend(rgba_bytes[start : start + row_bytes])

    compressed = zlib.compress(bytes(raw), level=9)

    png = bytearray()
    png.extend(b"\x89PNG\r\n\x1a\n")
    png.extend(chunk(b"IHDR", struct.pack(">IIBBBBB", SIZE, SIZE, 8, 6, 0, 0, 0)))
    png.extend(chunk(b"IDAT", compressed))
    png.extend(chunk(b"IEND", b""))

    path.write_bytes(png)


def main() -> None:
    out_path = Path("public/vinyl-normal.png")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    print("Generating height field...")
    height_field = build_height_field()
    print("Converting to PNG...")
    rgba = height_to_png_bytes(height_field)
    write_png(out_path, rgba)
    size_mb = out_path.stat().st_size / (1024 * 1024)
    print(f"Wrote {out_path} ({size_mb:.2f} MB)")


if __name__ == "__main__":
    main()
