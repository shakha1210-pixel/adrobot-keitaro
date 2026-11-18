"""Демо-эмулятор Keitaro Admin API v1 (в памяти, только стандартная библиотека).

Позволяет запустить и показать Adrobot без доступа к реальному трекеру:
  1) python scripts/mock_keitaro.py            # поднимает http://127.0.0.1:8999
  2) в .env: KEITARO_BASE_URL=http://127.0.0.1:8999, KEITARO_API_KEY=demo
  3) uvicorn app.main:app --reload

Контракт повторяет Admin API v1: https://gist.github.com/asabirov/3cd29f43de41bd76ab93de073a7883a9
"""
from __future__ import annotations

import json
import re
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8999
ROOT = "/admin_api/v1"

OFFERS = [
    {"id": 1, "name": "Nutra Keto (US)", "country": "US", "payout_value": "25.0000",
     "payout_currency": "USD", "state": "active"},
    {"id": 2, "name": "Crypto Casino (DE)", "country": "DE", "payout_value": "180.0000",
     "payout_currency": "EUR", "state": "active"},
    {"id": 3, "name": "VPN Sub (UZ)", "country": "UZ", "payout_value": "4.5000",
     "payout_currency": "USD", "state": "active"},
    {"id": 4, "name": "Sweepstakes (BR)", "country": "BR", "payout_value": "12.0000",
     "payout_currency": "USD", "state": "active"},
    {"id": 5, "name": "Dating Mainstream (PL)", "country": "PL", "payout_value": "8.0000",
     "payout_currency": "USD", "state": "disabled"},
]

DOMAINS = [{"id": 3, "name": "in.posdk.xyz", "state": "active"}]
GROUPS = [{"id": 7, "name": "FORTESTS", "type": "campaigns"}]
SOURCES = [{"id": 5, "name": "FORTESTS"}]

CAMPAIGNS: dict[int, dict] = {}
STREAMS: dict[int, dict] = {}
_next_campaign = 700
_next_stream = 1300


def _stats(stream_id: int, offer_id: int) -> dict:
    """Детерминированная «статистика», чтобы цифры в UI были согласованы."""
    clicks = (offer_id * 37 + stream_id * 53) % 900 + 10
    return {
        "stream_id": str(stream_id),
        "offer_id": str(offer_id),
        "clicks": clicks,
        "stream_unique_clicks": int(clicks * 0.8),
        "bots": clicks % 7,
        "conversions": (clicks * 3) % 40,
        "cr": round(((clicks * 3) % 40) * 100.0 / clicks, 2),
    }


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):  # тихо
        pass

    def _send(self, payload, status: int = 200):
        data = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _body(self) -> dict:
        length = int(self.headers.get("Content-Length") or 0)
        if not length:
            return {}
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def _not_found(self, what: str):
        self._send({"message": f"{what} not found"}, 404)

    # ---------- маршрутизация ----------

    def _route(self, method: str, path: str) -> None:
        path = path.split("?", 1)[0].removeprefix(ROOT)
        m = re.fullmatch(r"/offers/(\d+)", path)
        if path == "/offers" and method == "GET":
            return self._send(OFFERS)
        if m and method == "GET":
            offer = next((o for o in OFFERS if o["id"] == int(m.group(1))), None)
            return self._send(offer) if offer else self._not_found("Offer")
        if path == "/domains" and method == "GET":
            return self._send(DOMAINS)
        if path == "/groups" and method == "GET":
            return self._send(GROUPS)
        if path == "/traffic_sources" and method == "GET":
            return self._send(SOURCES)

        m = re.fullmatch(r"/campaigns/(\d+)/streams", path)
        if m and method == "GET":
            cid = int(m.group(1))
            streams = [s for s in STREAMS.values() if s["campaign_id"] == cid]
            return self._send(streams)
        m = re.fullmatch(r"/campaigns/(\d+)", path)
        if m and method == "GET":
            campaign = CAMPAIGNS.get(int(m.group(1)))
            return self._send(campaign) if campaign else self._not_found("Campaign")
        if m and method == "DELETE":
            cid = int(m.group(1))
            if cid in CAMPAIGNS:
                CAMPAIGNS[cid]["state"] = "deleted"
                return self._send([CAMPAIGNS[cid]])
            return self._not_found("Campaign")
        if path == "/campaigns" and method == "GET":
            return self._send(list(CAMPAIGNS.values()))
        if path == "/campaigns" and method == "POST":
            global _next_campaign
            _next_campaign += 1
            body = self._body()
            campaign = {
                "id": _next_campaign,
                "alias": body.get("alias") or f"c{_next_campaign}",
                "name": body.get("name"),
                "type": body.get("type", "position"),
                "state": "active",
                "domain_id": body.get("domain_id"),
                "group_id": body.get("group_id"),
                "traffic_source_id": body.get("traffic_source_id"),
                "cost_type": body.get("cost_type", "CPC"),
                "cost_value": "0.0000",
                "cost_currency": "USD",
                "cost_auto": False,
                "updated_at": "2026-11-19 10:00:00",
            }
            CAMPAIGNS[_next_campaign] = campaign
            return self._send(campaign)

        m = re.fullmatch(r"/streams/(\d+)", path)
        if m and method == "GET":
            stream = STREAMS.get(int(m.group(1)))
            return self._send(stream) if stream else self._not_found("Stream")
        if m and method == "PUT":
            sid = int(m.group(1))
            if sid not in STREAMS:
                return self._not_found("Stream")
            STREAMS[sid] = self._body()
            return self._send(STREAMS[sid])
        if path == "/streams" and method == "POST":
            global _next_stream
            _next_stream += 1
            body = self._body()
            stream = {**body, "id": _next_stream, "state": body.get("state", "active")}
            STREAMS[_next_stream] = stream
            return self._send(stream)

        if path == "/report/build" and method == "POST":
            rows = []
            for stream in STREAMS.values():
                for offer in stream.get("offers") or []:
                    rows.append(_stats(stream["id"], offer["offer_id"]))
            return self._send({"rows": rows, "total": len(rows), "meta": {"execution_time": "0.001"}})

        self._send({"message": f"Route {method} {path} not found"}, 404)

    def do_GET(self):
        self._route("GET", self.path)

    def do_POST(self):
        self._route("POST", self.path)

    def do_PUT(self):
        self._route("PUT", self.path)

    def do_DELETE(self):
        self._route("DELETE", self.path)


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"Mock Keitaro: http://127.0.0.1:{PORT}{ROOT} (Ctrl+C для остановки)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
