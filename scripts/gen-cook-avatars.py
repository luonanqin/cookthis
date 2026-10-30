#!/usr/bin/env python3
"""Generate 10 cooking cartoon avatar PNGs (512×512) for preference UI."""
from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

SIZE = 512
OUT = Path(__file__).resolve().parents[1] / "miniprogram" / "assets" / "avatars"
BG = (246, 249, 247)
RING = (210, 228, 216)
SOFT = (234, 244, 238)
INK = (42, 36, 32)
BLUSH = (232, 155, 140, 100)


def C(*rgb, a=255):
    return tuple(rgb) + (a,) if a != 255 else tuple(rgb)


def new_layers():
    base = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    return base, ImageDraw.Draw(base, "RGBA")


def paste(dst, src):
    dst.alpha_composite(src)


def disc(draw, xy, r, fill):
    x, y = xy
    draw.ellipse([x - r, y - r, x + r, y + r], fill=fill)


def oval(draw, box, fill):
    draw.ellipse(box, fill=fill)


def finish(layers: Image.Image, path: Path):
    # circular crop onto solid bg
    bg = Image.new("RGBA", (SIZE, SIZE), BG + (255,))
    d = ImageDraw.Draw(bg, "RGBA")
    disc(d, (256, 256), 256, BG + (255,))
    soft = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    sd = ImageDraw.Draw(soft, "RGBA")
    disc(sd, (256, 290), 200, SOFT + (140,))
    bg.alpha_composite(soft)
    bg.alpha_composite(layers)
    ring = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    rd = ImageDraw.Draw(ring, "RGBA")
    rd.ellipse([5, 5, 506, 506], outline=RING + (255,), width=10)
    bg.alpha_composite(ring)
    mask = Image.new("L", (SIZE, SIZE), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, SIZE - 1, SIZE - 1], fill=255)
    out = Image.new("RGBA", (SIZE, SIZE), BG + (255,))
    out.paste(bg, mask=mask)
    out.convert("RGB").save(path, "PNG", optimize=True)


def draw_face(draw, skin, cx=256, cy=250):
    # head
    oval(draw, [cx - 108, cy - 120, cx + 108, cy + 118], skin)
    # blush
    oval(draw, [cx - 88, cy + 18, cx - 52, cy + 42], BLUSH)
    oval(draw, [cx + 52, cy + 18, cx + 88, cy + 42], BLUSH)
    # brows
    draw.arc([cx - 70, cy - 48, cx - 20, cy - 8], 210, 330, fill=INK, width=6)
    draw.arc([cx + 20, cy - 48, cx + 70, cy - 8], 210, 330, fill=INK, width=6)
    # eyes
    oval(draw, [cx - 52, cy - 18, cx - 24, cy + 16], INK)
    oval(draw, [cx + 24, cy - 18, cx + 52, cy + 16], INK)
    disc(draw, (cx - 34, cy - 8), 4, (255, 255, 255, 255))
    disc(draw, (cx + 42, cy - 8), 4, (255, 255, 255, 255))
    # smile
    draw.arc([cx - 32, cy + 20, cx + 32, cy + 72], 25, 155, fill=INK, width=6)


def body(draw, apron, skin):
    # shoulders
    oval(draw, [90, 360, 422, 560], apron)
    # highlight
    oval(draw, [150, 390, 362, 500], (255, 255, 255, 45))
    # neck
    draw.rounded_rectangle([228, 330, 284, 385], radius=18, fill=skin)


def hair_back_bob(draw, hair):
    oval(draw, [140, 140, 372, 360], hair)
    oval(draw, [130, 210, 185, 370], hair)
    oval(draw, [327, 210, 382, 370], hair)


def hair_front_bob(draw, hair):
    # bangs
    oval(draw, [155, 120, 357, 230], hair)
    draw.pieslice([155, 120, 357, 280], 200, 340, fill=hair)


def hair_back_short(draw, hair):
    oval(draw, [155, 145, 357, 280], hair)


def hair_front_short(draw, hair):
    draw.pieslice([155, 130, 357, 260], 200, 340, fill=hair)
    oval(draw, [170, 130, 342, 200], hair)


