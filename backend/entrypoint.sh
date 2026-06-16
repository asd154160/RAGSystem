#!/bin/bash
set -e

MODELS_DIR="${MODELS_DIR:-/app/models}"

download_model() {
    local repo="$1"
    local name="$2"
    local dest="$MODELS_DIR/$name"

    if [ -f "$dest/config.json" ]; then
        echo "[entrypoint] Model $name already exists, skipping download."
        return 0
    fi

    echo "[entrypoint] Downloading $repo → $dest ..."
    python -c "
import os
from huggingface_hub import snapshot_download
endpoint = os.environ.get('HF_ENDPOINT', 'https://huggingface.co')
print(f'[entrypoint] Using endpoint: {endpoint}')
snapshot_download(
    repo_id='$repo',
    local_dir='$dest',
    local_dir_use_symlinks=False,
    resume_download=True,
    max_workers=4,
    endpoint=endpoint,
)
" || {
        echo "[entrypoint] ERROR: Failed to download $repo."
        echo "[entrypoint] You can manually download it: python scripts/download_models.py"
        echo "[entrypoint] Or set HF_ENDPOINT=https://hf-mirror.com for China mirror."
        exit 1
    }

    echo "[entrypoint] $name downloaded successfully."
}

download_model "BAAI/bge-m3" "bge-m3"
download_model "BAAI/bge-reranker-v2-m3" "bge-reranker-v2-m3"

echo "[entrypoint] All models ready."

# Auto-detect CPU core count for uvicorn workers (capped at 4 for container deployments)
if ! echo "$@" | grep -q -- '--workers'; then
    NPROC=$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 4)
    # Cap workers at 4: nproc returns host CPU count in Docker, which can over-provision DB connections
    NPROC=$(( NPROC > 4 ? 4 : NPROC ))
    echo "[entrypoint] Auto-detected $NPROC CPU cores, setting --workers $NPROC"
    set -- "$@" --workers "$NPROC"
fi

exec "$@"
