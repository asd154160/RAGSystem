#!/usr/bin/env python
"""
简单的定时调度器 — 用于 backup-cron 容器
周期性地运行 backup.py，无需 Docker socket 访问
"""
import logging
import os
import subprocess
import sys
import time
from datetime import datetime

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("scheduler")

BACKUP_INTERVAL = int(os.environ.get("BACKUP_INTERVAL_SECONDS", "86400"))  # 默认 24h
BACKUP_OUTPUT = os.environ.get("BACKUP_OUTPUT_DIR", "/backups")


def run_backup():
    logger.info("Scheduled backup starting...")
    try:
        result = subprocess.run(
            [sys.executable, "/app/scripts/backup.py", "-o", BACKUP_OUTPUT],
            capture_output=True, text=True, timeout=3600,
        )
        if result.returncode != 0:
            logger.error("Backup FAILED:\n%s", result.stderr[:2000])
        else:
            logger.info("Backup complete")
            # print last few lines
            for line in result.stdout.strip().split("\n")[-5:]:
                logger.info("  %s", line)
    except Exception as e:
        logger.error("Backup exception: %s", e)


def main():
    logger.info("Backup scheduler started (interval=%ds, output=%s)", BACKUP_INTERVAL, BACKUP_OUTPUT)

    # 启动时立即运行一次
    run_backup()

    while True:
        next_run = datetime.now().timestamp() + BACKUP_INTERVAL
        logger.info("Next backup at %s", datetime.fromtimestamp(next_run).strftime("%Y-%m-%d %H:%M:%S"))
        time.sleep(BACKUP_INTERVAL)
        run_backup()


if __name__ == "__main__":
    main()
