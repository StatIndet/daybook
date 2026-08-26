package main

import (
	"os"
	"strings"
)

func main() {
	content, _ := os.ReadFile("internal/seo/builder.go")
	s := string(content)

	s = strings.ReplaceAll(s, `func BuildForHome(args BuilderArgs) SEOData {
	for i := range args.Alternates {`, `func BuildForHome(args BuilderArgs) SEOData {
	siteName := args.Config.GetSiteName(args.Lang)
	for i := range args.Alternates {`)
	
	s = strings.ReplaceAll(s, `func BuildForNote(args BuilderArgs) SEOData {
	for i := range args.Alternates {`, `func BuildForNote(args BuilderArgs) SEOData {
	siteName := args.Config.GetSiteName(args.Lang)
	for i := range args.Alternates {`)

	s = strings.ReplaceAll(s, `func BuildForAbout(args BuilderArgs) SEOData {
	for i := range args.Alternates {`, `func BuildForAbout(args BuilderArgs) SEOData {
	siteName := args.Config.GetSiteName(args.Lang)
	for i := range args.Alternates {`)

	s = strings.ReplaceAll(s, `func BuildForCollection(args BuilderArgs) SEOData {
	for i := range args.Alternates {`, `func BuildForCollection(args BuilderArgs) SEOData {
	siteName := args.Config.GetSiteName(args.Lang)
	for i := range args.Alternates {`)

	s = strings.ReplaceAll(s, `func BuildForGraph(args BuilderArgs) SEOData {
	for i := range args.Alternates {`, `func BuildForGraph(args BuilderArgs) SEOData {
	siteName := args.Config.GetSiteName(args.Lang)
	for i := range args.Alternates {`)

	s = strings.ReplaceAll(s, `func BuildForTag(args BuilderArgs) SEOData {
	for i := range args.Alternates {`, `func BuildForTag(args BuilderArgs) SEOData {
	siteName := args.Config.GetSiteName(args.Lang)
	for i := range args.Alternates {`)

	s = strings.ReplaceAll(s, `Title:        args.Title + " | " + args.Config.Site.Title`, `Title:        args.Title + " | " + siteName`)
	s = strings.ReplaceAll(s, `SiteName:     args.Config.Site.Title,`, `SiteName:     siteName,`)

	os.WriteFile("internal/seo/builder.go", []byte(s), 0644)
}
