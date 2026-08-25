with open("internal/site/site.go", "r") as f:
    content = f.read()

content = content.replace('"io/fs"', '"io/fs"\n\t"math"')

with open("internal/site/site.go", "w") as f:
    f.write(content)

with open("internal/site/pagination.go", "r") as f:
    content = f.read()
    
content = content.replace('"path"\n\t"strings"\n\n\t"github.com/StatIndet/daybook/internal/render"', '"github.com/StatIndet/daybook/internal/render"')

with open("internal/site/pagination.go", "w") as f:
    f.write(content)
