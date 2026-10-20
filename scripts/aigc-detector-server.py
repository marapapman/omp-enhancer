#!/usr/bin/env python3
"""Local HTTP service for the AIGC half of the writing-helper ensemble.

The writing-helper plugin is pure JavaScript. It calls this service through
AIGC_DETECTOR_URL with {"text": "...", "language": "zh|en"} and expects
{"aiProbability": 0.0-1.0}.

Run it in an environment with torch and transformers installed:

    python3 scripts/aigc-detector-server.py --port 8765

Default checkpoints are language-routed:
    zh: yuchuantian/AIGC_detector_zhv3
    en: yuchuantian/AIGC_detector_env3

Long inputs are split into overlapping windows and scored by the mean AI
probability. Bind to 127.0.0.1 unless you put an authenticated proxy in front.
"""

import argparse
import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

DEFAULT_MODELS = {
    "zh": "yuchuantian/AIGC_detector_zhv3",
    "en": "yuchuantian/AIGC_detector_env3",
}


class Detector:
    def __init__(self, zh_model, en_model, max_length, stride, device, threads):
        import torch
        from transformers import AutoModelForSequenceClassification, AutoTokenizer

        self.torch = torch
        self.tokenizer_class = AutoTokenizer
        self.model_class = AutoModelForSequenceClassification
        self.models = {"zh": zh_model, "en": en_model}
        self.max_length = max_length
        self.stride = stride
        self.device = device
        self.lock = threading.Lock()
        self.loaded = {}
        torch.set_num_threads(threads)

    def _load(self, language):
        with self.lock:
            cached = self.loaded.get(language)
            if cached is not None:
                return cached
            model_name = self.models[language]
            tokenizer = self.tokenizer_class.from_pretrained(model_name)
            model = self.model_class.from_pretrained(model_name, low_cpu_mem_usage=True)
            model.to(self.device)
            model.eval()
            cached = (tokenizer, model, model.config.id2label)
            self.loaded[language] = cached
            return cached

    def score(self, text, language):
        tokenizer, model, labels = self._load(language)
        ai_index = next(
            (index for index, label in labels.items() if str(label).lower() in {"ai", "fake", "generated"}),
            1,
        )
        encoded = tokenizer(
            text,
            return_tensors="pt",
            truncation=True,
            padding="max_length",
            max_length=self.max_length,
            stride=self.stride,
            return_overflowing_tokens=True,
        )
        input_ids = encoded["input_ids"].to(self.device)
        attention_mask = encoded["attention_mask"].to(self.device)
        probabilities = []
        with self.torch.no_grad():
            for index in range(input_ids.shape[0]):
                logits = model(
                    input_ids=input_ids[index:index + 1],
                    attention_mask=attention_mask[index:index + 1],
                ).logits
                probabilities.append(
                    self.torch.softmax(logits, dim=-1)[0, ai_index].item()
                )
        return {
            "aiProbability": sum(probabilities) / len(probabilities),
            "model": self.models[language],
            "language": language,
            "chunks": len(probabilities),
        }


def infer_language(text):
    cjk = sum(1 for character in text if "\u3400" <= character <= "\u9fff")
    visible = sum(1 for character in text if not character.isspace())
    return "zh" if visible > 0 and cjk / visible >= 0.3 else "en"


def make_handler(detector, token):
    class Handler(BaseHTTPRequestHandler):
        def _send(self, status, payload):
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _authorized(self):
            if not token:
                return True
            return self.headers.get("Authorization") == f"Bearer {token}"

        def do_GET(self):
            if self.path == "/health":
                self._send(200, {"ok": True, "models": detector.models})
                return
            self._send(404, {"error": "not found"})

        def do_POST(self):
            if self.path not in {"/", "/detect"}:
                self._send(404, {"error": "not found"})
                return
            if not self._authorized():
                self._send(401, {"error": "unauthorized"})
                return
            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                length = 0
            if length <= 0 or length > 8 * 1024 * 1024:
                self._send(413, {"error": "request body must be 1 byte to 8 MiB"})
                return
            try:
                payload = json.loads(self.rfile.read(length).decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError):
                self._send(400, {"error": "body must be UTF-8 JSON"})
                return
            text = payload.get("text") if isinstance(payload, dict) else None
            language = payload.get("language") if isinstance(payload, dict) else None
            if not isinstance(text, str) or not text.strip():
                self._send(400, {"error": "text must be a non-empty string"})
                return
            if language not in {"zh", "en"}:
                language = infer_language(text)
            try:
                self._send(200, detector.score(text, language))
            except Exception as error:  # model download or inference failure
                self._send(503, {"error": f"detector unavailable: {error}"})

        def log_message(self, format, *args):
            return

    return Handler


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--zh-model", default=DEFAULT_MODELS["zh"])
    parser.add_argument("--en-model", default=DEFAULT_MODELS["en"])
    parser.add_argument("--max-length", type=int, default=510)
    parser.add_argument("--stride", type=int, default=64)
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--threads", type=int, default=2)
    parser.add_argument("--token", default="", help="optional bearer token required from clients")
    return parser.parse_args()


def main():
    args = parse_args()
    if args.port <= 0 or args.port > 65535:
        raise SystemExit("--port must be between 1 and 65535")
    if args.max_length <= 0 or args.stride < 0 or args.stride >= args.max_length:
        raise SystemExit("require max_length > 0 and 0 <= stride < max_length")
    detector = Detector(
        zh_model=args.zh_model,
        en_model=args.en_model,
        max_length=args.max_length,
        stride=args.stride,
        device=args.device,
        threads=args.threads,
    )
    server = ThreadingHTTPServer((args.host, args.port), make_handler(detector, args.token))
    print(
        f"AIGC detector listening on http://{args.host}:{args.port} "
        f"(zh={args.zh_model}, en={args.en_model})",
        flush=True,
    )
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
