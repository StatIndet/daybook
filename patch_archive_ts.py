import re

with open("assets/ts/archive.ts", "r") as f:
    content = f.read()

# Fix isArchivePage missing
content = content.replace('    // Protect against double execution if both trigger', """    function isArchivePage() {
        return Boolean(document.querySelector(".archive-page"));
    }

    // Protect against double execution if both trigger""")

# Fix TS undefined row
old_loop = """        for (let i = 0; i < requiredIds.length; i++) {
            const id = requiredIds[i];
            const row = dataRows.find(r => r.id === id);
            
            let el = mountedNodes.get(id);
            let isNew = false;
            
            if (!el) {
                el = createRowElement(row);
                mountedNodes.set(id, el);
                isNew = true;
                
                if (row.type === "note") {
                    if (seenRows.has(id)) {
                        el.classList.add("is-seen");
                    } else if (document.documentElement.dataset.reducedMotion === "true") {
                        seenRows.add(id);
                        el.classList.add("is-seen");
                    } else {
                        el.classList.add("is-pending-reveal");
                        if (revealObserver) revealObserver.observe(el);
                    }
                }
            }"""

new_loop = """        for (let i = 0; i < requiredIds.length; i++) {
            const id = requiredIds[i]!;
            const row = dataRows.find(r => r.id === id);
            if (!row) continue;
            
            let el = mountedNodes.get(id);
            let isNew = false;
            
            if (!el) {
                el = createRowElement(row);
                mountedNodes.set(id, el);
                isNew = true;
                
                if (row.type === "note") {
                    if (seenRows.has(id)) {
                        el.classList.add("is-seen");
                    } else if (document.documentElement.dataset.reducedMotion === "true") {
                        seenRows.add(id);
                        el.classList.add("is-seen");
                    } else {
                        el.classList.add("is-pending-reveal");
                        if (revealObserver) revealObserver.observe(el);
                    }
                }
            }"""
content = content.replace(old_loop, new_loop)

with open("assets/ts/archive.ts", "w") as f:
    f.write(content)
