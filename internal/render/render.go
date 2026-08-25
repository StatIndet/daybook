package render

import (
	"fmt"
	"html/template"
	"math"
	"os"
	"path/filepath"
	"strings"

	"github.com/StatIndet/daybook/internal/config"
	"github.com/StatIndet/daybook/internal/embedded"
	"github.com/StatIndet/daybook/internal/i18n"
	"github.com/StatIndet/daybook/internal/morphable"
	"github.com/StatIndet/daybook/internal/seo"
)

type Renderer struct {
	TemplatesDir string
}

type SiteData struct {
	Title          string
	StartedAt      string
	TotalWordCount int
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
	Updated             string
	Lang                string
	ReadingTime         string
	ReadingMinutes      int
	Summary             string
	Tags                []string
	TagIDs              []string
	URL                 string
	Slug                string
	Pin                 bool
	HasMusic            bool
	HasTranslation      bool
	TitleLayout         template.HTML
	TitleTransitionName string
	DateTransitionName  string
}

type NotePage struct {
	Title               string
	Date                string
	Updated             string
	ReadingTime         string
	Summary             string
	URL                 string
	Slug                string
	I18nKey             string
	CommentPath         string
	Tags                []string
	WordCount           int
	ReadingMinutes      int
	CanonicalPath       string
	ShareURL            string
	ShareText           string
	HTML                template.HTML
	Headings            []Heading
	HasMermaid          bool
	HasMath             bool
	TocEnabled          bool
	CommentEnabled      bool
	IsFallback          bool
	HasTranslation      bool
	Pin                 bool
	HasMusic            bool
	TitleLayout         template.HTML
	TitleTransitionName string
	DateTransitionName  string
}

type GoldenGuide struct {
	Order int
	Kind  string

	GrowStartPct string
	GrowFadePct  string
	GrowEndPct   string

	ShrinkStartPct string
	ShrinkEndPct   string

	HidePct string

	Segments []GoldenGuideSegment
}

type GoldenGuideSegment struct {
	TranslateX string
	TranslateY string
	Rotation   string
	Length     string
	Order      int

	GrowStartPct   string
	GrowEndPct     string
	ShrinkStartPct string
	ShrinkEndPct   string
}

type goldenGuideDraft struct {
	points   []point
	distance float64
	kind     string
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
	Guides                  []GoldenGuide
	SpiralPath              string
}

type IndexData struct {
	Site         SiteData
	Config       config.Config
	PageTitle    string
	PageKind     string
	BodyClass    string
	Lang         string
	AlternateURL string
	Assets       Assets
	HasMath      bool
	Notes        []NoteLink
	Tags         []TagLink
	SEO          seo.SEOData
	Pagination   PaginationData
}

type TagLink struct {
	Name         string
	URL          string
	Index        int
	ReverseIndex int
}


type PaginationItem struct {
	PageNumber int
	URL        string
	IsCurrent  bool
	IsEllipsis bool
}

type PaginationData struct {
	CurrentPage int
	TotalPages  int
	PrevURL     string
	NextURL     string
	Items       []PaginationItem
}

type NotesData struct {
	Site         SiteData
	Config       config.Config
	PageTitle    string
	PageKind     string
	BodyClass    string
	Lang         string
	AlternateURL string
	Assets       Assets
	HasMath      bool
	Notes        []NoteLink
	PinnedNotes  []NoteLink
	MonthGroups  []MonthGroup
	Tags         []TagLink
	SEO          seo.SEOData
	Pagination   PaginationData
}

type MonthGroup struct {
	Key   string
	Label string
	Notes []NoteLink
}

type ArchiveRow struct {
	Type        string   `json:"type"` // "year" or "note"
	ID          string   `json:"id"`
	Year        string   `json:"year,omitempty"`
	Date        string   `json:"date,omitempty"`
	DateShort   string   `json:"dateShort,omitempty"`
	Title       string   `json:"title,omitempty"`
	ReadingTime string   `json:"readingTime,omitempty"`
	Summary     string   `json:"summary,omitempty"`
	URL         string   `json:"url,omitempty"`
	TagIDs      []string `json:"tagIDs,omitempty"`
	Index       int      `json:"index,omitempty"`
    IsLastInYear bool    `json:"isLastInYear,omitempty"`
}

