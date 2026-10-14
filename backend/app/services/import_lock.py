from collections import defaultdict
from contextlib import contextmanager
from threading import Lock

_locks: defaultdict[tuple[int, str], Lock] = defaultdict(Lock)


@contextmanager
def import_lock(user_id: int, source_type: str):
    lock = _locks[(user_id, source_type)]
    with lock:
        yield
