package progress

import (
	"bytes"
	"errors"
	"fmt"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/rivo/uniseg"
)

func testReporter(out *bytes.Buffer, verbose bool) *Reporter {
	return NewReporter([]Stage{{Name: "Scan", Weight: 2}, {Name: "Render", Weight: 8}}, Options{Writer: out, Verbose: verbose})
}

func TestProgressTracksCompletedWorkAndNeverReachesSuccessEarly(t *testing.T) {
	var out bytes.Buffer
	r := testReporter(&out, false)
	defer r.Close()
	if r.currentStage != -1 {
		t.Fatal("invented an active stage before build starts")
	}
	r.SetStage(0, 10)
	r.Advance(5)
	if got := r.fraction(); got != .1 {
		t.Fatalf("half a scan: %v", got)
	}
	for range 20 {
		r.frame++
		r.lines(80)
	}
	if got := r.fraction(); got != .1 {
		t.Fatalf("animation advanced work: %v", got)
	}
	r.Advance(2)
	r.SetStage(-1, 0)
	r.SetStage(9, 1)
	if got := r.fraction(); got != .1 {
		t.Fatalf("stale/invalid update changed work: %v", got)
	}
	r.SetStage(1, 10)
	if got := r.fraction(); got != .2 {
		t.Fatalf("stage transition: %v", got)
	}
	r.Advance(5)
	if got := r.fraction(); got != .6 {
		t.Fatalf("half a render: %v", got)
	}
	r.Advance(100)
	if r.fraction() >= 1 || r.stageVal != 10 {
		t.Fatal("reached success before Done or exceeded total")
	}
	r.Done("Built site")
	r.Done("duplicate success")
	r.Fail(errors.New("late error"))
	r.Advance(1)
	if strings.Count(out.String(), "✓") != 1 || strings.Contains(out.String(), "late error") {
		t.Fatal(out.String())
	}
}

func TestResponsiveLinesAndGraphemeTruncation(t *testing.T) {
	var out bytes.Buffer
	r := testReporter(&out, false)
	defer r.Close()
	r.SetStage(1, 42)
	r.Advance(18)
	r.Task("Rendering pages", strings.Repeat("notes/鲸歌👨‍👩‍👧‍👦e\u0301.md", 20))
	for _, columns := range []int{1, 2, 4, 8, 15, 24, 39, 40, 80, 120, 200} {
		first, second := r.lines(columns)
		for _, line := range []string{first, second} {
			if w := uniseg.StringWidth(line); w >= columns || w > 140 {
				t.Errorf("%d columns: width %d: %q", columns, w, line)
			}
		}
		if columns >= 24 && !strings.Contains(second, "%") {
			t.Errorf("missing percentage: %q", second)
		}
	}
	_, a := r.lines(80)
	r.frame++
	_, b := r.lines(80)
	if !strings.Contains(a, "C") || !strings.Contains(b, "c") || strings.Replace(a, "C", "c", 1) != b {
		t.Fatalf("mouth changed progress: %q / %q", a, b)
	}
	for _, tc := range []struct {
		s     string
		width int
		want  string
	}{
		{"鲸歌", 3, "鲸…"},
		{"e\u0301abcdef", 3, "e\u0301a…"},
		{"👨‍👩‍👧‍👦abc", 3, "👨‍👩‍👧‍👦…"},
	} {
		if got := truncate(tc.s, tc.width); got != tc.want {
			t.Errorf("truncate %q: %q, want %q", tc.s, got, tc.want)
		}
	}
}

