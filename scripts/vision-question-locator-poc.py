#!/usr/bin/env python3
"""POC: locate exercise questions with a vision model and Pillow ruler overlays.

This is intentionally not wired into SmartClass product code. It takes rendered
page images, draws a visible coordinate grid, asks an OpenAI-compatible vision
chat endpoint for question rectangles, validates the JSON response, and can
write crop previews for manual inspection.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageFont


DEFAULT_MODEL = "google/gemini-2.5-flash"
DEFAULT_BASE_URL = "https://openrouter.ai/api/v1"
GRID_STEP = 0.05
MIN_CONFIDENCE = 0.5
SEGMENT_PADDING_X = 0.02
SEGMENT_PADDING_Y = 0.03


@dataclass(frozen=True)
class PageInput:
    page_number: int
    path: Path


@dataclass(frozen=True)
class Segment:
    q_id: int
    page_number: int
    x: float
    y: float
    width: float
    height: float
    confidence: float
    text: str = ""


def parse_expected_questions(raw: str) -> list[int]:
    values: list[int] = []
    for part in raw.split(","):
        part = part.strip()
        if not part:
            continue
        if "-" in part:
            start_raw, end_raw = part.split("-", 1)
            start = int(start_raw)
            end = int(end_raw)
            if start <= 0 or end < start:
                raise ValueError(f"invalid question range: {part}")
            values.extend(range(start, end + 1))
        else:
            value = int(part)
            if value <= 0:
                raise ValueError(f"invalid question id: {part}")
            values.append(value)
    deduped = list(dict.fromkeys(values))
    if not deduped:
        raise ValueError("expected questions must not be empty")
    return deduped


def page_inputs(paths: list[str]) -> list[PageInput]:
    pages: list[PageInput] = []
    for index, raw_path in enumerate(paths, start=1):
        path = Path(raw_path)
        if not path.is_file():
            raise FileNotFoundError(raw_path)
        pages.append(PageInput(index, path))
    return pages


def draw_ruler_overlay(image: Image.Image, page_number: int) -> Image.Image:
    base = image.convert("RGB")
    draw = ImageDraw.Draw(base, "RGBA")
    width, height = base.size
    font = ImageFont.load_default()

    for value in frange(0, 1 + 1e-9, GRID_STEP):
        x = round(value * width)
        y = round(value * height)
        major = abs((value * 10) - round(value * 10)) < 1e-6
        line_color = (37, 99, 235, 110 if major else 55)
        label_color = (185, 28, 28, 230)

        draw.line([(x, 0), (x, height)], fill=line_color, width=2 if major else 1)
        draw.line([(0, y), (width, y)], fill=line_color, width=2 if major else 1)
        if major:
            label = f"{value:.1f}"
            draw.rectangle((x + 2, 2, x + 38, 15), fill=(255, 255, 255, 210))
            draw.text((x + 4, 4), label, fill=label_color, font=font)
            draw.rectangle((2, y + 2, 38, y + 15), fill=(255, 255, 255, 210))
            draw.text((4, y + 4), label, fill=label_color, font=font)

    draw.rectangle((8, 8, 190, 34), fill=(255, 255, 255, 230), outline=(37, 99, 235, 255))
    draw.text((14, 15), f"PAGE {page_number} — normalized ruler", fill=(15, 23, 42, 255), font=font)
    return base


def frange(start: float, stop: float, step: float):
    value = start
    while value <= stop:
        yield value
        value += step


def image_data_url(image: Image.Image) -> str:
    buffer = BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def prompt(expected_questions: list[int]) -> str:
    return f"""
You locate question boundaries on exercise pages for a student app.

The image includes a blue/red normalized ruler. Coordinates must be normalized
numbers from 0 to 1 relative to the full page image. Use the ruler to estimate
rectangles even when the PDF is scanned/image-only.

Expected question IDs: {expected_questions}

Return only JSON, no markdown, in this exact shape:
{{
  "segments": [
    {{
      "q_id": 1,
      "page_number": 1,
      "x": 0.05,
      "y": 0.10,
      "width": 0.90,
      "height": 0.18,
      "confidence": 0.8,
      "text": "short detected question heading or empty"
    }}
  ],
  "warnings": ["short warning strings"]
}}

Rules:
- Do not invent unexpected question IDs.
- If a question is not visible, omit it and add a warning.
- Prefer the full usable page width for each question rectangle, usually x near
  0.03-0.08 and width near 0.85-0.94. Use narrower rectangles only when the
  page clearly has independent columns.
- Include enough of each question: stem, options, diagrams, shared context, and
  any blank workspace that visually belongs to that question.
