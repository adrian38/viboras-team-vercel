"""Genera los iconos de `front/iconos-dev/` a partir de los de produccion.

    python tools/iconos-dev.py

No es una guarda y no esta en `npm run check`: se ejecuta a mano, y solo
cuando cambie el logo. Necesita Python con Pillow, que no es dependencia del
proyecto (`pip install pillow`).

Que hace: pinta de violeta el fondo de cada icono, dejando el dibujo intacto.
No es un "sustituye el negro por violeta" global, porque el logo tiene negro
dentro —las escamas de la serpiente, la sombra bajo las palas— y eso lo
borraria. Lo que hace es un relleno por inundacion desde los cuatro bordes:
solo se pinta el negro que llega hasta el borde de la imagen. El hueco oscuro
que queda entre los anillos de la serpiente si se pinta, porque de verdad esta
conectado con el fondo, y eso es lo que se quiere.

Despues, un anillo de un pixel: los bordes del dibujo estan suavizados contra
negro, asi que sin esta pasada queda una linea oscura alrededor del logo.
"""
import sys
from collections import deque
from pathlib import Path

from PIL import Image

RAIZ = Path(__file__).resolve().parent.parent
ORIGEN = RAIZ
DESTINO = RAIZ / 'front' / 'iconos-dev'

# El violeta de las ramas de pruebas. No sale de theme.css a proposito: no es
# un color de la aplicacion, es la senal de que esto NO es produccion.
COLOR = (124, 58, 237)   # #7C3AED
FONDO = 36               # pixel pegado al borde y mas oscuro que esto: fondo
BORDE = 110              # el anillo de antialias se mezcla segun lo oscuro que sea

ICONOS = [
    'icon-192.png',
    'icon-512.png',
    'icon-maskable-512.png',
    'front/iconos/apple-touch-icon.png',
]


def mascara_de_fondo(px, w, h):
    """Los pixeles oscuros conectados con el borde de la imagen."""
    dentro = bytearray(w * h)
    cola = deque()

    def meter(x, y):
        if 0 <= x < w and 0 <= y < h and not dentro[y * w + x]:
            r, g, b, a = px[x, y]
            if max(r, g, b) <= FONDO and a == 255:
                dentro[y * w + x] = 1
                cola.append((x, y))

    for x in range(w):
        meter(x, 0)
        meter(x, h - 1)
    for y in range(h):
        meter(0, y)
        meter(w - 1, y)

    fondo = []
    while cola:
        x, y = cola.popleft()
        fondo.append((x, y))
        meter(x + 1, y)
        meter(x - 1, y)
        meter(x, y + 1)
        meter(x, y - 1)
    return fondo, dentro


def mezclar(px, x, y, t):
    r, g, b, _ = px[x, y]
    px[x, y] = (round(r + (COLOR[0] - r) * t),
                round(g + (COLOR[1] - g) * t),
                round(b + (COLOR[2] - b) * t), 255)


def recolorear(origen, destino):
    im = Image.open(origen).convert('RGBA')
    w, h = im.size
    px = im.load()
    fondo, dentro = mascara_de_fondo(px, w, h)

    anillo = {}
    for x, y in fondo:
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            vx, vy = x + dx, y + dy
            if 0 <= vx < w and 0 <= vy < h and not dentro[vy * w + vx]:
                r, g, b, a = px[vx, vy]
                if max(r, g, b) < BORDE and a == 255:
                    anillo[(vx, vy)] = 1 - max(r, g, b) / BORDE

    for x, y in fondo:
        mezclar(px, x, y, 1)
    for (x, y), t in anillo.items():
        mezclar(px, x, y, t)

    im.save(destino)
    return 100 * len(fondo) / (w * h), len(anillo)


def main():
    DESTINO.mkdir(parents=True, exist_ok=True)
    for ruta in ICONOS:
        origen = ORIGEN / ruta
        if not origen.is_file():
            print(f'falta {ruta}', file=sys.stderr)
            return 1
        salida = DESTINO / Path(ruta).name
        porcentaje, anillo = recolorear(origen, salida)
        print(f'{salida.relative_to(RAIZ)}: fondo {porcentaje:.1f}%, anillo {anillo} px')
    return 0


if __name__ == '__main__':
    sys.exit(main())
