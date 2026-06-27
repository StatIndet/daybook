package markdown

import (
	"strings"
	"testing"
)

func TestObsidianCommentsAndHighlights(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "Highlight text",
			input:    "This is ==highlighted== text.",
			expected: "<p>This is <mark>highlighted</mark> text.</p>\n",
		},
		{
			name:     "Highlight empty",
			input:    "==== empty",
			expected: "<p>==== empty</p>\n", // Unclosed or empty delimiter behavior
		},
		{
			name:     "Highlight inside inline code",
			input:    "Code `==highlight==` not parsed",
			expected: "<p>Code <code>==highlight==</code> not parsed</p>\n",
		},
		{
			name:     "Highlight multiple",
			input:    "First ==one== and ==two== here",
			expected: "<p>First <mark>one</mark> and <mark>two</mark> here</p>\n",
		},
		{
			name:     "Inline comment",
			input:    "This is %%hidden%% comment.",
			expected: "<p>This is  comment.</p>\n",
		},
		{
			name:     "Inline comment isolated",
			input:    "%% hidden %%",
			expected: "", // Paragraph removed
		},
		{
			name:     "Block comment",
			input:    "Before\n\n%%\nmultiline\ncomment\n%%\n\nAfter",
			expected: "<p>Before</p>\n<p>After</p>\n",
		},
		{
			name:     "Block comment single line",
			input:    "Before\n\n%% comment %%\n\nAfter",
			expected: "<p>Before</p>\n<p>After</p>\n",
		},
		{
			name:     "Unclosed inline comment",
			input:    "This is %% unclosed",
			expected: "<p>This is %% unclosed</p>\n",
		},
		{
			name:     "Comment inside inline code",
			input:    "Code `%%comment%%` not parsed",
			expected: "<p>Code <code>%%comment%%</code> not parsed</p>\n",
		},
		{
			name: "Comment inside code block",
			input: "```md\n%% comment %%\n==highlight==\n```",
			expected: "<pre><code class=\"language-md\">%% comment %%\n==highlight==\n</code></pre>\n",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			doc, err := ToHTML(tc.input)
			if err != nil {
				t.Fatalf("Unexpected error: %v", err)
			}
			
			// ToHTML generates wrappers for code blocks sometimes, or just plain tags depending on goldmark settings.
			// The tests check standard markdown output.
			
			// Wait, the renderer might output something slightly different based on newlines. Let's just compare ignoring leading/trailing spaces if needed, but strings.TrimSpace is safer.
			out := doc
			// The goldmark highlighting extension adds pre wrappers, which might differ from naive `<pre><code>`.
			// Since ToHTML uses the real markdown renderer, we just want to ensure `%% comment %%` is still there.
			if tc.name == "Comment inside code block" {
				if !strings.Contains(out, "%% comment %%") || !strings.Contains(out, "==highlight==") {
					t.Errorf("Code block test failed.\nGot: %s", out)
				}
				return
			}
			
			if strings.TrimSpace(out) != strings.TrimSpace(tc.expected) {
				t.Errorf("\nExpected:\n%q\nGot:\n%q", tc.expected, out)
			}
		})
	}
}