func TestTerminalWarningResizeAndCleanup(t *testing.T) {
	var out bytes.Buffer
	r := testReporter(&out, false)
	// Inject terminal dimensions without a background goroutine.
	columns := 120
	r.isTTY = true
	r.size = func() (int, int, error) { return columns, 24, nil }
	fmt.Fprintln(&out, "existing history")
	r.SetStage(0, 0)
	r.Detail("waiting for response")
	r.Warnf("notes/鲸歌.md:24 · missing link")
	columns = 24
	r.render()
	r.Fail(errors.New("network failed\nretry later"))
	r.Close()
	output := out.String()
	if !strings.HasPrefix(output, "existing history\n") || strings.Contains(output, "\x1b[2J") {
		t.Fatal("erased terminal history")
	}
	if strings.Count(output, "WARN  notes/鲸歌.md:24") != 1 {
		t.Fatal(output)
	}
	if !strings.Contains(output, "\r\x1b[JWARN") || !strings.Contains(output, "\r\x1b[J✗ Build failed") {
		t.Fatal("logs didn't clear their own dynamic region", output)
	}
	if !strings.Contains(output, "waiting for response") || !strings.Contains(output, "network failed\n  retry later") || strings.Contains(output, "✓") {
		t.Fatal(output)
	}
	// Every frame returns to column zero on its first line. No clear/up sequence
	// can reach the preceding warning/history line, including the first frame.
	if strings.Contains(output, "\x1b[J\x1b[1A") {
		t.Fatal("cleanup moves above the owned region")
	}
}

func TestPlainAndVerboseOutput(t *testing.T) {
	for _, verbose := range []bool{false, true} {
		t.Run(fmt.Sprint(verbose), func(t *testing.T) {
			var out bytes.Buffer
			r := testReporter(&out, verbose)
			r.Warnf("configuration fallback")
			r.SetStage(0, 0)
			r.Task("Scanning content", "notes/secret.md")
			r.Verbosef("stats: disabled")
			r.SetStage(1, 1)
			r.Detail("notes/secret.md\n\x1b[31m")
			r.Advance(1)
			r.Done("Built 1 note", "1 social card")
			output := out.String()
			if strings.ContainsAny(output, "\x1b\r") || !strings.Contains(output, "START  Scan") || !strings.Contains(output, "END  Render · 1/1") || !strings.Contains(output, "1 social card · 1 warnings") {
				t.Fatal(output)
			}
			if strings.Contains(output, "notes/secret.md") != verbose || strings.Contains(output, "stats:") != verbose {
				t.Fatal("wrong verbosity", output)
			}
		})
	}
}

func TestDumbCIAndVerboseDisableAnimation(t *testing.T) {
	// IsTerminal is checked independently of these overrides; a character device
	// such as /dev/null is not sufficient to enable cursor control.
	for _, mode := range []string{"dumb", "CI", "verbose"} {
		t.Run(mode, func(t *testing.T) {
			t.Setenv("TERM", "xterm-256color")
			t.Setenv("CI", "")
			if mode == "dumb" {
				t.Setenv("TERM", "dumb")
			}
			if mode == "CI" {
				t.Setenv("CI", "true")
			}
			file, err := os.OpenFile(os.DevNull, os.O_WRONLY, 0)
			if err != nil {
				t.Fatal(err)
			}
			defer file.Close()
			r := NewReporter(nil, Options{Writer: file, Verbose: mode == "verbose"})
			defer r.Close()
			if r.isTTY || r.stop != nil {
				t.Fatal("animation enabled for noninteractive output")
			}
		})
	}
}

func TestConcurrentWarningsAndCompletion(t *testing.T) {
	var out bytes.Buffer
	r := testReporter(&out, true)
	r.SetStage(1, 100)
	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		wg.Go(func() { r.Warnf("warning"); r.Detail("card"); r.Advance(1) })
	}
	wg.Wait()
	r.Done("Built site")
	if strings.Count(out.String(), "WARN  warning") != 20 || !strings.Contains(out.String(), "20 warnings") {
		t.Fatal(out.String())
	}
}

func TestClosingAnimationIsIdempotent(t *testing.T) {
	var out bytes.Buffer
	r := testReporter(&out, false)
	r.isTTY, r.stop = true, make(chan struct{})
	r.size = func() (int, int, error) { return 80, 24, nil }
	done := make(chan struct{})
	go func() { r.animate(); close(done) }()
	r.SetStage(0, 0)
	r.Close()
	r.Close()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("animation did not stop")
	}
	if strings.Contains(out.String(), "✓") {
		t.Fatal("Close claimed success")
	}
}
