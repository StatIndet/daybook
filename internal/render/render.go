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
	TitleTransitionName string
	DateTransitionName  string
}

type GoldenPath struct {
	D      string
	Offset string
	Span   string
}

type GoldenLayer struct {
	Index int
}

type GoldenSpiral struct {
	PoleX      string
	PoleY      string
	Squares    []GoldenPath
	Diagonals  []GoldenPath
	SpiralPath string
	Layers     []GoldenLayer
}

type IndexData struct {
	Site      SiteData
	PageTitle string
	BodyClass string
	Notes     []NoteLink
}

type NotesData struct {
	Site      SiteData
	PageTitle string
	BodyClass string
	Notes     []NoteLink
}

type NoteData struct {
	Site      SiteData
	PageTitle string
	BodyClass string
	Note      NotePage
}

type AboutData struct {
	Site      SiteData
	PageTitle string
	BodyClass string
	Spiral    GoldenSpiral
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

func (r Renderer) RenderNote(outputPath string, data NoteData) error {
	return r.render(outputPath, "note.html", data)
}

func (r Renderer) RenderAbout(outputPath string, data AboutData) error {
	return r.render(outputPath, "about.html", data)
}

func NewGoldenSpiral() GoldenSpiral {
	phi := (1 + math.Sqrt(5)) / 2
	const quarter = math.Pi / 2

	cx := 560.0
	cy := 140.0
	cw := 1080.0
	ch := 1080.0 / phi
	rectX := cx
	rectY := cy
	rectW := cw
	rectH := ch

	type square struct {
		x float64
		y float64
		s float64
	}

	var squares []square
	dir := 0
	for i := 0; i < 44; i++ {
		s := math.Min(cw, ch)
		if s <= 0.01 {
			break
		}

		switch dir {
		case 0:
			if i < 13 {
				squares = append(squares, square{x: cx, y: cy, s: s})
			}
			cx += s
			cw -= s
		case 1:
			if i < 13 {
				squares = append(squares, square{x: cx, y: cy, s: s})
			}
			cy += s
			ch -= s
		case 2:
			if i < 13 {
				squares = append(squares, square{x: cx + cw - s, y: cy, s: s})
			}
			cw -= s
		default:
			if i < 13 {
				squares = append(squares, square{x: cx, y: cy + ch - s, s: s})
			}
			ch -= s
		}
		dir = (dir + 1) % 4
	}

	if len(squares) == 0 {
		return GoldenSpiral{}
	}

	poleX := cx + cw/2
	poleY := cy + ch/2
	s0 := squares[0].s

	diagonals := []GoldenPath{
		{
			D:      fmt.Sprintf("M %.2f %.2f L %.2f %.2f", rectX, rectY, rectX+rectW, rectY+rectH),
			Offset: goldenOffset(100),
			Span:   goldenSpan(100),
		},
		{
			D:      fmt.Sprintf("M %.2f %.2f L %.2f %.2f", rectX+rectW, rectY, rectX+s0, rectY+rectH),
			Offset: goldenOffset(101),
			Span:   goldenSpan(101),
		},
	}

	squarePaths := make([]GoldenPath, 0, len(squares))
	for i, square := range squares {
		squarePaths = append(squarePaths, GoldenPath{
			D:      fmt.Sprintf("M %.2f %.2f h %.2f v %.2f h %.2f Z", square.x, square.y, square.s, square.s, -square.s),
			Offset: goldenOffset(i),
			Span:   goldenSpan(i),
		})
	}

	b := math.Log(phi) / quarter
	anchorX := squares[0].x + squares[0].s
	anchorY := squares[0].y
	r0 := math.Hypot(anchorX-poleX, anchorY-poleY)
	theta0 := math.Atan2(anchorY-poleY, anchorX-poleX)

	var points []string
	for t := -3.5 * quarter; t <= 24*quarter; t += math.Pi / 72 {
		r := r0 * math.Exp(-b*t)
		a := theta0 + t
		points = append(points, fmt.Sprintf("%.2f %.2f", poleX+r*math.Cos(a), poleY+r*math.Sin(a)))
	}

	layers := []GoldenLayer{
		{Index: 0},
		{Index: 1},
		{Index: 2},
	}

	return GoldenSpiral{
		PoleX:      fmt.Sprintf("%.2f", poleX),
		PoleY:      fmt.Sprintf("%.2f", poleY),
		Squares:    squarePaths,
		Diagonals:  diagonals,
		SpiralPath: "M " + strings.Join(points, " L "),
		Layers:     layers,
	}
}

func goldenOffset(index int) string {
	start := goldenUnit(index, 12.9898) * 0.42
	return fmt.Sprintf("%.3f", -start)
}

func goldenSpan(index int) string {
	return fmt.Sprintf("%.3f", 0.58+goldenUnit(index, 78.233)*0.34)
}

func goldenUnit(index int, seed float64) float64 {
	value := math.Sin(float64(index+1)*seed) * 43758.5453
	return value - math.Floor(value)
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
