// Package progress coordinates build status and persistent diagnostics.
package progress

import (
	"fmt"
	"io"
	"os"
	"strings"
	"sync"
	"time"
	"unicode"

	"github.com/rivo/uniseg"
	"golang.org/x/term"
)

type Stage struct {
	Name   string
	Weight float64 // Relative work estimate, not a prediction of remaining time.
}

type Options struct {
	Writer  io.Writer // Defaults to stdout. Non-terminal writers always get plain text.
	Verbose bool
}

type Reporter struct {
	mu                                 sync.Mutex
	out                                io.Writer
	verbose, isTTY, color              bool
	size                               func() (int, int, error)
	stages                             []Stage
	currentStage, stageVal, stageTotal int
	task, detail                       string
	startTime, stageTime               time.Time
	frame, warnings                    int
	drawn, closed                      bool
	stop                               chan struct{}
}

var brailleFrames = []string{"⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"}

func NewReporter(stages []Stage, options ...Options) *Reporter {
	var opts Options
	if len(options) > 0 {
		opts = options[0]
	}
	if opts.Writer == nil {
		opts.Writer = os.Stdout
	}
	r := &Reporter{out: opts.Writer, verbose: opts.Verbose, stages: append([]Stage(nil), stages...), currentStage: -1, startTime: time.Now()}
	if file, ok := opts.Writer.(*os.File); ok {
		fd := int(file.Fd())
		r.size = func() (int, int, error) { return term.GetSize(fd) }
		ci := os.Getenv("CI")
		r.isTTY = term.IsTerminal(fd) && !opts.Verbose && os.Getenv("TERM") != "dumb" && os.Getenv("TERM") != "" && (ci == "" || ci == "0" || strings.EqualFold(ci, "false"))
	}
	r.color = r.isTTY && os.Getenv("NO_COLOR") == ""
	if r.isTTY {
		r.stop = make(chan struct{})
		go r.animate()
	}
	return r
}

func (r *Reporter) animate() {
	ticker := time.NewTicker(180 * time.Millisecond)
	defer ticker.Stop()
	for {
		select {
		case <-r.stop:
			return
		case <-ticker.C:
			r.mu.Lock()
			r.frame++
			r.render()
			r.mu.Unlock()
		}
	}
}

