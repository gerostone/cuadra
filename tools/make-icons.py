"""Genera los íconos de la PWA en public/icons/ sin dependencias (PNG en Python puro).

Diseño: la marca de Cuadra (cartel partido azul "vende" / amarillo "alquila")
sobre el fondo oscuro de la app. La versión "maskable" deja la marca dentro de la
zona segura (80 % central) para que Android pueda recortarla en círculo o gota.

Uso: python3 tools/make-icons.py
"""
import os
import struct
import zlib

BG = (0x1B, 0x21, 0x24)
VENTA = (0x1D, 0x4F, 0xD8)
ALQUILER = (0xE2, 0xA4, 0x00)
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'icons')


def inside_round_rect(x, y, x0, y0, x1, y1, r):
    if x < x0 or x > x1 or y < y0 or y > y1:
        return False
    cx = min(max(x, x0 + r), x1 - r)
    cy = min(max(y, y0 + r), y1 - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def render(size, mark_h, corner=0.0):
    """mark_h: alto de la marca como fracción del ícono. corner: radio del fondo (0 = cuadrado)."""
    mw, mh = mark_h * 0.45, mark_h  # proporción de la marca de la app (9 x 20)
    x0, y0 = (1 - mw) / 2, (1 - mh) / 2
    x1, y1 = x0 + mw, y0 + mh
    r_mark = mw * 0.22
    ss = 4  # supermuestreo para bordes suaves
    rows = []
    for py in range(size):
        row = bytearray([0])  # filtro PNG "None"
        for px in range(size):
            acc = [0, 0, 0, 0]
            for sy in range(ss):
                for sx in range(ss):
                    x = (px + (sx + .5) / ss) / size
                    y = (py + (sy + .5) / ss) / size
                    if corner and not inside_round_rect(x, y, 0, 0, 1, 1, corner):
                        continue  # esquina transparente
                    if inside_round_rect(x, y, x0, y0, x1, y1, r_mark):
                        c = VENTA if y < (y0 + y1) / 2 else ALQUILER
                    else:
                        c = BG
                    acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2]; acc[3] += 255
            n = ss * ss
            a = acc[3] / n
            if a:
                row += bytes([round(acc[0] / (acc[3] / 255)), round(acc[1] / (acc[3] / 255)), round(acc[2] / (acc[3] / 255)), round(a)])
            else:
                row += bytes([0, 0, 0, 0])
        rows.append(bytes(row))
    return rows


def write_png(path, size, rows):
    def chunk(kind, data):
        c = struct.pack('>I', len(data)) + kind + data
        return c + struct.pack('>I', zlib.crc32(kind + data) & 0xFFFFFFFF)
    raw = b''.join(rows)
    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)) \
        + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(png)


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    specs = [
        ('icon-192.png', 192, 0.58, 0.18),       # "any": fondo redondeado
        ('icon-512.png', 512, 0.58, 0.18),
        ('maskable-512.png', 512, 0.46, 0.0),    # marca dentro de la zona segura, fondo completo
        ('apple-touch-icon.png', 180, 0.52, 0.0),  # iOS redondea solo y no admite transparencia
    ]
    for name, size, mark, corner in specs:
        write_png(os.path.join(OUT, name), size, render(size, mark, corner))
        print('ok', name)
