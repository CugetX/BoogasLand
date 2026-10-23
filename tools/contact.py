"""Contact sheet of poly.pizza previews. Usage: python contact.py list.txt out.png "regex" """
import sys, re, io, urllib.request, concurrent.futures as cf
from PIL import Image, ImageDraw, ImageFont

lst, out, pat = sys.argv[1], sys.argv[2], sys.argv[3]
rows = []
for line in open(lst, encoding='utf-8-sig'):
    p = [s.strip() for s in line.split('|')]
    if len(p) >= 3 and re.search(pat, p[0], re.I):
        rows.append(p)
rows = rows[:120]

def get(r):
    for ext in ('webp', 'jpg', 'png'):
        try:
            d = urllib.request.urlopen(urllib.request.Request(f'https://static.poly.pizza/{r[2]}.{ext}', headers={'User-Agent': 'Mozilla/5.0'}), timeout=20).read()
            im = Image.open(io.BytesIO(d)).convert('RGB'); im.thumbnail((160, 160)); return im
        except Exception:
            pass
    return Image.new('RGB', (160, 160), (60, 0, 0))

with cf.ThreadPoolExecutor(16) as ex:
    imgs = list(ex.map(get, rows))
cols = 10
S = 160
sheet = Image.new('RGB', (cols * S, ((len(rows) + cols - 1) // cols) * (S + 28)), (30, 30, 30))
d = ImageDraw.Draw(sheet)
for i, (r, im) in enumerate(zip(rows, imgs)):
    x, y = (i % cols) * S, (i // cols) * (S + 28)
    sheet.paste(im, (x, y))
    d.text((x + 3, y + S + 2), f'{i}:{r[0][:22]}', fill=(255, 255, 255))
    d.text((x + 3, y + S + 14), r[1], fill=(180, 180, 180))
sheet.save(out)
print(len(rows), 'saved', out)
