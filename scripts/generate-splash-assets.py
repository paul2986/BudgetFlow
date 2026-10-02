#!/usr/bin/env python3
"""Regenerates the launch-screen art from the app icon.

    python3 scripts/generate-splash-assets.py

Reads assets/images/icon.png (white "B" on a diagonal indigo -> blue -> teal
gradient) and writes two files next to it:

  splash-mark.png        the white B alone, transparent, cropped square
  splash-background.png  the icon's gradient, full-bleed portrait, with a soft
                         glow behind where the mark sits

The native launch screen (plugins/withSplashBackground.js plus the
expo-splash-screen entry in app.config.ts) and the animated hand-off in
components/AnimatedSplash.tsx both draw these two files, so the two look
identical. Needs Pillow only.
"""
import os
import random

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMAGES = os.path.join(ROOT, 'assets', 'images')

BG_SIZE = (640, 1386)  # ~iPhone aspect; smooth enough to upscale on any screen
MARK_SIZE = 768
MARK_PAD = 0.045  # breathing room around the glyph, as a share of its height


def bin_color(samples):
    """Median colour per channel."""
    return tuple(sorted(c[i] for c in samples)[len(samples) // 2] for i in range(3))


def extract_mark(icon, lut):
    """White glyph -> transparent PNG.

    The glyph is white, so a pixel's smallest channel is high inside it and, on
    the gradient, never above the background's own smallest channel. Coverage is
    how far the pixel sits above that background level (taken from the gradient
    LUT, since the background's minimum drifts across the icon) toward white.
    The icon is a JPEG, so the glyph's interior wobbles down to ~200: the ramp
    tops out at 240 to keep it solid, and starts a little above the background
    to keep its own noise out of the alpha.
    """
    w, h = icon.size
    src = icon.load()
    steps = 2048
    bg_min = [min(sample(lut, i / (steps - 1))) for i in range(steps)]
    alpha = Image.new('L', icon.size)
    out = alpha.load()
    for y in range(h):
        row_t = 1 - y / (h - 1)
        for x in range(w):
            base = bg_min[int((x / (w - 1) + row_t) / 2 * (steps - 1))] + 12
            a = (min(src[x, y]) - base) / (240 - base)
            if a > 0:
                out[x, y] = 255 if a >= 1 else round(a * 255)
    bbox = alpha.point(lambda v: 255 if v > 24 else 0).getbbox()
    left, top, right, bottom = bbox
    side = round(max(right - left, bottom - top) * (1 + 2 * MARK_PAD))
    cx, cy = (left + right) / 2, (top + bottom) / 2
    box = (round(cx - side / 2), round(cy - side / 2), round(cx + side / 2), round(cy + side / 2))
    white = Image.new('RGBA', icon.size, (255, 255, 255, 0))
    white.putalpha(alpha)
    return white.crop(box).resize((MARK_SIZE, MARK_SIZE), Image.LANCZOS)


def gradient_lut(icon, bins=64):
    """The icon's background colour as a function of t, where t runs 0 at the
    bottom-left corner to 1 at the top-right."""
    small = icon.resize((256, 256), Image.BOX).convert('RGB')
    px = small.load()
    w, h = small.size
    buckets = [[] for _ in range(bins)]
    for y in range(h):
        for x in range(w):
            c = px[x, y]
            if min(c) > 110:  # glyph or its antialiased edge
                continue
            t = (x / (w - 1) + (1 - y / (h - 1))) / 2
            buckets[min(bins - 1, int(t * bins))].append(c)
    lut = [bin_color(b) if b else None for b in buckets]
    # Fill gaps, then smooth so the median's stair-steps don't print.
    for i, c in enumerate(lut):
        if c is None:
            lut[i] = lut[i - 1] if i else next(x for x in lut if x)
    smooth = []
    for i in range(bins):
        window = lut[max(0, i - 2) : i + 3]
        smooth.append(tuple(sum(c[k] for c in window) / len(window) for k in range(3)))
    return smooth


def sample(lut, t):
    t = max(0.0, min(1.0, t)) * (len(lut) - 1)
    i = int(t)
    j = min(len(lut) - 1, i + 1)
    f = t - i
    return tuple(lut[i][k] * (1 - f) + lut[j][k] * f for k in range(3))


def render_background(lut):
    w, h = BG_SIZE
    img = Image.new('RGB', (w, h))
    out = img.load()
    rng = random.Random(7)  # fixed seed: regenerating gives the same bytes
    glow_cx, glow_cy, glow_r = 0.5, 0.5, 0.62  # as shares of width / height / width
    for y in range(h):
        yn = y / (h - 1)
        for x in range(w):
            xn = x / (w - 1)
            r, g, b = sample(lut, (xn + (1 - yn)) / 2)
            # Soft light behind the mark so it sits in the scene, not on it.
            d = (((xn - glow_cx) * w) ** 2 + ((yn - glow_cy) * h) ** 2) ** 0.5 / (glow_r * w)
            if d < 1:
                k = 0.13 * (1 - d * d) ** 2
                r, g, b = r + (255 - r) * k, g + (255 - g) * k, b + (255 - b) * k
            # +-1 level of noise keeps 8-bit steps from banding when scaled up.
            n = rng.random() - 0.5
            out[x, y] = (round(r + n), round(g + n), round(b + n))
    return img


def main():
    icon = Image.open(os.path.join(IMAGES, 'icon.png')).convert('RGB')
    lut = gradient_lut(icon)
    mark = extract_mark(icon, lut)
    mark.save(os.path.join(IMAGES, 'splash-mark.png'), optimize=True)
    bg = render_background(lut)
    bg.save(os.path.join(IMAGES, 'splash-background.png'), optimize=True)
    for name in ('splash-mark.png', 'splash-background.png'):
        size = os.path.getsize(os.path.join(IMAGES, name)) / 1024
        print(f'{name}: {size:.0f} KB')


if __name__ == '__main__':
    main()
