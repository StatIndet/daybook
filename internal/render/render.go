package render

import (
	"fmt"
	"html/template"
	"math"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

type Renderer struct {
	TemplatesDir string
}

type SiteData struct {
	Title string
}

type Assets struct {
	Paths map[string]string
}

func (a Assets) Path(originalPath string) string {
	if path, ok := a.Paths[originalPath]; ok {
		return path
	}
	return originalPath
}

type Heading struct {
	Level int
	Text  string
	ID    string
}

type NoteLink struct {
	Title               string
	Date                string
	ReadingTime         string
	Summary             string
	Tags                []string
	URL                 string
	Slug                string
	TitleTransitionName string
	DateTransitionName  string
}

type NotePage struct {
	Title               string
	Date                string
	ReadingTime         string
	Summary             string
	URL                 string
	Slug                string
	HTML                template.HTML
	Headings            []Heading
	HasMermaid          bool
	HasMath             bool
	TitleTransitionName string
	DateTransitionName  string
}

type GoldenPath struct {
	D              string
	Order          int
	Distance       string
	GrowDelay      string
	ShrinkDelay    string
	GrowStartPct   string
	GrowFadePct    string
	GrowEndPct     string
	ShrinkStartPct string
	ShrinkEndPct   string
	HidePct        string
}

type goldenGuideDraft struct {
	d        string
	distance float64
}

type goldenRect struct {
	x float64
	y float64
	w float64
	h float64
}

type goldenSquare struct {
	x float64
	y float64
	s float64
}

type GoldenLayer struct {
	Index int
}

type GoldenSpiral struct {
	// PoleX/PoleY are the mathematical limit point used to calculate the
	// logarithmic spiral. They are not the visual spin center.
	PoleX string
	PoleY string
	// SpinCenterX/SpinCenterY are the visual rotation center. They must match
	// the first visible point of the spiral path, stored in SpiralVisualStart.
	SpinCenterX             string
	SpinCenterY             string
	SpinDuration            string
	OuterRect               string
	OuterRectLeftTop        string
	OuterRectRightBottom    string
	SpiralOuterCorner       string
	SpiralVisualStart       string
	SpiralVisualEnd         string
	SpiralOuterQuarterTurns string
	SpiralInnerQuarterTurns string
	LoopDuration            string
	CurveStartPct           string
	CurveFadePct            string
	CurveGrowEndPct         string
	CurveShrinkStartPct     string
	CurveShrinkEndPct       string
	CurveHidePct            string
	Squares                 []GoldenPath
	Diagonals               []GoldenPath
	SpiralPath              string
	Layers                  []GoldenLayer
}

type IndexData struct {
	Site      SiteData
	PageTitle string
	BodyClass string
	Assets    Assets
	Notes     []NoteLink
}

type TagLink struct {
	Name         string
	URL          string
	Index        int
	ReverseIndex int
}

type NotesData struct {
	Site        SiteData
	PageTitle   string
	BodyClass   string
	Assets      Assets
	Notes       []NoteLink
	MonthGroups []MonthGroup
	Tags        []TagLink
}

type MonthGroup struct {
	Key   string
	Label string
	Notes []NoteLink
}

type ArchiveNote struct {
	Index       int
	Title       string
	Date        string
	DateShort   string
	ReadingTime string
	Summary     string
	URL         string
}

type ArchiveYearGroup struct {
	Year  string
	Notes []ArchiveNote
}

type ArchiveData struct {
	Site       SiteData
	PageTitle  string
	BodyClass  string
	Assets     Assets
	Total      int
	YearGroups []ArchiveYearGroup
	Tags       []TagLink
}

type NoteData struct {
	Site      SiteData
	PageTitle string
	BodyClass string
	Assets    Assets
	Note      NotePage
	Tags      []TagLink
}

type AboutData struct {
	Site      SiteData
	PageTitle string
	BodyClass string
	Assets    Assets
	Spiral    GoldenSpiral
	Title     string
	Summary   string
	HTML      template.HTML
}

func New(templatesDir string) Renderer {
	return Renderer{TemplatesDir: templatesDir}
}

func (r Renderer) RenderIndex(outputPath string, data IndexData) error {
	return r.render(outputPath, "index.html", data)
}

func (r Renderer) RenderNotes(outputPath string, data NotesData) error {
	return r.render(outputPath, "notes.html", data)
}

func (r Renderer) RenderArchive(outputPath string, data ArchiveData) error {
	return r.render(outputPath, "archive.html", data)
}

func (r Renderer) RenderNote(outputPath string, data NoteData) error {
	return r.render(outputPath, "note.html", data)
}

func (r Renderer) RenderAbout(outputPath string, data AboutData) error {
	return r.render(outputPath, "about.html", data)
}

func NewGoldenSpiral() GoldenSpiral {
	phi := (1 + math.Sqrt(5)) / 2
	const hiddenDuration = 0.61803398875
	const maxSquares = 15

	baseOuterRect := goldenRect{
		x: 560,
		y: 140,
		w: 1080,
		h: 1080 / phi,
	}
	baseSquares, basePole := subdivideGoldenRect(baseOuterRect, maxSquares)
	if len(baseSquares) == 0 {
		return GoldenSpiral{}
	}

	baseOuterAnchor := point{x: baseOuterRect.x, y: baseOuterRect.y + baseOuterRect.h}
	_, visualAnchor, _ := buildSpiralPath(basePole, baseOuterAnchor, float64(len(baseSquares)), 0, math.Pi/180)

	outerRect := scaleRectAround(baseOuterRect, visualAnchor, phi*phi*phi)
	squares, pole := subdivideGoldenRect(outerRect, maxSquares)

	if len(squares) == 0 {
		return GoldenSpiral{}
	}

	s0 := squares[0].s

	diagonalDrafts := []goldenGuideDraft{
		diagonalFromPole(
			point{x: outerRect.x, y: outerRect.y},
			point{x: outerRect.x + outerRect.w, y: outerRect.y + outerRect.h},
			pole,
		),
		diagonalFromPole(
			point{x: outerRect.x + outerRect.w, y: outerRect.y},
			point{x: outerRect.x + s0, y: outerRect.y + outerRect.h},
			pole,
		),
	}
	squareDrafts := make([]goldenGuideDraft, 0, len(squares))
	for _, square := range squares {
		d, distance := squareFromPole(square.x, square.y, square.s, pole)
		squareDrafts = append(squareDrafts, goldenGuideDraft{d: d, distance: distance})
	}

	allGuides := append([]goldenGuideDraft{}, diagonalDrafts...)
	allGuides = append(allGuides, squareDrafts...)
	minDistance, maxDistance := guideDistanceRange(allGuides)

	curveGrowStart := phi
	guideGrowEnd := 5 * phi
	// 螺旋路径延长后，生长时长 = 辅助线生长时长 × φ = 5φ²
	curveGrowDuration := 5 * phi * phi
	curveGrowEnd := curveGrowStart + curveGrowDuration
	curveShrinkStart := curveGrowEnd + phi

	// 收缩顺序：螺旋曲线先收缩到起点，随后辅助线条收缩并消失。
	// 收缩时长 = 对应生长时长 ÷ φ（收缩比生长快 φ 倍）。
	//   曲线收缩 = 5φ² ÷ φ = 5φ
	//   辅助线收缩 = 5φ ÷ φ = 5
	curveShrinkDuration := curveGrowDuration / phi
	curveShrinkEnd := curveShrinkStart + curveShrinkDuration
	curveHideAt := curveShrinkEnd + 0.12

	guideShrinkStart := curveShrinkEnd
	guideShrinkEnd := guideShrinkStart + guideGrowEnd/phi
	guideHideAt := guideShrinkEnd + 0.12

	loopDuration := guideHideAt + hiddenDuration

	diagonals := make([]GoldenPath, 0, len(diagonalDrafts))
	for i, draft := range diagonalDrafts {
		diagonals = append(diagonals, goldenPathFromDraft(i, draft, minDistance, maxDistance, phi, guideGrowEnd, guideShrinkStart, guideShrinkEnd, guideHideAt, loopDuration))
	}

	squarePaths := make([]GoldenPath, 0, len(squareDrafts))
	for i, draft := range squareDrafts {
		squarePaths = append(squarePaths, goldenPathFromDraft(i+len(diagonalDrafts), draft, minDistance, maxDistance, phi, guideGrowEnd, guideShrinkStart, guideShrinkEnd, guideHideAt, loopDuration))
	}

	spiralOuterAnchor := point{x: outerRect.x, y: outerRect.y + outerRect.h}
	spiralInnerQuarterTurns := float64(len(squares))
	outerQuarterTurns := 0.0
	spiralPath, spiralStart, spiralEnd := buildSpiralPath(pole, spiralOuterAnchor, spiralInnerQuarterTurns, outerQuarterTurns, math.Pi/180)

	layers := []GoldenLayer{
		{Index: 0},
	}

	return GoldenSpiral{
		PoleX:                   fmt.Sprintf("%.2f", pole.x),
		PoleY:                   fmt.Sprintf("%.2f", pole.y),
		SpinCenterX:             fmt.Sprintf("%.2f", spiralStart.x),
		SpinCenterY:             fmt.Sprintf("%.2f", spiralStart.y),
		SpinDuration:            "52.416s",
		OuterRect:               fmt.Sprintf("%.2f %.2f %.2f %.2f", outerRect.x, outerRect.y, outerRect.w, outerRect.h),
		OuterRectLeftTop:        fmt.Sprintf("%.2f %.2f", outerRect.x, outerRect.y),
		OuterRectRightBottom:    fmt.Sprintf("%.2f %.2f", outerRect.x+outerRect.w, outerRect.y+outerRect.h),
		SpiralOuterCorner:       "outerRect left-bottom",
		SpiralVisualStart:       fmt.Sprintf("%.2f %.2f", spiralStart.x, spiralStart.y),
		SpiralVisualEnd:         fmt.Sprintf("%.2f %.2f", spiralEnd.x, spiralEnd.y),
		SpiralOuterQuarterTurns: fmt.Sprintf("%.0f", outerQuarterTurns),
		SpiralInnerQuarterTurns: fmt.Sprintf("%.0f", spiralInnerQuarterTurns),
		LoopDuration:            fmt.Sprintf("%.3fs", loopDuration),
		CurveStartPct:           pct(curveGrowStart, loopDuration),
		CurveFadePct:            pct(curveGrowStart+0.12, loopDuration),
		CurveGrowEndPct:         pct(curveGrowEnd, loopDuration),
		CurveShrinkStartPct:     pct(curveShrinkStart, loopDuration),
		CurveShrinkEndPct:       pct(curveShrinkEnd, loopDuration),
		CurveHidePct:            pct(curveHideAt, loopDuration),
		Squares:                 squarePaths,
		Diagonals:               diagonals,
		SpiralPath:              spiralPath,
		Layers:                  layers,
	}
}

type point struct {
	x float64
	y float64
}

func scaleRectAround(rect goldenRect, anchor point, scale float64) goldenRect {
	return goldenRect{
		x: anchor.x + (rect.x-anchor.x)*scale,
		y: anchor.y + (rect.y-anchor.y)*scale,
		w: rect.w * scale,
		h: rect.h * scale,
	}
}

func subdivideGoldenRect(rect goldenRect, maxSquares int) ([]goldenSquare, point) {
	cx := rect.x
	cy := rect.y
	cw := rect.w
	ch := rect.h

	squares := make([]goldenSquare, 0, maxSquares)
	dir := 0
	for i := 0; i < maxSquares*4; i++ {
		s := math.Min(cw, ch)
		if s <= 0.01 {
			break
		}

		switch dir {
		case 0:
			if len(squares) < maxSquares {
				squares = append(squares, goldenSquare{x: cx, y: cy, s: s})
			}
			cx += s
			cw -= s
		case 1:
			if len(squares) < maxSquares {
				squares = append(squares, goldenSquare{x: cx, y: cy, s: s})
			}
			cy += s
			ch -= s
		case 2:
			if len(squares) < maxSquares {
				squares = append(squares, goldenSquare{x: cx + cw - s, y: cy, s: s})
			}
			cw -= s
		default:
			if len(squares) < maxSquares {
				squares = append(squares, goldenSquare{x: cx, y: cy + ch - s, s: s})
			}
			ch -= s
		}

		dir = (dir + 1) % 4
	}

	return squares, point{x: cx + cw/2, y: cy + ch/2}
}

func buildSpiralPath(pole, outerAnchor point, innerQuarterTurns, outerQuarterTurns, step float64) (string, point, point) {
	const quarter = math.Pi / 2

	b := math.Log((1+math.Sqrt(5))/2) / quarter
	r0 := distance(outerAnchor, pole)
	theta0 := math.Atan2(outerAnchor.y-pole.y, outerAnchor.x-pole.x)
	outerT := -outerQuarterTurns * quarter
	innerT := innerQuarterTurns * quarter

	points := make([]point, 0, int((innerT-outerT)/step)+2)
	for t := innerT; t > outerT; t -= step {
		points = append(points, spiralPoint(pole, r0, theta0, b, t))
	}
	points = append(points, spiralPoint(pole, r0, theta0, b, outerT))

	parts := make([]string, 0, len(points))
	for _, point := range points {
		parts = append(parts, fmt.Sprintf("%.2f %.2f", point.x, point.y))
	}

	return "M " + strings.Join(parts, " L "), points[0], points[len(points)-1]
}

func spiralPoint(pole point, r0, theta0, b, t float64) point {
	r := r0 * math.Exp(-b*t)
	a := theta0 + t
	return point{
		x: pole.x + r*math.Cos(a),
		y: pole.y + r*math.Sin(a),
	}
}

func squareFromPole(x, y, size float64, pole point) (string, float64) {
	corners := []point{
		{x: x, y: y},
		{x: x + size, y: y},
		{x: x + size, y: y + size},
		{x: x, y: y + size},
	}

	start := 0
	minDistance := distance(corners[0], pole)
	for i := 1; i < len(corners); i++ {
		if d := distance(corners[i], pole); d < minDistance {
			start = i
			minDistance = d
		}
	}

	ordered := make([]point, 0, len(corners))
	for i := 0; i < len(corners); i++ {
		ordered = append(ordered, corners[(start+i)%len(corners)])
	}

	return fmt.Sprintf(
		"M %.2f %.2f L %.2f %.2f L %.2f %.2f L %.2f %.2f Z",
		ordered[0].x, ordered[0].y,
		ordered[1].x, ordered[1].y,
		ordered[2].x, ordered[2].y,
		ordered[3].x, ordered[3].y,
	), minDistance
}

func diagonalFromPole(a, b, pole point) goldenGuideDraft {
	if distance(b, pole) < distance(a, pole) {
		a, b = b, a
	}

	return goldenGuideDraft{
		d:        fmt.Sprintf("M %.2f %.2f L %.2f %.2f", a.x, a.y, b.x, b.y),
		distance: distance(a, pole),
	}
}

func guideDistanceRange(guides []goldenGuideDraft) (float64, float64) {
	if len(guides) == 0 {
		return 0, 1
	}

	minDistance := guides[0].distance
	maxDistance := guides[0].distance
	for _, guide := range guides[1:] {
		minDistance = math.Min(minDistance, guide.distance)
		maxDistance = math.Max(maxDistance, guide.distance)
	}
	if maxDistance == minDistance {
		maxDistance = minDistance + 1
	}

	return minDistance, maxDistance
}

func goldenPathFromDraft(order int, draft goldenGuideDraft, minDistance, maxDistance, maxDelay, growEnd, shrinkBase, shrinkEnd, hideAt, loopDuration float64) GoldenPath {
	ratio := (draft.distance - minDistance) / (maxDistance - minDistance)
	growDelay := ratio * maxDelay
	shrinkDelay := (1 - ratio) * maxDelay
	shrinkStart := shrinkBase + shrinkDelay

	return GoldenPath{
		D:              draft.d,
		Order:          order,
		Distance:       fmt.Sprintf("%.2f", draft.distance),
		GrowDelay:      fmt.Sprintf("%.3fs", growDelay),
		ShrinkDelay:    fmt.Sprintf("%.3fs", shrinkDelay),
		GrowStartPct:   pct(growDelay, loopDuration),
		GrowFadePct:    pct(growDelay+0.12, loopDuration),
		GrowEndPct:     pct(growEnd, loopDuration),
		ShrinkStartPct: pct(shrinkStart, loopDuration),
		ShrinkEndPct:   pct(shrinkEnd, loopDuration),
		HidePct:        pct(hideAt, loopDuration),
	}
}

func distance(a, b point) float64 {
	return math.Hypot(a.x-b.x, a.y-b.y)
}

func pct(t, total float64) string {
	return fmt.Sprintf("%.3f", t/total*100)
}

func (r Renderer) render(outputPath, pageTemplate string, data any) error {
	files, err := r.templateFiles(pageTemplate)
	if err != nil {
		return fmt.Errorf("解析模板: %w", err)
	}

	tmpl, err := template.ParseFiles(files...)
	if err != nil {
		return fmt.Errorf("解析模板: %w", err)
	}

	if err := os.MkdirAll(filepath.Dir(outputPath), 0755); err != nil {
		return fmt.Errorf("创建输出目录: %w", err)
	}

	file, err := os.Create(outputPath)
	if err != nil {
		return fmt.Errorf("创建输出文件: %w", err)
	}
	defer file.Close()

	if err := tmpl.ExecuteTemplate(file, "base", data); err != nil {
		return fmt.Errorf("渲染模板: %w", err)
	}

	return nil
}

func (r Renderer) templateFiles(pageTemplate string) ([]string, error) {
	files := []string{
		filepath.Join(r.TemplatesDir, "layouts", "base.html"),
	}

	partials, err := filepath.Glob(filepath.Join(r.TemplatesDir, "partials", "*.html"))
	if err != nil {
		return nil, fmt.Errorf("查找 partial 模板: %w", err)
	}
	sort.Strings(partials)
	files = append(files, partials...)
	files = append(files, filepath.Join(r.TemplatesDir, "pages", pageTemplate))

	return files, nil
}
