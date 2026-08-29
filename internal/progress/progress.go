package progress

import (
	"fmt"
	"os"
	"strings"
	"sync"
	"time"
)

type Stage struct {
	Name   string
	Weight float64 // 0.0 to 1.0
}

type Reporter struct {
	mu           sync.Mutex
	isTTY        bool
	spinnerIdx   int
	spinTicker   *time.Ticker
	stopSpinner  chan struct{}
	
	stages       []Stage
	currentStage int
	stageVal     int
	stageTotal   int
	
	startTime    time.Time
}

var brailleFrames = []string{"⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"}

func NewReporter(stages []Stage) *Reporter {
	info, err := os.Stdout.Stat()
	isTTY := err == nil && (info.Mode()&os.ModeCharDevice) != 0

	r := &Reporter{
		isTTY:       isTTY,
		stages:      stages,
		startTime:   time.Now(),
		stopSpinner: make(chan struct{}),
	}
	
	if isTTY {
		r.spinTicker = time.NewTicker(100 * time.Millisecond)
		go r.spinnerLoop()
	}
	return r
}

func (r *Reporter) spinnerLoop() {
	for {
		select {
		case <-r.stopSpinner:
			return
		case <-r.spinTicker.C:
			r.mu.Lock()
			if r.currentStage >= 0 && r.currentStage < len(r.stages) {
				r.spinnerIdx = (r.spinnerIdx + 1) % len(brailleFrames)
				r.render()
			}
			r.mu.Unlock()
		}
	}
}

func (r *Reporter) SetStage(index int, total int) {
	r.mu.Lock()
	defer r.mu.Unlock()
	
	r.currentStage = index
	r.stageVal = 0
	r.stageTotal = total
	r.spinnerIdx = 0
	
	if !r.isTTY {
		if index >= 0 && index < len(r.stages) {
			fmt.Printf("%s...\n", r.stages[index].Name)
		}
	} else {
		r.render()
	}
}

func (r *Reporter) Advance(val int) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.stageVal = val
	if r.isTTY {
		r.render()
	}
}

func (r *Reporter) Done(message string) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.isTTY && r.spinTicker != nil {
		r.spinTicker.Stop()
		close(r.stopSpinner)
		
		// Clear the two dynamic lines
		fmt.Print("\033[2K\r\033[1A\033[2K\r")
	}
	
	duration := time.Since(r.startTime)
	fmt.Printf("✓ %s · %.2fs\n", message, duration.Seconds())
}

func (r *Reporter) Fail(err error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	
	if r.isTTY && r.spinTicker != nil {
		r.spinTicker.Stop()
		close(r.stopSpinner)
		fmt.Print("\033[2K\r\033[1A\033[2K\r")
	}
	
	stageName := "unknown"
	if r.currentStage >= 0 && r.currentStage < len(r.stages) {
		stageName = r.stages[r.currentStage].Name
	}
	
	fmt.Printf("✗ 构建失败于阶段: %s\n\nerror: %v\n", stageName, err)
}

func (r *Reporter) render() {
	if !r.isTTY {
		return
	}
	
	stageName := r.stages[r.currentStage].Name
	
	// calculate global progress
	var baseProg float64
	for i := 0; i < r.currentStage; i++ {
		baseProg += r.stages[i].Weight
	}
	
	stageProg := 0.0
	if r.stageTotal > 0 {
		stageProg = float64(r.stageVal) / float64(r.stageTotal)
	}
	
	globalProg := baseProg + stageProg*r.stages[r.currentStage].Weight
	if globalProg > 1.0 {
		globalProg = 1.0
	}
	
	// render line 1
	var line1 string
	if r.stageTotal > 0 {
		line1 = fmt.Sprintf("%s %s %d/%d", brailleFrames[r.spinnerIdx], stageName, r.stageVal, r.stageTotal)
	} else {
		line1 = fmt.Sprintf("%s %s", brailleFrames[r.spinnerIdx], stageName)
	}
	
	// render line 2 (progress bar)
	// We use a safe width that works on narrow terminals (e.g., 30 chars for the bar itself)
	// 30 chars bar + 10 chars brackets/percentage = 40 chars total line 2 length.
	// This fits easily in 80-col and most smaller panes.
	width := 30
	filled := int(float64(width) * globalProg)
	bar := strings.Repeat("=", filled)
	if filled < width {
		// Use hyphen for track
		if filled == 0 {
			bar += strings.Repeat("-", width)
		} else {
			bar += "-" + strings.Repeat("-", width-filled-1) 
		}
	}
	
	line2 := fmt.Sprintf("[%s] %d%%", bar, int(globalProg*100))
	
	// \r goes to start of line, \033[K clears from cursor to end of line.
	// So we print line 1 and clear the rest of that line.
	// Then \n to go to line 2.
	// Print line 2 and clear the rest of that line.
	// Then \033[1A moves the cursor UP 1 line (back to line 1), so next time it overwrites correctly.
	fmt.Printf("\r\033[K%s\n\r\033[K%s\033[1A", line1, line2)
}
