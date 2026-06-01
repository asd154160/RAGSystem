"""监控指标收集服务 — 内存存储，轻量级"""
import time
import threading
from collections import defaultdict

_lock = threading.Lock()
_timings: dict[str, list[float]] = defaultdict(list)
_counters: dict[str, int] = defaultdict(int)
_started_at = time.time()


def record_timing(name: str, ms: float):
    with _lock:
        _timings[name].append(ms)
        if len(_timings[name]) > 1000:
            _timings[name] = _timings[name][-1000:]


def increment_counter(name: str, n: int = 1):
    with _lock:
        _counters[name] += n


def track_time(name: str):
    """上下文管理器用法: with track_time('retrieve'): ..."""
    class _Tracker:
        def __init__(self, n):
            self.name = n
            self.start = 0
        def __enter__(self):
            self.start = time.time()
        def __exit__(self, *args):
            elapsed = (time.time() - self.start) * 1000
            record_timing(self.name, elapsed)
    return _Tracker(name)


def get_metrics() -> dict:
    with _lock:
        avg_timings = {}
        for name, vals in _timings.items():
            if vals:
                avg_timings[f"{name}_avg_ms"] = round(sum(vals) / len(vals), 1)
                avg_timings[f"{name}_p95_ms"] = round(sorted(vals)[int(len(vals) * 0.95)] if len(vals) >= 20 else max(vals), 1)
                avg_timings[f"{name}_count"] = len(vals)

        recent = {name: vals[-20:] for name, vals in _timings.items()}
        uptime_h = round((time.time() - _started_at) / 3600, 1)

        return {
            "uptime_hours": uptime_h,
            "counters": dict(_counters),
            "averages": avg_timings,
            "recent_timings": recent,
        }


def reset():
    with _lock:
        _timings.clear()
        _counters.clear()
