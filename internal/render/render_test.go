package render

import (
	"math"
	"strconv"
	"os"
	"strings"
	"testing"
)

func TestNewGoldenSpiralUsesOversizedOuterRect(t *testing.T) {
	spiral := NewGoldenSpiral()
	_, _, width, height := parseRect(t, spiral.OuterRect)

	phi := (1 + math.Sqrt(5)) / 2
	wantWidth := 1080 * phi * phi * phi
	wantHeight := 1080 * phi * phi
	if math.Abs(width-wantWidth) > 0.02 {
		t.Fatalf("outer rect width = %.2f, want %.2f", width, wantWidth)
	}
	if math.Abs(height-wantHeight) > 0.02 {
		t.Fatalf("outer rect height = %.2f, want %.2f", height, wantHeight)
	}
	if width <= 1600 || height <= 900 {
		t.Fatalf("outer rect should exceed viewBox, got %.2fx%.2f", width, height)
	}
	if strings.TrimSpace(spiral.SpiralPath) == "" {
		t.Fatal("spiral path should not be empty")
	}
	if spiral.SpinCenterX == "" || spiral.SpinCenterY == "" {
		t.Fatal("spin center should be set")
	}
}

func parseRect(t *testing.T, rect string) (float64, float64, float64, float64) {
	t.Helper()

	fields := strings.Fields(rect)
	if len(fields) != 4 {
		t.Fatalf("rect %q should contain 4 numbers", rect)
	}

	values := make([]float64, 4)
	for i, field := range fields {
		value, err := strconv.ParseFloat(field, 64)
		if err != nil {
			t.Fatalf("parse rect value %q: %v", field, err)
		}
		values[i] = value
	}

	return values[0], values[1], values[2], values[3]
}

func TestGoldenSpiralGeometryRegression(t *testing.T) {
	spiral := NewGoldenSpiral()

	// 1. Verify finite numbers
	checkFinite := func(name, val string) float64 {
		v, err := strconv.ParseFloat(val, 64)
		if err != nil {
			t.Fatalf("Failed to parse %s: %v", name, err)
		}
		if math.IsNaN(v) || math.IsInf(v, 0) {
			t.Fatalf("%s is not finite: %v", name, v)
		}
		return v
	}

	startX := checkFinite("SpiralVisualStart X", strings.Fields(spiral.SpiralVisualStart)[0])
	startY := checkFinite("SpiralVisualStart Y", strings.Fields(spiral.SpiralVisualStart)[1])
	endX := checkFinite("SpiralVisualEnd X", strings.Fields(spiral.SpiralVisualEnd)[0])
	endY := checkFinite("SpiralVisualEnd Y", strings.Fields(spiral.SpiralVisualEnd)[1])
	poleX := checkFinite("Pole X", spiral.PoleX)
	poleY := checkFinite("Pole Y", spiral.PoleY)

	// 2. Radius should decrease as it spirals inward (t > 0, exp(-bt))
	// The visual start corresponds to innerT, visual end corresponds to outerT (t=0 or negative)
	startDist := math.Hypot(startX-poleX, startY-poleY)
	endDist := math.Hypot(endX-poleX, endY-poleY)

	if startDist >= endDist {
		t.Fatalf("Regression: Spiral is expanding inward! start radius=%.2f, end radius=%.2f. Expected start < end", startDist, endDist)
	}

	// 3. Verify start/end coordinates are roughly correct to prevent sign flip
	// With the known configuration, pole is roughly at 1100, 540.
	// Outer Anchor is around 560, 540. The anchor distances should not explode.
	if endDist > 10000 || endDist < 100 {
		t.Fatalf("Regression: Spiral scale is completely broken. End distance to pole: %.2f", endDist)
	}

	// 4. Bézier path must contain 'C'
	if !strings.Contains(spiral.SpiralPath, "C") {
		t.Fatalf("Regression: Spiral path does not use Cubic Bézier segments. Path: %v", spiral.SpiralPath[:100])
	}
}

func TestGoldenSpiralCSSRegression(t *testing.T) {
	// 简单读取 about.css
	content, err := os.ReadFile("../../internal/embedded/static/css/pages/about.css")
	if err != nil {
		t.Fatalf("无法读取 about.css: %v", err)
	}
	css := string(content)

	// 1. 确保 .golden-curve 参与了公共样式（fill: none; 等）
	if !strings.Contains(css, ".golden-rect,\n.golden-diagonal,\n.golden-curve {") {
		t.Fatalf("回归: .golden-curve 没有包含在 .golden-rect, .golden-diagonal 的公共样式块中，会导致巨大黑块")
	}

	// 2. 检查 fill: none 和 animation 属性是否在公共块中
	sharedBlockIndex := strings.Index(css, ".golden-rect,\n.golden-diagonal,\n.golden-curve {")
	if sharedBlockIndex == -1 {
		t.Fatal()
	}
	sharedBlockEnd := strings.Index(css[sharedBlockIndex:], "}")
	if sharedBlockEnd == -1 {
		t.Fatal()
	}
	sharedBlock := css[sharedBlockIndex : sharedBlockIndex+sharedBlockEnd]

	if !strings.Contains(sharedBlock, "fill: none;") {
		t.Errorf("回归: 公共块丢失了 fill: none;")
	}
	if !strings.Contains(sharedBlock, "animation-duration:") {
		t.Errorf("回归: 公共块丢失了 animation-duration:")
	}
	if !strings.Contains(sharedBlock, "animation-iteration-count: infinite;") {
		t.Errorf("回归: 公共块丢失了 animation-iteration-count: infinite;")
	}
}
