import sys, os, glob

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
        for i, line in enumerate(lines):
            if f'url: {ss_url}' in line and i >= 2 and 'source-image:' in lines[i-1] and 'thumbnails: []' in lines[i-2]:
                lines[i-2] = lines[i-2].replace('thumbnails: []', f'thumbnails:\n    - {ss_url}\n')

with open(yml_path, 'w') as f:
    f.writelines(lines)
