package markdown

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
)

type MathItem struct {
	ID          string `json:"id"`
	Tex         string `json:"tex"`
	DisplayMode bool   `json:"displayMode"`
}

type MathRenderResult struct {
	ID    string `json:"id"`
	OK    bool   `json:"ok"`
	HTML  string `json:"html"`
	Error string `json:"error"`
}

var projectRoot string

func init() {
	projectRoot = findProjectRoot()
}

func findProjectRoot() string {
	dir, err := os.Getwd()
	if err != nil {
		return "."
	}
	for {
		if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	return "."
}

func renderMathBlocks(items []MathItem) ([]MathRenderResult, error) {
	if len(items) == 0 {
		return nil, nil
	}

	nodePath, err := exec.LookPath("node")
	if err != nil {
		return nil, fmt.Errorf("找不到 node 命令，请安装 Node.js")
	}

	scriptPath := filepath.Join(projectRoot, "scripts", "render-katex.mjs")
	if _, err := os.Stat(scriptPath); os.IsNotExist(err) {
		return nil, fmt.Errorf("找不到脚本 %s", scriptPath)
	}

	inputData, err := json.Marshal(items)
	if err != nil {
		return nil, fmt.Errorf("序列化公式数据失败: %w", err)
	}

	cmd := exec.Command(nodePath, scriptPath)
	cmd.Dir = projectRoot

	cmd.Stdin = bytes.NewReader(inputData)
	var outBuf, errBuf bytes.Buffer
	cmd.Stdout = &outBuf
	cmd.Stderr = &errBuf

	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("执行 render-katex 脚本失败: %w\nStderr: %s", err, errBuf.String())
	}

	if errBuf.Len() > 0 {
		// print warnings from node stderr
		fmt.Fprintf(os.Stderr, "KaTeX Warning/Error: %s\n", errBuf.String())
	}

	outputData := outBuf.Bytes()
	if len(outputData) == 0 {
		return nil, fmt.Errorf("render-katex 脚本没有输出")
	}

	var results []MathRenderResult
	if err := json.Unmarshal(outputData, &results); err != nil {
		return nil, fmt.Errorf("解析 KaTeX 输出结果失败: %w (output: %q)", err, string(outputData))
	}

	return results, nil
}
