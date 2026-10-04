package config

import (
	"os"
	"reflect"
	"testing"
)

func TestGraphSearchPropertiesDefaultAndNormalization(t *testing.T) {
	for _, test := range []struct {
		name, input string
		want        []string
	}{
		{"default", "site: {}\n", []string{}},
		{"explicit", "graph:\n  searchProperties: [\" status \", status, aliases, \"\"]\n", []string{"status", "aliases"}},
	} {
		t.Run(test.name, func(t *testing.T) {
			t.Chdir(t.TempDir())
			if err := os.WriteFile("daybook.yaml", []byte(test.input), 0644); err != nil {
				t.Fatal(err)
			}
			cfg, err := Load()
			if err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(cfg.Graph.SearchProperties, test.want) {
				t.Fatalf("searchProperties = %#v, want %#v", cfg.Graph.SearchProperties, test.want)
			}
		})
	}
}
