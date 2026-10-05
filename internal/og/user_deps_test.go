package og

import (
	"reflect"
	"testing"
)

func TestMissingPackages(t *testing.T) {
	for _, tc := range []struct {
		output string
		want   []string
	}{
		{"All system dependencies are installed.\n", nil},
		{"Missing system dependencies (2):\n  libatk1.0-0t64\n  libx11-6:amd64\n", []string{"libatk1.0-0t64", "libx11-6:amd64"}},
	} {
		got, err := missingPackages(tc.output)
		if err != nil || !reflect.DeepEqual(got, tc.want) {
			t.Fatalf("%q: %v, %v; want %v", tc.output, got, err, tc.want)
		}
	}
	for _, output := range []string{
		"", "E: Unable to locate package libatk", "Missing system dependencies (0):",
		"Missing system dependencies (2):\n  libatk1.0-0t64",
		"Missing system dependencies (1):\n  --allow-unauthenticated",
		"Missing system dependencies (1):\n  libatk; touch /tmp/file",
		"Missing system dependencies (2):\n  libatk\n  libatk",
	} {
		if _, err := missingPackages(output); err == nil {
			t.Errorf("accepted malformed report %q", output)
		}
	}
}
