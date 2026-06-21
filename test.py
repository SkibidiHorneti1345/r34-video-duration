import urllib.request
import re
req = urllib.request.Request('https://rule34.xxx/index.php?page=post&s=list', headers={'User-Agent': 'Mozilla/5.0'})
html = urllib.request.urlopen(req).read().decode('utf-8')

match = re.search(r'(.{0,150})<img[^>]+src=[^>]+>(.{0,150})', html, re.IGNORECASE)
if match:
    print(match.group(0))
else:
    print("No image found")
