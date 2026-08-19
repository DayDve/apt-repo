import sys, os, glob
import struct
import zlib

def get_image_size(path):
    """Get image dimensions from local file."""
    with open(path, 'rb') as f:
        header = f.read(32)
    # PNG
    if header[:8] == b'\x89PNG\r\n\x1a\n':
        w, h = struct.unpack('>II', header[16:24])
        return w, h
    # JPEG
    if header[:2] == b'\xff\xd8':
        with open(path, 'rb') as f:
            data = f.read()
        i = 2
        while i < len(data) - 1:
            if data[i] != 0xFF:
                i += 1
                continue
            marker = data[i+1]
            if marker in (0xC0, 0xC1, 0xC2):
                h = struct.unpack('>H', data[i+5:i+7])[0]
                w = struct.unpack('>H', data[i+7:i+9])[0]
                return w, h
            length = struct.unpack('>H', data[i+2:i+4])[0]
            i += 2 + length
    # WebP
    if header[:4] == b'RIFF' and header[8:12] == b'WEBP':
        with open(path, 'rb') as f:
            data = f.read()
        if data[12:16] == b'VP8 ':
            w = struct.unpack('<H', data[26:28])[0] & 0x3FFF
            h = struct.unpack('<H', data[28:30])[0] & 0x3FFF
            return w, h
    return None, None

yml_path = sys.argv[1]
ss_dir = sys.argv[2]
repo = sys.argv[3]

with open(yml_path) as f:
    lines = f.readlines()

for app_dir in glob.glob(os.path.join(ss_dir, '*')):
    if not os.path.isdir(app_dir):
        continue
    pkg = os.path.basename(app_dir)
    for ss_file in sorted(glob.glob(os.path.join(app_dir, '*'))):
        ss_name = os.path.basename(ss_file)
        ss_url = f"https://raw.githubusercontent.com/{repo}/apt/screenshots/{pkg}/{ss_name}"
        w, h = get_image_size(ss_file)
        for i, line in enumerate(lines):
            if f'url: {ss_url}' in line and i >= 2 and 'source-image:' in lines[i-1] and 'thumbnails: []' in lines[i-2]:
                thumb_entry = f"thumbnails:\n      - url: {ss_url}"
                if w and h:
                    thumb_entry += f"\n        width: {w}\n        height: {h}"
                thumb_entry += "\n"
                lines[i-2] = lines[i-2].replace('thumbnails: []', thumb_entry)

with open(yml_path, 'w') as f:
    f.writelines(lines)
