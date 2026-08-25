import re

with open("internal/site/site.go", "r") as f:
    content = f.read()

content = content.replace('` + "`" + `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="robots" content="noindex"><link rel="canonical" href="%s"><meta http-equiv="refresh" content="0; url=%s"></head><body></body></html>` + "`" + `', 
'`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="robots" content="noindex"><link rel="canonical" href="%s"><meta http-equiv="refresh" content="0; url=%s"></head><body></body></html>`')

with open("internal/site/site.go", "w") as f:
    f.write(content)