// SetStage finishes the previous stage. Skipped optional stages consume no time
// and produce no log. Calls must follow the order of the supplied stage list.
func (r *Reporter) SetStage(index, total int) {
	if r == nil {
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.closed || index < 0 || index >= len(r.stages) || index <= r.currentStage {
		return
	}
	r.finishStage()
	r.currentStage, r.stageVal, r.stageTotal = index, 0, max(0, total)
	r.task, r.detail, r.stageTime = r.stages[index].Name, "", time.Now()
	if !r.isTTY {
		r.log("START", r.task)
	}
	r.render()
}

// Task changes the explanation of the current work without resetting progress.
func (r *Reporter) Task(name, detail string) {
	if r == nil {
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.closed {
		return
	}
	name, detail = clean(name), clean(detail)
	if r.task == name && r.detail == detail {
		return
	}
	r.task, r.detail = name, detail
	if r.verbose {
		r.log("TASK", r.status())
	}
	r.render()
}

func (r *Reporter) Detail(detail string) {
	if r == nil {
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.closed {
		return
	}
	detail = clean(detail)
	if r.detail == detail {
		return
	}
	r.detail = detail
	if r.verbose {
		r.log("TASK", r.status())
	}
	r.render()
}

// Advance reports completed work only. Repeated or stale callbacks cannot move
// the global progress backwards or beyond the current stage's denominator.
func (r *Reporter) Advance(completed int) {
	if r == nil {
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.closed || completed <= r.stageVal {
		return
	}
	r.stageVal = min(max(0, completed), r.stageTotal)
	if r.verbose {
		r.log("DONE", r.status())
	}
	r.render()
}

func (r *Reporter) Warnf(format string, args ...any) {
	if r == nil {
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.closed {
		return
	}
	r.warnings++
	r.clear()
	r.log("WARN", fmt.Sprintf(format, args...))
	r.render()
}

func (r *Reporter) Verbosef(format string, args ...any) {
	if r == nil {
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.verbose && !r.closed {
		r.log("INFO", fmt.Sprintf(format, args...))
	}
}

func (r *Reporter) Done(message string, details ...string) {
	if r == nil {
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.closed {
		return
	}
	r.finishStage()
	r.close()
	fmt.Fprintf(r.out, "✓ %s · %.1fs\n", clean(message), time.Since(r.startTime).Seconds())
	if r.warnings > 0 {
		details = append(details, fmt.Sprintf("%d warnings", r.warnings))
	}
	if len(details) > 0 {
		fmt.Fprintf(r.out, "  %s\n", clean(strings.Join(details, " · ")))
	}
}

func (r *Reporter) Fail(err error) {
	if r == nil {
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.closed {
		return
	}
	r.close()
	fmt.Fprintf(r.out, "✗ Build failed · %s · %.1fs\n", r.status(), time.Since(r.startTime).Seconds())
	// Preserve useful multi-line subprocess errors, without allowing terminal controls.
	for _, line := range strings.Split(err.Error(), "\n") {
		fmt.Fprintf(r.out, "  %s\n", clean(line))
	}
}

// Close stops animation on an early return without claiming success.
func (r *Reporter) Close() {
	if r == nil {
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	r.close()
}

func (r *Reporter) close() {
	if r.closed {
		return
	}
	r.closed = true
	if r.stop != nil {
		close(r.stop)
	}
	r.clear()
}

func (r *Reporter) finishStage() {
	if r.currentStage >= 0 && !r.isTTY {
		count := ""
		if r.stageTotal > 0 {
			count = fmt.Sprintf(" · %d/%d", r.stageVal, r.stageTotal)
		}
		r.log("END", fmt.Sprintf("%s%s · %.3fs", r.stages[r.currentStage].Name, count, time.Since(r.stageTime).Seconds()))
	}
}

func (r *Reporter) log(level, message string) {
	if r.verbose {
		fmt.Fprintf(r.out, "[%7.3fs] ", time.Since(r.startTime).Seconds())
	}
	fmt.Fprintf(r.out, "%s  %s\n", level, clean(message))
}

func (r *Reporter) status() string {
	s := r.task
	if s == "" {
		s = "Preparing build"
	}
	if r.stageTotal > 0 && r.currentStage >= 0 && r.task == r.stages[r.currentStage].Name {
		s += fmt.Sprintf(" · %d/%d", r.stageVal, r.stageTotal)
	}
	if r.detail != "" {
		s += " · " + r.detail
	}
	return s
}

func (r *Reporter) fraction() float64 {
	var completed, total float64
	for i, stage := range r.stages {
		weight := max(0, stage.Weight)
		total += weight
		if i < r.currentStage {
			completed += weight
		}
		if i == r.currentStage && r.stageTotal > 0 {
			completed += weight * float64(r.stageVal) / float64(r.stageTotal)
		}
	}
	if total == 0 {
		return 0
	}
	// Only Done signifies success, including final validation and subprocess exit.
	return min(0.99, completed/total)
}

func (r *Reporter) lines(columns int) (string, string) {
	width := max(0, min(columns-1, 140)) // Keep a spare cell to prevent autowrap.
	status := r.task
	if width >= 24 {
		status = brailleFrames[r.frame%len(brailleFrames)] + " " + r.status()
	}
	elapsed := fmt.Sprintf("%.1fs", time.Since(r.startTime).Seconds())
	if width >= 40 {
		status = truncate(status, width-uniseg.StringWidth(elapsed)-2)
		status += strings.Repeat(" ", width-uniseg.StringWidth(status)-uniseg.StringWidth(elapsed)) + elapsed
	} else {
		status = truncate(status, width)
	}
	percent := fmt.Sprintf("%3d%%", int(r.fraction()*100))
	trackWidth := width - 7 // brackets, gap, three-digit percentage
	if trackWidth < 8 {
		return status, truncate(strings.TrimSpace(percent), width)
	}
	position := min(trackWidth-1, int(float64(trackWidth)*r.fraction()))
	mouth := "C"
	if r.frame%2 == 1 {
		mouth = "c"
	}
	var remaining strings.Builder
	for i := position + 1; i < trackWidth; i++ {
		if i%3 == 0 {
			remaining.WriteByte('o')
		} else {
			remaining.WriteByte(' ')
		}
	}
	track, pellets := strings.Repeat("-", position), remaining.String()
	if r.color {
		track = "\x1b[2m" + track + "\x1b[0m"
		mouth = "\x1b[33m" + mouth + "\x1b[0m"
		pellets = "\x1b[2m" + pellets + "\x1b[0m"
	}
	return status, "[" + track + mouth + pellets + "] " + percent
}

func (r *Reporter) render() {
	if !r.isTTY || r.closed || r.currentStage < 0 {
		return
	}
	columns, rows, err := r.size()
	r.clear()
	if err != nil || columns < 2 || rows < 2 {
		return
	}
	first, second := r.lines(columns)
	// Cursor invariant: column zero of the FIRST dynamic line. Clearing from
	// there also removes any extra rows produced by terminal resize/reflow.
	fmt.Fprintf(r.out, "%s\n\r%s\x1b[1A\r", first, second)
	r.drawn = true
}

func (r *Reporter) clear() {
	if r.drawn {
		fmt.Fprint(r.out, "\r\x1b[J")
		r.drawn = false
	}
}

func clean(s string) string {
	return strings.Map(func(c rune) rune {
		if unicode.IsControl(c) || c == '\u2028' || c == '\u2029' {
			return ' '
		}
		return c
	}, s)
}

func truncate(s string, width int) string {
	if width <= 0 {
		return ""
	}
	if uniseg.StringWidth(s) <= width {
		return s
	}
	var out strings.Builder
	g := uniseg.NewGraphemes(s)
	used := 0
	for g.Next() {
		if used+g.Width() > width-1 {
			break
		}
		out.WriteString(g.Str())
		used += g.Width()
	}
	return out.String() + "…"
}
