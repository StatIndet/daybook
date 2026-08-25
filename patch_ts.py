import re
with open("assets/ts/archive.ts", "r") as f:
    content = f.read()

content = content.replace(
    "sum += estimateHeight(rows[i]);",
    "sum += estimateHeight(rows[i]!);"
)
content = content.replace(
    "toKeep.add(dataset.rows[i].id);",
    "toKeep.add(dataset.rows[i]!.id);"
)
content = content.replace(
    "requiredIds.push(dataset.rows[i].id);",
    "requiredIds.push(dataset.rows[i]!.id);"
)
content = content.replace(
    "const row = dataset.rows[idx];\n                const offset = localTop - prefixSums[idx]!;\n                \n                const currentState = history.state || {};\n                const newArchiveState = { anchorId: row.id, anchorOffset: offset };\n                \n                if (!currentState.daybookArchive || currentState.daybookArchive.anchorId !== row.id || Math.abs(currentState.daybookArchive.anchorOffset - offset) > 10) {",
    "const row = dataset.rows[idx]!;\n                const offset = localTop - prefixSums[idx]!;\n                \n                const currentState = history.state || {};\n                const newArchiveState = { anchorId: row.id, anchorOffset: offset };\n                \n                if (!currentState.daybookArchive || currentState.daybookArchive.anchorId !== row.id || Math.abs(currentState.daybookArchive.anchorOffset - offset) > 10) {"
)

with open("assets/ts/archive.ts", "w") as f:
    f.write(content)
