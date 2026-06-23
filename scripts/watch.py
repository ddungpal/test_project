#!/usr/bin/env python3
"""팀 대화창 뷰어 — phase의 chat.md를 채팅처럼 실시간으로 본다 (별도 터미널용).

사용법:
    python3 scripts/watch.py [phase-dir]

phase-dir 생략 시 phases/index.json에서 status=running인 phase를 자동 감지한다.
기존 대화를 모두 출력한 뒤 새 메시지를 따라 출력한다. Ctrl-C로 종료.
"""

import json
import sys
import threading
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import chat_view

ROOT = Path(__file__).resolve().parent.parent


def _phase_dirs():
    """chat.md를 가진 phase 디렉토리 이름 목록(이름순)."""
    base = ROOT / "phases"
    if not base.is_dir():
        return []
    return sorted(d.name for d in base.iterdir() if d.is_dir() and (d / "chat.md").exists())


def _detect_running_phase():
    """가장 최근에 갱신된 chat.md의 phase를 반환(=실제로 가장 최근 활동한 phase).

    top-index의 status="running"에 의존하지 않는다 — 새 phase가 top-index에
    등록 안 됐거나 하네스가 끝나면 부정확하기 때문(과거 폴백이 '마지막 항목'이라
    엉뚱한 완료 phase를 봤다). chat.md mtime이 단일 진실 소스다.
    """
    candidates = _phase_dirs()
    if not candidates:
        return None
    return max(candidates, key=lambda name: (ROOT / "phases" / name / "chat.md").stat().st_mtime)


def main():
    arg = sys.argv[1] if len(sys.argv) > 1 else None
    phase = arg or _detect_running_phase()
    if not phase:
        print("phase를 찾을 수 없습니다. 사용법: python3 scripts/watch.py <phase-dir>",
              file=sys.stderr)
        sys.exit(1)

    chat = ROOT / "phases" / phase / "chat.md"
    # 디렉토리/대화파일 존재 검증 — 오타 시 조용히 빈 화면 대신 명확히 알린다.
    if not chat.exists():
        avail = _phase_dirs()
        print(f"⚠ '{phase}' 의 chat.md가 없습니다 (오타?).", file=sys.stderr)
        if avail:
            print(f"  사용 가능한 phase: {', '.join(avail)}", file=sys.stderr)
        sys.exit(1)

    color = sys.stdout.isatty()
    print(f"💬 팀 대화창 — {phase}  (Ctrl-C 종료)\n", flush=True)

    stop = threading.Event()

    def emit(line):
        rendered = chat_view.render_chat_line(line, color=color)
        if rendered:
            print(rendered, flush=True)  # 파이프/리다이렉트에서도 즉시 보이게

    try:
        chat_view.follow(str(chat), stop, emit, start_count=0)
    except KeyboardInterrupt:
        stop.set()
        print("\n(종료)")


if __name__ == "__main__":
    main()
