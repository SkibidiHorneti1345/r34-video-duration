import os
import re
import urllib.request
import json

repo = "SkibidiHorneti1345/r34-video-duration"
url = f"https://api.github.com/repos/{repo}/languages"

req = urllib.request.Request(url)
# Use token if available
token = os.environ.get("GITHUB_TOKEN")
if token:
    req.add_header("Authorization", f"token {token}")
req.add_header("User-Agent", "Python-Urllib")

try:
    with urllib.request.urlopen(req) as response:
        langs = json.loads(response.read().decode())
except Exception as e:
    print(f"Error fetching languages: {e}")
    exit(1)

total = sum(langs.values())
if total == 0:
    exit(0)

# Colors matching GitHub languages
colors = {
    "JavaScript": "f1e05a",
    "CSS": "563d7c",
    "Python": "3572a5"
}

badges = [
    '  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-lightgrey?style=flat-square" alt="License: MIT"></a>'
]
for lang, bytes_count in langs.items():
    pct = (bytes_count / total) * 100
    color = colors.get(lang, "blue")
    logo = lang.lower()
    # Format badge
    badge_url = f"https://img.shields.io/badge/{lang}-{pct:.1f}%25-%23{color}?style=flat-square&logo={logo}&logoColor=white"
    if lang == "JavaScript":
        badge_url = f"https://img.shields.io/badge/{lang}-{pct:.1f}%25-%23{color}?style=flat-square&logo={logo}&logoColor=black"
    
    badges.append(f'  <img src="{badge_url}" alt="{lang}">')

badges_str = "\n".join(badges)

# Read README
with open("README.md", "r", encoding="utf-8") as f:
    readme = f.read()

# Replace block
pattern = r'<p align="center" class="lang-badges">[\s\S]*?</p>'
replacement = f'<p align="center" class="lang-badges">\n{badges_str}\n</p>'

new_readme = re.sub(pattern, replacement, readme)

with open("README.md", "w", encoding="utf-8") as f:
    f.write(new_readme)
