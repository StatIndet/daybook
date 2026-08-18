package flac

import (
	"encoding/binary"
	"errors"
	"io"
	"strings"
)

type Metadata struct {
	Duration   float64
	Title      string
	Artist     string
	CoverData  []byte
	CoverMime  string
}

func Parse(r io.Reader) (*Metadata, error) {
	magic := make([]byte, 4)
	if _, err := io.ReadFull(r, magic); err != nil {
		return nil, err
	}
	if string(magic) != "fLaC" {
		return nil, errors.New("not a FLAC file")
	}

	meta := &Metadata{}
	var hasCover bool

	for {
		header := make([]byte, 4)
		if _, err := io.ReadFull(r, header); err != nil {
			if err == io.EOF || err == io.ErrUnexpectedEOF {
				break
			}
			return nil, err
		}

		isLast := (header[0] & 0x80) != 0
		blockType := header[0] & 0x7F
		length := int(header[1])<<16 | int(header[2])<<8 | int(header[3])

		// Protect against huge metadata blocks
		if length > 16*1024*1024 {
			return nil, errors.New("metadata block too large")
		}

		data := make([]byte, length)
		if _, err := io.ReadFull(r, data); err != nil {
			if err == io.EOF || err == io.ErrUnexpectedEOF {
				break
			}
			return nil, err
		}

		switch blockType {
		case 0: // STREAMINFO
			if len(data) >= 18 {
				sampleRate := (uint32(data[10]) << 12) | (uint32(data[11]) << 4) | (uint32(data[12]) >> 4)
				totalSamples := (uint64(data[13]&0x0F) << 32) | (uint64(data[14]) << 24) |
					(uint64(data[15]) << 16) | (uint64(data[16]) << 8) | uint64(data[17])
				if sampleRate > 0 {
					meta.Duration = float64(totalSamples) / float64(sampleRate)
				}
			}
		case 4: // VORBIS_COMMENT
			parseVorbisComment(data, meta)
		case 6: // PICTURE
			if !hasCover {
				parsePicture(data, meta, &hasCover)
			}
		}

		if isLast {
			break
		}
	}

	return meta, nil
}

func parseVorbisComment(data []byte, meta *Metadata) {
	if len(data) < 4 {
		return
	}
	vendorLen := binary.LittleEndian.Uint32(data[0:4])
	if int(4+vendorLen) > len(data) {
		return
	}
	offset := int(4 + vendorLen)
	
	if offset+4 > len(data) {
		return
	}
	listLen := binary.LittleEndian.Uint32(data[offset : offset+4])
	offset += 4

	var artists []string
	for i := 0; i < int(listLen); i++ {
		if offset+4 > len(data) {
			break
		}
		commentLen := binary.LittleEndian.Uint32(data[offset : offset+4])
		offset += 4
		if offset+int(commentLen) > len(data) {
			break
		}
		comment := string(data[offset : offset+int(commentLen)])
		offset += int(commentLen)

		parts := strings.SplitN(comment, "=", 2)
		if len(parts) == 2 {
			key := strings.ToUpper(parts[0])
			val := parts[1]
			if key == "TITLE" {
				meta.Title = val
			} else if key == "ARTIST" {
				artists = append(artists, val)
			}
		}
	}

	if len(artists) > 0 {
		meta.Artist = strings.Join(artists, " / ")
	}
}

func parsePicture(data []byte, meta *Metadata, hasCover *bool) {
	if len(data) < 4 {
		return
	}
	picType := binary.BigEndian.Uint32(data[0:4])
	// Usually 3 is Front Cover. We will take any picture if we don't have one,
	// but if we already have one, we only overwrite if it's Front Cover.
	if *hasCover && picType != 3 {
		return
	}

	offset := 4
	if offset+4 > len(data) {
		return
	}
	mimeLen := binary.BigEndian.Uint32(data[offset : offset+4])
	offset += 4
	if offset+int(mimeLen) > len(data) {
		return
	}
	mime := string(data[offset : offset+int(mimeLen)])
	offset += int(mimeLen)

	if offset+4 > len(data) {
		return
	}
	descLen := binary.BigEndian.Uint32(data[offset : offset+4])
	offset += 4
	offset += int(descLen)

	// skip width, height, color depth, colors (16 bytes)
	offset += 16

	if offset+4 > len(data) {
		return
	}
	picLen := binary.BigEndian.Uint32(data[offset : offset+4])
	offset += 4
	if offset+int(picLen) > len(data) {
		return
	}

	meta.CoverData = data[offset : offset+int(picLen)]
	meta.CoverMime = mime
	*hasCover = true
}
