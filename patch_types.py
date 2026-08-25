import re
with open("assets/ts/types/global.d.ts", "r") as f:
    content = f.read()

replacement = """    daybookNavigateTo: (url: string) => void;
    daybookReplaceURL: (url: string) => void;
    daybookSearchEngine: any;
    daybookSyncPageKey: (url: string) => void;"""

content = content.replace("    daybookNavigateTo: (url: string) => void;\n    daybookSyncPageKey: (url: string) => void;", replacement)

with open("assets/ts/types/global.d.ts", "w") as f:
    f.write(content)
