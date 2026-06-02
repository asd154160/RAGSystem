"""
模型文件下载脚本 — 从 HuggingFace 下载 bge-m3 和 bge-reranker-v2-m3
用法: python scripts/download_models.py
依赖: pip install huggingface_hub
"""
import os
import sys
from pathlib import Path

MODELS = [
    {"repo": "BAAI/bge-m3", "dir": "bge-m3"},
    {"repo": "BAAI/bge-reranker-v2-m3", "dir": "bge-reranker-v2-m3"},
]

ROOT = Path(__file__).resolve().parent.parent
MODELS_DIR = ROOT / "models"


def download():
    try:
        from huggingface_hub import snapshot_download
    except ImportError:
        print("❌ 需要 huggingface_hub。请先运行: pip install huggingface_hub")
        return 1

    MODELS_DIR.mkdir(parents=True, exist_ok=True)

    for m in MODELS:
        dest = MODELS_DIR / m["dir"]
        if dest.exists() and (dest / "config.json").exists():
            print(f"✅ {m['dir']} 已存在，跳过")
            continue

        print(f"📥 正在下载 {m['repo']} → models/{m['dir']} ...")
        try:
            snapshot_download(
                repo_id=m["repo"],
                local_dir=str(dest),
                local_dir_use_symlinks=False,
                resume_download=True,
                max_workers=4,
            )
            print(f"✅ {m['dir']} 下载完成")
        except Exception as e:
            print(f"❌ {m['dir']} 下载失败: {e}")
            print("   手动下载: https://huggingface.co/" + m["repo"])
            return 1

    print("\n✅ 所有模型下载完成")
    return 0


if __name__ == "__main__":
    sys.exit(download())
