package morphable

import (
	"strings"
	"testing"
)

func TestGenerateHTML(t *testing.T) {
	tests := []struct {
		name          string
		input         string
		transitionKey string
		classPrefix   string
		inlineStyles  bool
		checkContains []string
		checkNotHas   []string
	}{
		{
			name:          "Hello World with normal spaces",
			input:         "Hello World",
			transitionKey: "hello-world",
			classPrefix:   "title",
			inlineStyles:  false,
			checkContains: []string{
				`<span class="title-glyph" data-glyph-index="0">H</span>`,
				`o</span> <span`,
				`<span class="title-glyph" data-glyph-index="6">W</span>`, // index 5 is space
			},
			checkNotHas: []string{
				`<span class="title-glyph" data-glyph-index="5"> </span>`,
				`<span class="title-glyph" data-glyph-index="5">`, // just in case
			},
		},
		{
			name:          "CJK without spaces",
			input:         "鲸歌",
			transitionKey: "jingge",
			classPrefix:   "title",
			inlineStyles:  false,
			checkContains: []string{
				`<span class="title-glyph" data-glyph-index="0">鲸</span>`,
				`<span class="title-glyph" data-glyph-index="1">歌</span>`,
			},
		},
		{
			name:          "Emoji with spaces",
			input:         "Hello 👋 World",
			transitionKey: "hello-emoji",
			classPrefix:   "title",
			inlineStyles:  false,
			checkContains: []string{
				`o</span> <span`,
				`<span class="title-glyph" data-glyph-index="6">👋</span>`,
				`👋</span> <span`,
				`<span class="title-glyph" data-glyph-index="8">W</span>`,
			},
			checkNotHas: []string{
				`<span class="title-glyph" data-glyph-index="5"> </span>`,
				`<span class="title-glyph" data-glyph-index="7"> </span>`,
			},
		},
		{
			name:          "Inline styles true",
			input:         "A B",
			transitionKey: "a-b",
			classPrefix:   "title",
			inlineStyles:  true,
			checkContains: []string{
				`<span class="title-glyph" style="view-transition-name: title-glyph-0" data-glyph-index="0">A</span>`,
				`A</span> <span`,
				`<span class="title-glyph" style="view-transition-name: title-glyph-2" data-glyph-index="2">B</span>`,
			},
			checkNotHas: []string{
				`view-transition-name: title-glyph-1`,
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			var result string
			if tc.inlineStyles {
				result = string(GenerateHTML(tc.input, tc.transitionKey, tc.classPrefix, true))
			} else {
				result = string(GenerateHTML(tc.input, tc.transitionKey, tc.classPrefix))
			}

			for _, expected := range tc.checkContains {
				if !strings.Contains(result, expected) {
					t.Errorf("Expected result to contain:\n%s\n\nBut got:\n%s", expected, result)
				}
			}

			for _, notExpected := range tc.checkNotHas {
				if strings.Contains(result, notExpected) {
					t.Errorf("Did NOT expect result to contain:\n%s\n\nBut got:\n%s", notExpected, result)
				}
			}
		})
	}
}
