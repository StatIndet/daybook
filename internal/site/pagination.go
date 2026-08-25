package site

import (
	"fmt"
	"math"
	"github.com/StatIndet/daybook/internal/render"
)

const PageSize = 10

func generatePaginationData(totalItems int, currentPage int, basePath string) render.PaginationData {
	totalPages := int(math.Ceil(float64(totalItems) / float64(PageSize)))
	if totalPages == 0 {
		totalPages = 1
	}

	data := render.PaginationData{
		CurrentPage: currentPage,
		TotalPages:  totalPages,
	}

	getPageURL := func(page int) string {
		if page == 1 {
			return joinURL("/", basePath)
		}
		return joinURL("/", basePath, "page", fmt.Sprintf("%d", page))
	}

	if currentPage > 1 {
		data.PrevURL = getPageURL(currentPage - 1)
	}
	if currentPage < totalPages {
		data.NextURL = getPageURL(currentPage + 1)
	}

	// Logic for compact page numbers
	// ← 1 … 4 5 6 … 18 →
	const window = 1

	for i := 1; i <= totalPages; i++ {
		if i == 1 || i == totalPages || (i >= currentPage-window && i <= currentPage+window) {
			data.Items = append(data.Items, render.PaginationItem{
				PageNumber: i,
				URL:        getPageURL(i),
				IsCurrent:  i == currentPage,
			})
		} else if i == currentPage-window-1 || i == currentPage+window+1 {
			data.Items = append(data.Items, render.PaginationItem{
				IsEllipsis: true,
			})
		}
	}

	return data
}
