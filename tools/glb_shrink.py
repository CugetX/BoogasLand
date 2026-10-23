"""Shrink textures inside a GLB (resizes + re-encodes images). Usage: python glb_shrink.py in.glb out.glb [maxsize]"""
import sys, json, struct, io
from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
MAX = int(sys.argv[3]) if len(sys.argv) > 3 else 1024
data = open(src, 'rb').read()
magic, ver, total = struct.unpack_from('<III', data, 0)
off = 12
chunks = []
while off < len(data):
    ln, typ = struct.unpack_from('<II', data, off)
    chunks.append((typ, data[off + 8: off + 8 + ln]))
    off += 8 + ln
gj = json.loads(chunks[0][1].decode('utf8'))
binc = chunks[1][1]

views = [bytearray(binc[v.get('byteOffset', 0): v.get('byteOffset', 0) + v['byteLength']]) for v in gj['bufferViews']]

for img in gj.get('images', []):
    if 'bufferView' not in img:
        continue
    bv = img['bufferView']
    im = Image.open(io.BytesIO(bytes(views[bv])))
    im.load()
    name = img.get('name', '')
    limit = MAX // 2 if 'normal' in name.lower() or 'rough' in name.lower() or 'metal' in name.lower() else MAX
    w, h = im.size
    s = min(1.0, limit / max(w, h))
    if s < 1.0:
        im = im.resize((max(1, int(w * s)), max(1, int(h * s))), Image.LANCZOS)
    has_alpha = im.mode in ('RGBA', 'LA', 'P') and im.convert('RGBA').getextrema()[3][0] < 250
    out = io.BytesIO()
    if has_alpha:
        im.convert('RGBA').save(out, 'PNG', optimize=True)
        img['mimeType'] = 'image/png'
    else:
        im.convert('RGB').save(out, 'JPEG', quality=85)
        img['mimeType'] = 'image/jpeg'
    print(f"{name}: {w}x{h} -> {im.size} {len(views[bv])} -> {out.tell()} alpha={has_alpha}")
    views[bv] = bytearray(out.getvalue())

newbin = bytearray()
for i, v in enumerate(gj['bufferViews']):
    while len(newbin) % 4:
        newbin.append(0)
    v['byteOffset'] = len(newbin)
    v['byteLength'] = len(views[i])
    newbin += views[i]
while len(newbin) % 4:
    newbin.append(0)
gj['buffers'] = [{'byteLength': len(newbin)}]
js = json.dumps(gj, separators=(',', ':')).encode('utf8')
while len(js) % 4:
    js += b' '
outb = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(newbin))
outb += struct.pack('<II', len(js), 0x4E4F534A) + js
outb += struct.pack('<II', len(newbin), 0x004E4942) + bytes(newbin)
open(dst, 'wb').write(outb)
print('wrote', dst, len(outb))