def hair_back_long(draw, hair):
    oval(draw, [135, 140, 377, 360], hair)
    oval(draw, [120, 220, 185, 420], hair)
    oval(draw, [327, 200, 400, 430], hair)


def hair_front_long(draw, hair):
    oval(draw, [155, 115, 357, 225], hair)


def hair_back_bun(draw, hair):
    oval(draw, [145, 145, 367, 350], hair)
    disc(draw, (256, 120), 44, hair)
    disc(draw, (256, 120), 30, tuple(max(0, c - 18) for c in hair))


def hair_front_bun(draw, hair):
    oval(draw, [165, 125, 347, 215], hair)


def hair_back_kid(draw, hair):
    oval(draw, [155, 150, 357, 330], hair)
    disc(draw, (190, 155), 18, hair)
    disc(draw, (322, 155), 18, hair)


def hair_front_kid(draw, hair):
    oval(draw, [175, 135, 337, 210], hair)


def avatar(skin, hair, apron, hair_back, hair_front, props=None, accessory=None, extra_face=None):
    img, draw = new_layers()
    body(draw, apron, skin)
    hair_back(draw, hair)
    draw_face(draw, skin)
    if extra_face:
        extra_face(draw)
    hair_front(draw, hair)
    # re-draw eyes/smile over bangs edge lightly — bangs shouldn't cover eyes
    # (front hair only covers forehead)
    if accessory:
        accessory(draw)
    if props:
        props(draw)
    return img


def mustache(draw):
    draw.arc([214, 285, 298, 335], 200, 340, fill=(120, 95, 70), width=10)


def glasses(draw):
    draw.ellipse([186, 220, 250, 280], outline=(100, 110, 125, 220), width=5)
    draw.ellipse([262, 220, 326, 280], outline=(100, 110, 125, 220), width=5)
    draw.line([250, 248, 262, 248], fill=(100, 110, 125, 220), width=4)


def chef_hat(draw):
    oval(draw, [155, 70, 357, 145], (255, 255, 255, 255))
    draw.rounded_rectangle([185, 120, 327, 175], radius=14, fill=(255, 255, 255, 255))
    oval(draw, [195, 78, 317, 125], SOFT + (180,))
    # scarf tip on chest
    draw.polygon([(214, 405), (256, 350), (298, 405)], fill=(58, 138, 95, 255))


def spatula(draw):
    draw.rounded_rectangle([368, 285, 386, 420], radius=6, fill=(196, 165, 116, 255))
    oval(draw, [345, 408, 410, 448], (143, 122, 102, 255))


def pan(draw):
    oval(draw, [45, 325, 175, 385], (90, 98, 110, 255))
    oval(draw, [60, 318, 160, 360], (130, 138, 150, 255))
    draw.rounded_rectangle([105, 355, 120, 455], radius=4, fill=(70, 78, 90, 255))


def ladle(draw):
    draw.rounded_rectangle([372, 275, 388, 400], radius=5, fill=(160, 174, 192, 255))
    oval(draw, [348, 392, 415, 450], (190, 205, 220, 255))
    oval(draw, [360, 405, 400, 435], SOFT + (220,))


def bowl(draw):
    oval(draw, [50, 340, 165, 415], (232, 160, 122, 255))
    oval(draw, [65, 335, 150, 380], (246, 223, 198, 255))
    draw.rounded_rectangle([98, 395, 116, 460], radius=4, fill=(196, 165, 116, 255))


def carrot(draw):
    oval(draw, [355, 315, 420, 435], (232, 106, 74, 255))
    draw.polygon([(387, 295), (368, 268), (387, 282), (406, 268)], fill=(58, 138, 95, 255))


def rice_bowl(draw):
    oval(draw, [50, 345, 160, 410], (245, 245, 244, 255))
    oval(draw, [65, 338, 145, 385], (255, 255, 255, 255))
    oval(draw, [78, 335, 132, 365], (246, 223, 198, 255))
    draw.line([128, 325, 168, 405], fill=INK, width=7)
    draw.line([140, 320, 180, 400], fill=INK, width=7)


