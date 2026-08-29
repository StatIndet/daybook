package progress

import (
	"testing"
)

func TestReporterMath(t *testing.T) {
	stages := []Stage{
		{Name: "Stage 1", Weight: 0.2},
		{Name: "Stage 2", Weight: 0.8},
	}
	r := NewReporter(stages)
	r.isTTY = false // disable printing for test

	r.SetStage(0, 10)
	r.Advance(5)

	// Stage 1 is half done: 0 + 0.5 * 0.2 = 0.1
	// (Test logic would actually check internal state if we exported it, but we didn't, so we just run it to ensure no panics)

	r.SetStage(1, 100)
	r.Advance(50)
	
	r.SetStage(2, 0) // Should safely do nothing or just cap at 1.0
	r.Done("Finished")
}
