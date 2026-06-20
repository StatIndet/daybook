package titlelayout

import (
	"strings"
	"unicode"
)

type TitleToken struct {
	Index int
	Text  string
}

func isCJK(r rune) bool {
	return unicode.Is(unicode.Han, r) ||
		unicode.Is(unicode.Hiragana, r) ||
		unicode.Is(unicode.Katakana, r) ||
		unicode.Is(unicode.Hangul, r)
}

func isParticle(r rune) bool {
	particles := "的了和与在对中后前是有以将并为"
	return strings.ContainsRune(particles, r)
}

func isAttachedPunctuation(r rune) bool {
	if unicode.IsSpace(r) {
		return true
	}
	punct := ",.;:!?，。！？、；：)]}）】》」』'\"”’"
	return strings.ContainsRune(punct, r)
}

func isOpeningBracket(r rune) bool {
	punct := "([{（【《「『'\"“‘"
	return strings.ContainsRune(punct, r)
}

func isCamelCaseBoundary(prev, curr rune) bool {
	return unicode.IsLower(prev) && unicode.IsUpper(curr)
}

func Tokenize(title string) []TitleToken {
	var tokens []TitleToken
	runes := []rune(title)
	if len(runes) == 0 {
		return tokens
	}

	var currentToken []rune
	tokenIndex := 0

	addToken := func() {
		if len(currentToken) > 0 {
			tokens = append(tokens, TitleToken{
				Index: tokenIndex,
				Text:  string(currentToken),
			})
			tokenIndex++
			currentToken = []rune{}
		}
	}

	for i := 0; i < len(runes); i++ {
		r := runes[i]

		// If current is empty, just add
		if len(currentToken) == 0 {
			currentToken = append(currentToken, r)
			continue
		}

		prev := currentToken[len(currentToken)-1]

		// 1. Attached punctuation goes with the previous token
		if isAttachedPunctuation(r) {
			currentToken = append(currentToken, r)
			continue
		}

		// 1.5. Opening brackets stick to the following character
		if isOpeningBracket(prev) {
			currentToken = append(currentToken, r)
			continue
		}

		// 2. Break after spaces so words can wrap
		if unicode.IsSpace(prev) {
			addToken()
			currentToken = append(currentToken, r)
			continue
		}

		// 3. Language boundaries
		prevIsCJK := isCJK(prev)
		currIsCJK := isCJK(r)
		if prevIsCJK != currIsCJK {
			addToken()
			currentToken = append(currentToken, r)
			continue
		}

		// 4. English CamelCase boundary (e.g. ViewTransition -> View Transition)
		if !prevIsCJK && !currIsCJK && isCamelCaseBoundary(prev, r) {
			addToken()
			currentToken = append(currentToken, r)
			continue
		}

		// 5. CJK Particle boundaries
		// Break *before* particles so particle starts a new token? 
		// Or break *after* particle? Usually breaking before particle is better so "的" goes with the next word or starts a line.
		// Wait, breaking after particle is better so "长标题的" is one line, "几何过渡" is another.
		if currIsCJK && isParticle(r) && !isParticle(prev) {
			addToken()
			currentToken = append(currentToken, r)
			continue
		}
		if currIsCJK && !isParticle(r) && isParticle(prev) {
			addToken()
			currentToken = append(currentToken, r)
			continue
		}

		// 6. Number vs Letter boundary
		prevIsDigit := unicode.IsDigit(prev)
		currIsDigit := unicode.IsDigit(r)
		if !prevIsCJK && !currIsCJK && (prevIsDigit != currIsDigit) && r != '.' && r != '-' {
			// Actually keep "1.26" together.
			// But "CSS3" -> "CSS", "3"? Usually yes.
			addToken()
			currentToken = append(currentToken, r)
			continue
		}

		// 7. General punctuation boundary
		prevIsPunct := unicode.IsPunct(prev) || unicode.IsSymbol(prev)
		currIsPunct := unicode.IsPunct(r) || unicode.IsSymbol(r)
		if !prevIsCJK && !currIsCJK && (prevIsPunct != currIsPunct) {
			// To keep filenames together like "page-transition-engine.js"
			// we shouldn't break on hyphens or dots if surrounded by letters.
			if (r == '.' || r == '-' || r == '/') && i+1 < len(runes) && unicode.IsLetter(runes[i+1]) {
				// Don't break
			} else if (prev == '.' || prev == '-' || prev == '/') && unicode.IsLetter(r) {
				// Don't break
			} else {
				addToken()
				currentToken = append(currentToken, r)
				continue
			}
		}

		// 8. Prevent excessively long CJK tokens
		if currIsCJK && len(currentToken) >= 6 {
			addToken()
			currentToken = append(currentToken, r)
			continue
		}

		currentToken = append(currentToken, r)
	}

	addToken()

	return tokens
}
