#!/usr/bin/env bash
set -e

# Configuration
BUCKET_NAME="${DAYBOOK_R2_BUCKET:-daybook-media}"
PREFIX="netease"
LOCAL_DIR="content/attachments/netease"

print_usage() {
    echo "Usage:"
    echo "  $0 <song_id>    Upload a single FLAC file"
    echo "  $0 --all        Upload all FLAC files in the local directory"
    echo ""
    echo "Make sure you have run 'npx wrangler login' first."
}

upload_file() {
    local song_id="$1"
    local local_file="$LOCAL_DIR/${song_id}.flac"
    local remote_path="${BUCKET_NAME}/${PREFIX}/${song_id}.flac"

    if [[ ! "$song_id" =~ ^[0-9]+$ ]]; then
        echo "Error: Song ID must be numeric. Received: '$song_id'"
        return 1
    fi

    if [[ ! -f "$local_file" ]]; then
        echo "Error: Local file not found: $local_file"
        return 1
    fi

    echo "Uploading $local_file to R2 at $remote_path ..."
    npx wrangler r2 object put "$remote_path" \
        --file="$local_file" \
        --content-type="audio/flac" \
        --cache-control="public, max-age=604800" \
        --remote
}

if [[ $# -eq 0 ]]; then
    print_usage
    exit 1
fi

if [[ "$1" == "--all" ]]; then
    if [[ ! -d "$LOCAL_DIR" ]]; then
        echo "Directory $LOCAL_DIR does not exist. Nothing to upload."
        exit 0
    fi
    
    count=0
    for file in "$LOCAL_DIR"/*.flac; do
        if [[ -f "$file" ]]; then
            filename=$(basename "$file")
            song_id="${filename%.flac}"
            upload_file "$song_id" || exit 1
            count=$((count + 1))
        fi
    done
    
    if [[ $count -eq 0 ]]; then
        echo "No .flac files found in $LOCAL_DIR."
    else
        echo "Successfully uploaded $count files."
    fi
elif [[ "$1" == "-h" || "$1" == "--help" ]]; then
    print_usage
    exit 0
else
    upload_file "$1" || exit 1
    echo "Successfully uploaded song ID: $1"
fi