type ArchiveData struct {
	Site         SiteData
	Config       config.Config
	PageTitle    string
	PageKind     string
	BodyClass    string
	Lang         string
	AlternateURL string
	Assets       Assets
	HasMath      bool
	Total        int
	Rows         []ArchiveRow
	Tags         []TagLink
	SEO          seo.SEOData
	Pagination   PaginationData
}

type NoteData struct {
	Site         SiteData
	Config       config.Config
	PageTitle    string
	PageKind     string
	BodyClass    string
	Lang         string
	AlternateURL string
	Assets       Assets
	HasMath      bool
	Note         NotePage
	Tags         []TagLink
	SEO          seo.SEOData
	Pagination   PaginationData
}

type AboutData struct {
	Site           SiteData
	Config         config.Config
	PageTitle      string
	PageKind       string
	BodyClass      string
	Lang           string
	AlternateURL   string
	Assets         Assets
	HasMath        bool
	Spiral         GoldenSpiral
	HasTranslation bool
	Title          string
	Summary        string
	Date           string
	Updated        string
	ReadingTime    string
	WordCount      int
	HTML           template.HTML
	Tags           []TagLink
	SEO            seo.SEOData
}

type GraphData struct {
	Site         SiteData
	Config       config.Config
	PageTitle    string
	PageKind     string
	BodyClass    string
	Lang         string
	AlternateURL string
	Assets       Assets
	HasMath      bool
	Tags         []TagLink
	SEO          seo.SEOData
	Pagination   PaginationData
}

