import re

with open("assets/ts/media-manager.ts", "r") as f:
    content = f.read()

# Remove dispatchStateChange function
content = re.sub(r'  private dispatchStateChange\(\) \{.*?(?=  private initDOM\(\) \{)', '', content, flags=re.DOTALL)

# Remove getProgress
content = re.sub(r'  public getProgress\(songId: string\): \{.*?(?=  \n\})', '', content, flags=re.DOTALL)

with open("assets/ts/media-manager.ts", "w") as f:
    f.write(content)

