package titlelayout

import (
	"testing"
)

func TestTokenizer(t *testing.T) {
	tests := []struct {
		title    string
		expected []string
	}{
		{
			title:    "短标题",
			expected: []string{"短标题"},
		},
		{
			title:    "长标题自适应折行的几何过渡bug修复",
			expected: []string{"长标题自适应", "折行", "的", "几何过渡", "bug", "修复"},
		},
		{
			title:    "在n150小主机上安装Debian并配置为SSH Server",
			expected: []string{"在", "n", "150", "小主机上安装", "Debian", "并", "配置", "为", "SSH ", "Server"},
		},
		{
			title:    "page-transition-engine.js",
			expected: []string{"page-transition-engine.js"},
		},
		{
			title:    "CSS 3",
			expected: []string{"CSS ", "3"},
		},
		{
			title:    "ViewTransitionBasedTokenLevelMorphingEngine",
			expected: []string{"View", "Transition", "Based", "Token", "Level", "Morphing", "Engine"},
		},
		{
			title:    "clavis-shell编译安装方法（临时版）",
			expected: []string{"clavis-shell", "编译安装方法", "（临时版）"},
		},
		{
			title:    "测试(English)边界",
			expected: []string{"测试", "(English)", "边界"},
		},
		{
			title:    "Markdown 渲染 测试 ",
			expected: []string{"Markdown ", "渲染 ", "测试 "},
		},
	}

	for _, tc := range tests {
		tokens := Tokenize(tc.title)
		var actual []string
		for _, tok := range tokens {
			actual = append(actual, tok.Text)
		}
		if len(actual) != len(tc.expected) {
			t.Errorf("expected %v, got %v", tc.expected, actual)
			continue
		}
		for i := range actual {
			if actual[i] != tc.expected[i] {
				t.Errorf("expected %v, got %v", tc.expected, actual)
				break
			}
		}
	}
}

