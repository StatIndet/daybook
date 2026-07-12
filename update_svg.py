import re

with open("path.txt", "r") as f:
    new_path = f.read().strip()

with open("templates/partials/media-manager.html", "r") as f:
    content = f.read()

# Replace clipPathUnits="objectBoundingBox" with clipPathUnits="userSpaceOnUse"
content = re.sub(r'clipPathUnits="objectBoundingBox"', 'clipPathUnits="userSpaceOnUse"', content)

# Replace the path d="..."
content = re.sub(r'<path d="M 0\.50000 0\.00000 L.*?" />', f'<path d="{new_path}" />', content)

with open("templates/partials/media-manager.html", "w") as f:
    f.write(content)

print("Updated HTML.")
