package markdown

import (
	"testing"
	"reflect"
)

func TestCollectMusicDirectives(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected []string
	}{
		{
			name: "Normal directive",
			input: `This is a test.
::music{url="https://example.com/live.flac"}`,
			expected: []string{"https://example.com/live.flac"},
		},
		{
			name: "Inline code protection",
			input: `Do not parse ` + "`::music{url=\"https://example.com/inline.flac\"}`",
			expected: nil,
		},
		{
			name: "Fenced code protection backticks",
			input: "```markdown\n::music{url=\"https://example.com/fenced.flac\"}\n```",
			expected: nil,
		},
		{
			name: "Fenced code protection tildes",
			input: "~~~\n::music{url=\"https://example.com/tilde.flac\"}\n~~~",
			expected: nil,
		},
		{
			name: "Four backticks",
			input: "````markdown\n::music{url=\"https://example.com/tilde.flac\"}\n````",
			expected: nil,
		},
		{
			name: "Multiple",
			input: "::music{url=\"a.flac\"}\n`::music{url=\"b.flac\"}`\n::music{url=\"c.flac\"}",
			expected: []string{"a.flac", "c.flac"},
		},
		{
			name: "Duplicate",
			input: "::music{url=\"a.flac\"}\n::music{url=\"a.flac\"}",
			expected: []string{"a.flac"},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			result := CollectMusicDirectives(tc.input)
			if len(result) == 0 && len(tc.expected) == 0 {
				return
			}
			if !reflect.DeepEqual(result, tc.expected) {
				t.Errorf("Expected %v, got %v", tc.expected, result)
			}
		})
	}
}