type TagData struct {
	Site         SiteData
	Config       config.Config
	PageTitle    string
	PageKind     string
	BodyClass    string
	Lang         string
	AlternateURL string
	Assets       Assets
	HasMath      bool
	Notes        []NoteLink
	Tags         []TagLink
	SEO          seo.SEOData
	Pagination   PaginationData
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

func (r Renderer) RenderGraph(outputPath string, data GraphData) error {
	return r.render(outputPath, "graph.html", data)
}

func (r Renderer) RenderTag(outputPath string, data TagData) error {
	return r.render(outputPath, "tag.html", data)
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
	_, visualAnchor, _ := buildSpiralPath(basePole, baseOuterAnchor, float64(len(baseSquares)), 0)

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
		draft := squareFromPole(square.x, square.y, square.s, pole)
		squareDrafts = append(squareDrafts, draft)
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

	guides := make([]GoldenGuide, 0, len(diagonalDrafts)+len(squareDrafts))
	guideOrder := 0
	segOrder := 0
	for _, draft := range diagonalDrafts {
		g := guideFromDraft(guideOrder, segOrder, draft, minDistance, maxDistance, phi, guideGrowEnd, guideShrinkStart, guideShrinkEnd, guideHideAt, loopDuration)
		guides = append(guides, g)
		guideOrder++
		segOrder += len(g.Segments)
	}
	for _, draft := range squareDrafts {
		g := guideFromDraft(guideOrder, segOrder, draft, minDistance, maxDistance, phi, guideGrowEnd, guideShrinkStart, guideShrinkEnd, guideHideAt, loopDuration)
		guides = append(guides, g)
		guideOrder++
		segOrder += len(g.Segments)
	}

	spiralOuterAnchor := point{x: outerRect.x, y: outerRect.y + outerRect.h}
	spiralInnerQuarterTurns := float64(len(squares))
	outerQuarterTurns := 0.0
	spiralPath, spiralStart, spiralEnd := buildSpiralPath(pole, spiralOuterAnchor, spiralInnerQuarterTurns, outerQuarterTurns)

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
		Guides:                  guides,
		SpiralPath:              spiralPath,
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
		if s <= 2.0 {
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

func buildSpiralPath(pole, outerAnchor point, innerQuarterTurns, outerQuarterTurns float64) (string, point, point) {
	const quarter = math.Pi / 2
	b := math.Log((1+math.Sqrt(5))/2) / quarter
	r0 := distance(outerAnchor, pole)
	theta0 := math.Atan2(outerAnchor.y-pole.y, outerAnchor.x-pole.x)
	outerT := -outerQuarterTurns * quarter
	innerT := innerQuarterTurns * quarter
	const bezierStep = math.Pi / 12

	P := func(t float64) point {
		r := r0 * math.Exp(-b*t)
		a := theta0 + t
		return point{pole.x + r*math.Cos(a), pole.y + r*math.Sin(a)}
	}
	Pd := func(t float64) point {
		r := r0 * math.Exp(-b*t)
		a := theta0 + t
		dx := r * (-b*math.Cos(a) - math.Sin(a))
		dy := r * (-b*math.Sin(a) + math.Cos(a))
		return point{dx, dy}
	}

	parts := make([]string, 0)
	startPoint := P(innerT)
	parts = append(parts, fmt.Sprintf("M %.2f %.2f", startPoint.x, startPoint.y))

	for t := innerT; t > outerT; t -= bezierStep {
		tNext := t - bezierStep
		if tNext < outerT {
			tNext = outerT
		}
		delta := t - tNext
		p0, pd0 := P(t), Pd(t)
		p1, pd1 := P(tNext), Pd(tNext)
		c1x := p0.x - pd0.x*delta/3
		c1y := p0.y - pd0.y*delta/3
		c2x := p1.x + pd1.x*delta/3
		c2y := p1.y + pd1.y*delta/3
		parts = append(parts, fmt.Sprintf("C %.2f %.2f, %.2f %.2f, %.2f %.2f", c1x, c1y, c2x, c2y, p1.x, p1.y))
		if tNext <= outerT {
			break
		}
	}

	return strings.Join(parts, " "), startPoint, P(outerT)
}
func squareFromPole(x, y, size float64, pole point) goldenGuideDraft {
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

	return goldenGuideDraft{
		points:   []point{ordered[0], ordered[1], ordered[2], ordered[3], ordered[0]},
		distance: minDistance,
		kind:     "rect",
	}
}

func diagonalFromPole(a, b, pole point) goldenGuideDraft {
	if distance(b, pole) < distance(a, pole) {
		a, b = b, a
	}
	return goldenGuideDraft{
		points:   []point{a, b},
		distance: distance(a, pole),
		kind:     "diagonal",
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

func guideFromDraft(guideOrder, baseSegOrder int, draft goldenGuideDraft, minDistance, maxDistance, maxDelay, growEnd, shrinkBase, shrinkEnd, hideAt, loopDuration float64) GoldenGuide {
	ratio := 0.0
	if maxDistance > minDistance {
		ratio = (draft.distance - minDistance) / (maxDistance - minDistance)
	}
	growDelay := ratio * maxDelay
	shrinkDelay := (1 - ratio) * maxDelay
	shrinkStart := shrinkBase + shrinkDelay

	growDuration := growEnd - growDelay
	shrinkDuration := shrinkEnd - shrinkStart

	pts := draft.points
	numEdges := len(pts) - 1
	lengths := make([]float64, numEdges)
	totalLength := 0.0
	for i := 0; i < numEdges; i++ {
		l := distance(pts[i], pts[i+1])
		lengths[i] = l
		totalLength += l
	}

	segments := make([]GoldenGuideSegment, numEdges)

	const overlapSec = 0.03 // 30ms overlap

	currentGrow := growDelay
	for i := 0; i < numEdges; i++ {
		p0, p1 := pts[i], pts[i+1]
		l := lengths[i]
		ratioL := l / totalLength

		dx, dy := p1.x-p0.x, p1.y-p0.y
		angle := math.Atan2(dy, dx) * 180 / math.Pi

		segGrowEnd := currentGrow + growDuration*ratioL

		segGrowStartReal := currentGrow
		if i > 0 {
			// Pull back the start time by overlapSec to create a slight overlap
			segGrowStartReal = currentGrow - overlapSec
		}

		sumAfter := 0.0
		for j := i + 1; j < numEdges; j++ {
			sumAfter += lengths[j]
		}

		segShrinkStart := shrinkStart + shrinkDuration*(sumAfter/totalLength)
		segShrinkEnd := segShrinkStart + shrinkDuration*ratioL

		segShrinkStartReal := segShrinkStart
		if i < numEdges-1 {
			// For shrink, overlap means starting earlier for the NEXT segment in shrink order.
			// Edge 3 shrinks first, Edge 2 next. Edge 2 should start 30ms before Edge 3 finishes.
			// Wait, the order of shrink is i from numEdges-1 down to 0.
			// So segShrinkStart for edge i should be pulled back.
			segShrinkStartReal = segShrinkStart - overlapSec
		}

		segments[i] = GoldenGuideSegment{
			TranslateX: fmt.Sprintf("%.2f", p0.x),
			TranslateY: fmt.Sprintf("%.2f", p0.y),
			Rotation:   fmt.Sprintf("%.2f", angle),
			Length:     fmt.Sprintf("%.2f", l),
			Order:      baseSegOrder + i,

			GrowStartPct:   pct(segGrowStartReal, loopDuration),
			GrowEndPct:     pct(segGrowEnd, loopDuration),
			ShrinkStartPct: pct(segShrinkStartReal, loopDuration),
			ShrinkEndPct:   pct(segShrinkEnd, loopDuration),
		}

		currentGrow = segGrowEnd
	}

	return GoldenGuide{
		Order: guideOrder,
		Kind:  draft.kind,

		GrowStartPct: pct(growDelay, loopDuration),
		GrowFadePct:  pct(growDelay+0.12, loopDuration),
		GrowEndPct:   pct(growEnd, loopDuration),

		ShrinkStartPct: pct(shrinkStart, loopDuration),
		ShrinkEndPct:   pct(shrinkEnd, loopDuration),

		HidePct: pct(hideAt, loopDuration),

		Segments: segments,
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

	tmpl := template.New(filepath.Base(files[0])).Funcs(template.FuncMap{
		"dict": func(values ...interface{}) (map[string]interface{}, error) {
			if len(values)%2 != 0 {
				return nil, fmt.Errorf("invalid dict call")
			}
			dict := make(map[string]interface{}, len(values)/2)
			for i := 0; i < len(values); i += 2 {
				key, ok := values[i].(string)
				if !ok {
					return nil, fmt.Errorf("dict keys must be strings")
				}
				dict[key] = values[i+1]
			}
			return dict, nil
		},
		"morphableText": func(text, key, classPrefix string) template.HTML {
			return morphable.GenerateHTML(text, key, classPrefix, true)
		},
		"morphableTitle": func(text, key, classPrefix string) template.HTML {
			return morphable.GenerateHTML(text, key, classPrefix, false)
		},
		"formatNum": func(n int) string {
			s := fmt.Sprintf("%d", n)
			var parts []string
			for i := len(s); i > 0; i -= 3 {
				if i-3 > 0 {
					parts = append([]string{s[i-3 : i]}, parts...)
				} else {
					parts = append([]string{s[:i]}, parts...)
				}
			}
			return strings.Join(parts, ",")
		},
		"T": i18n.T,
		"tagURL": func(lang, tag string) template.URL {
			prefix := ""
			if lang == "en" {
				prefix = "/en"
			}
			return template.URL(prefix + "/tags/" + seo.TagSlug(tag) + "/")
		},
		"tagSlug": seo.TagSlug,
	})
	tmpl, err = tmpl.ParseFS(embedded.FS, files...)
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
	// r.TemplatesDir should be "templates"
	// To use ParseFS, we should use forward slashes.
	dir := "templates"
	files := []string{
		dir + "/layouts/base.html",
		dir + "/partials/*.html",
		dir + "/pages/" + pageTemplate,
	}
	return files, nil
}