def basket(draw):
    draw.polygon([(340, 355), (440, 355), (422, 435), (358, 435)], fill=(196, 165, 116, 255))
    draw.arc([352, 310, 428, 380], 200, 340, fill=(143, 122, 102, 255), width=9)
    disc(draw, (372, 385), 13, (58, 138, 95, 255))
    disc(draw, (395, 375), 12, (232, 106, 74, 255))
    disc(draw, (418, 388), 11, (107, 143, 191, 255))


def wok(draw):
    oval(draw, [35, 320, 175, 390], (70, 78, 90, 255))
    oval(draw, [50, 312, 160, 365], (100, 110, 125, 255))
    draw.rounded_rectangle([95, 355, 112, 465], radius=4, fill=(55, 65, 81, 255))
    disc(draw, (75, 335), 8, (232, 106, 74, 255))
    disc(draw, (125, 330), 7, (58, 138, 95, 255))


def whisk_bowl(draw):
    oval(draw, [345, 355, 450, 435], (230, 236, 230, 255))
    oval(draw, [358, 345, 435, 400], (255, 255, 255, 255))
    draw.rounded_rectangle([388, 285, 404, 370], radius=4, fill=(160, 174, 192, 255))
    draw.line([372, 295, 420, 295], fill=(100, 110, 125, 255), width=4)
    draw.line([370, 312, 422, 312], fill=(100, 110, 125, 255), width=4)


def rolling_pin(draw):
    draw.rounded_rectangle([48, 368, 185, 395], radius=12, fill=(196, 165, 116, 255))
    disc(draw, (52, 381), 15, (143, 122, 102, 255))
    disc(draw, (181, 381), 15, (143, 122, 102, 255))
    oval(draw, [95, 340, 145, 362], (246, 223, 198, 255))


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    specs = [
        ("01", "围裙小厨娘", (243, 213, 181), (44, 36, 32), (58, 138, 95), hair_back_bob, hair_front_bob, spatula, None, None),
        ("02", "白帽小厨男", (232, 196, 160), (61, 46, 40), (245, 245, 245), hair_back_short, hair_front_short, pan, chef_hat, None),
        ("03", "汤勺奶奶", (246, 223, 198), (190, 184, 176), (232, 160, 122), hair_back_bun, hair_front_bun, ladle, glasses, None),
        ("04", "品汤爷爷", (221, 184, 146), (150, 155, 165), (143, 122, 102), hair_back_short, hair_front_short, bowl, None, mustache),
        ("05", "小萝卜娃", (240, 201, 168), (44, 36, 32), (91, 168, 130), hair_back_kid, hair_front_kid, carrot, None, None),
        ("06", "米饭少女", (243, 213, 181), (44, 36, 32), (107, 143, 191), hair_back_long, hair_front_long, rice_bowl, None, None),
        ("07", "菜篮逛摊", (246, 223, 198), (120, 95, 70), (91, 168, 130), hair_back_bob, hair_front_bob, basket, None, None),
        ("08", "颠勺大厨", (232, 196, 160), (61, 46, 40), (143, 122, 102), hair_back_short, hair_front_short, wok, None, None),
        ("09", "搅拌小能手", (240, 201, 168), (90, 70, 56), (91, 168, 130), hair_back_short, hair_front_short, whisk_bowl, None, None),
        ("10", "擀皮能手", (243, 213, 181), (44, 36, 32), (201, 123, 132), hair_back_bun, hair_front_bun, rolling_pin, None, None),
    ]

    manifest = []
    for sid, label, skin, hair, apron, hb, hf, prop, acc, extra in specs:
        img = avatar(skin, hair, apron, hb, hf, prop, acc, extra)
        # slight soften for sticker feel
        soft = img.filter(ImageFilter.SMOOTH)
        fname = f"avatar-cook-{sid}.png"
        finish(soft, OUT / fname)
        manifest.append({"file": fname, "label": label, "path": f"/assets/avatars/{fname}"})
        print("wrote", fname, label)

    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("done ->", OUT)


if __name__ == "__main__":
    main()