- Stop before solution/answer/explanation regions if visible.
- Use multiple segments only if one question spans pages.
- Rectangles must be finite, non-empty, and inside the page.
""".strip()


def call_openai_compatible(
    *,
    base_url: str,
    api_key: str,
    model: str,
    pages: list[tuple[PageInput, Image.Image]],
    expected_questions: list[int],
    timeout: int,
) -> dict[str, Any]:
    content: list[dict[str, Any]] = [{"type": "text", "text": prompt(expected_questions)}]
    for page, image in pages:
        content.append({"type": "text", "text": f"Page {page.page_number}"})
        content.append({"type": "image_url", "image_url": {"url": image_data_url(image)}})

    body = json.dumps({
        "model": model,
        "messages": [{"role": "user", "content": content}],
        "temperature": 0,
        "response_format": {"type": "json_object"},
    }).encode("utf-8")
    request = urllib.request.Request(
        f"{base_url.rstrip('/')}/chat/completions",
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://github.com/lelouvincx/smartclass",
            "X-Title": "SmartClass question locator POC",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")[:1000]
        raise RuntimeError(f"vision provider returned HTTP {error.code}: {detail}") from error

    content_text = payload.get("choices", [{}])[0].get("message", {}).get("content")
    if not isinstance(content_text, str) or not content_text.strip():
        raise RuntimeError("vision provider returned no message content")
    return json.loads(strip_json_fence(content_text))


def strip_json_fence(text: str) -> str:
    stripped = text.strip()
    if not stripped.startswith("```"):
        return stripped
    lines = stripped.splitlines()
    if lines and lines[0].startswith("```"):
        lines = lines[1:]
    if lines and lines[-1].startswith("```"):
        lines = lines[:-1]
    return "\n".join(lines).strip()


def validate_segments(payload: dict[str, Any], expected_questions: list[int], page_count: int) -> tuple[list[Segment], list[str]]:
    expected = set(expected_questions)
    warnings = [str(warning) for warning in payload.get("warnings", []) if str(warning).strip()]
    raw_segments = payload.get("segments")
    if not isinstance(raw_segments, list):
        raise ValueError("response.segments must be an array")

    segments: list[Segment] = []
    seen: set[tuple[int, int, int]] = set()
    per_question_counts: dict[int, int] = {}
    for raw in raw_segments:
        if not isinstance(raw, dict):
            warnings.append("Ignored non-object segment.")
            continue
        try:
            q_id = int(raw["q_id"])
            page_number = int(raw["page_number"])
            x = float(raw["x"])
            y = float(raw["y"])
            width = float(raw["width"])
            height = float(raw["height"])
            confidence = float(raw.get("confidence", 0))
        except (KeyError, TypeError, ValueError):
            warnings.append("Ignored segment with invalid fields.")
            continue

        if q_id not in expected:
            warnings.append(f"Ignored unexpected question {q_id}.")
            continue
        if page_number < 1 or page_number > page_count:
            warnings.append(f"Ignored question {q_id} with invalid page {page_number}.")
            continue
        if not valid_rect(x, y, width, height):
            warnings.append(f"Ignored question {q_id} with invalid rectangle.")
            continue
        if confidence < MIN_CONFIDENCE:
            warnings.append(f"Question {q_id} has low confidence {confidence:.2f}.")

        segment_index = per_question_counts.get(q_id, 0)
        per_question_counts[q_id] = segment_index + 1
        key = (q_id, page_number, segment_index)
        if key in seen:
            warnings.append(f"Ignored duplicate question {q_id} segment {segment_index}.")
            continue
        seen.add(key)
        x, y, width, height = padded_rect(x, y, width, height)
        segments.append(Segment(
            q_id=q_id,
            page_number=page_number,
            x=x,
            y=y,
            width=width,
            height=height,
            confidence=confidence,
            text=str(raw.get("text", "")),
        ))

    detected = {segment.q_id for segment in segments}
    for q_id in expected_questions:
        if q_id not in detected:
            warnings.append(f"Question {q_id} was not located.")
    segments.sort(key=lambda segment: (segment.q_id, segment.page_number, segment.y, segment.x))
    return segments, warnings


def valid_rect(x: float, y: float, width: float, height: float) -> bool:
    values = [x, y, width, height]
    return all(value == value and value not in (float("inf"), float("-inf")) for value in values) \
        and x >= 0 and y >= 0 and width > 0 and height > 0 \
        and x + width <= 1 and y + height <= 1


def padded_rect(x: float, y: float, width: float, height: float) -> tuple[float, float, float, float]:
    left = max(0, x - SEGMENT_PADDING_X)
    top = max(0, y - SEGMENT_PADDING_Y)
    right = min(1, x + width + SEGMENT_PADDING_X)
    bottom = min(1, y + height + SEGMENT_PADDING_Y)
    return (
        round(left, 6),
        round(top, 6),
        round(right - left, 6),
        round(bottom - top, 6),
    )


def write_outputs(
    *,
    output_dir: Path,
    pages: list[tuple[PageInput, Image.Image, Image.Image]],
    segments: list[Segment],
    warnings: list[str],
) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    page_by_number = {page.page_number: (page, original, overlay) for page, original, overlay in pages}
    for page, _original, overlay in pages:
        overlay.save(output_dir / f"page-{page.page_number:03d}-ruler.png")

    crop_records: list[dict[str, Any]] = []
    for index, segment in enumerate(segments, start=1):
        page, original, _overlay = page_by_number[segment.page_number]
        left = round(segment.x * original.width)
        top = round(segment.y * original.height)
        right = round((segment.x + segment.width) * original.width)
        bottom = round((segment.y + segment.height) * original.height)
        crop_path = output_dir / f"q{segment.q_id:03d}-segment-{index:02d}-page-{page.page_number:03d}.png"
        original.crop((left, top, right, bottom)).save(crop_path)
        crop_records.append({
            "q_id": segment.q_id,
            "page_number": segment.page_number,
            "x": segment.x,
            "y": segment.y,
            "width": segment.width,
            "height": segment.height,
            "confidence": segment.confidence,
            "text": segment.text,
            "crop_path": str(crop_path),
        })

    (output_dir / "segments.json").write_text(json.dumps({
        "segments": crop_records,
        "warnings": warnings,
    }, ensure_ascii=False, indent=2) + "\n")


def self_test(output_dir: Path) -> int:
    output_dir.mkdir(parents=True, exist_ok=True)
    source = Image.new("RGB", (1000, 1400), "white")
    draw = ImageDraw.Draw(source)
    draw.text((80, 100), "Câu 1. Read the chart and choose A/B/C/D.", fill="black")
    draw.rectangle((120, 180, 380, 360), outline="black", width=3)
    draw.text((80, 520), "Câu 2. This is another question.", fill="black")
    draw.text((100, 600), "A. One   B. Two   C. Three   D. Four", fill="black")
    input_path = output_dir / "self-test-page.png"
    source.save(input_path)
    overlay = draw_ruler_overlay(source, 1)
    payload = {
        "segments": [
            {"q_id": 1, "page_number": 1, "x": 0.05, "y": 0.05, "width": 0.9, "height": 0.28, "confidence": 0.8},
            {"q_id": 2, "page_number": 1, "x": 0.05, "y": 0.35, "width": 0.9, "height": 0.18, "confidence": 0.75},
        ],
        "warnings": [],
    }
    segments, warnings = validate_segments(payload, [1, 2], 1)
    write_outputs(output_dir=output_dir, pages=[(PageInput(1, input_path), source, overlay)], segments=segments, warnings=warnings)
    print(json.dumps({"segments": len(segments), "warnings": warnings, "output_dir": str(output_dir)}, indent=2))
    return 0


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Vision question locator POC with Pillow ruler overlays")
    parser.add_argument("--pages", nargs="*", default=[], help="Rendered page image paths, in page order")
    parser.add_argument("--expected", default="1-5", help="Expected question IDs, e.g. 1-40 or 1,2,5")
    parser.add_argument("--output-dir", default=".amp/in/artifacts/vision-question-locator-poc", help="Where to write ruler images, crops, and segments.json")
    parser.add_argument("--model", default=os.getenv("VISION_MODEL", DEFAULT_MODEL))
    parser.add_argument("--base-url", default=os.getenv("VISION_BASE_URL", os.getenv("OPENROUTER_BASE_URL", DEFAULT_BASE_URL)))
    parser.add_argument("--api-key-env", default="VISION_API_KEY", help="Env var holding the API key; falls back to OPENROUTER_API_KEY")
    parser.add_argument("--timeout", type=int, default=90)
    parser.add_argument("--self-test", action="store_true", help="Run without a vision provider using a generated synthetic page")
    args = parser.parse_args(argv)

    output_dir = Path(args.output_dir)
    if args.self_test:
        return self_test(output_dir)

    expected_questions = parse_expected_questions(args.expected)
    inputs = page_inputs(args.pages)
    if not inputs:
        raise SystemExit("--pages is required unless --self-test is used")

    pages: list[tuple[PageInput, Image.Image, Image.Image]] = []
    model_pages: list[tuple[PageInput, Image.Image]] = []
    for page in inputs:
        original = Image.open(page.path).convert("RGB")
        overlay = draw_ruler_overlay(original, page.page_number)
        pages.append((page, original, overlay))
        model_pages.append((page, overlay))

    api_key = os.getenv(args.api_key_env) or os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        raise SystemExit(f"Set {args.api_key_env} or OPENROUTER_API_KEY to call the vision provider")

    payload = call_openai_compatible(
        base_url=args.base_url,
        api_key=api_key,
        model=args.model,
        pages=model_pages,
        expected_questions=expected_questions,
        timeout=args.timeout,
    )
    segments, warnings = validate_segments(payload, expected_questions, len(inputs))
    write_outputs(output_dir=output_dir, pages=pages, segments=segments, warnings=warnings)
    print(json.dumps({
        "model": args.model,
        "segments": len(segments),
        "warnings": warnings,
        "output_dir": str(output_dir),
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
