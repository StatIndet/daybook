import re

with open("path9.txt", "r") as f:
    new_path = f.read().strip()

with open("templates/partials/media-manager.html", "r") as f:
    content = f.read()

# Replace the path d="..."
content = re.sub(r'<path d="M 70\.00 0\.00 L.*?" />', f'<path d="{new_path}" />', content)

with open("templates/partials/media-manager.html", "w") as f:
    f.write(content)

print("Updated HTML to 9-sided.")
