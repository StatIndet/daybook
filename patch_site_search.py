import re

with open("internal/site/site.go", "r") as f:
    content = f.read()

# We want to find:
# 	searchJSONPath := filepath.Join(options.PublicDir, "search.json")
# 	if err := search.BuildIndex(groups, estimateReadingTime, searchJSONPath); err != nil {
# 		return BuildResult{}, fmt.Errorf("生成 search.json: %w", err)
# 	}
# 
# 	obsidianIndex, err := buildObsidianIndex(allNotes, options.ContentDir, options.PublicDir, "/")
# 	if err != nil {
# 		return BuildResult{}, err
# 	}
# 
# 	tagRegistry, err := content.NewTagRegistry(allNotes)
# 	if err != nil {
# 		return BuildResult{}, fmt.Errorf("构建标签字典: %w", err)
# 	}

old_block = """	searchJSONPath := filepath.Join(options.PublicDir, "search.json")
	if err := search.BuildIndex(groups, estimateReadingTime, searchJSONPath); err != nil {
		return BuildResult{}, fmt.Errorf("生成 search.json: %w", err)
	}

	obsidianIndex, err := buildObsidianIndex(allNotes, options.ContentDir, options.PublicDir, "/")
	if err != nil {
		return BuildResult{}, err
	}

	tagRegistry, err := content.NewTagRegistry(allNotes)
	if err != nil {
		return BuildResult{}, fmt.Errorf("构建标签字典: %w", err)
	}"""

new_block = """	obsidianIndex, err := buildObsidianIndex(allNotes, options.ContentDir, options.PublicDir, "/")
	if err != nil {
		return BuildResult{}, err
	}

	tagRegistry, err := content.NewTagRegistry(allNotes)
	if err != nil {
		return BuildResult{}, fmt.Errorf("构建标签字典: %w", err)
	}

	searchJSONPath := filepath.Join(options.PublicDir, "search.json")
	if err := search.BuildIndex(groups, estimateReadingTime, tagRegistry, searchJSONPath); err != nil {
		return BuildResult{}, fmt.Errorf("生成 search.json: %w", err)
	}"""

content = content.replace(old_block, new_block)

with open("internal/site/site.go", "w") as f:
    f.write(content)
