"""Real Keitaro diagnostikasi: ma'lumotnomalar va offerlar (sekretsiz)."""

import asyncio

from app.config import get_settings
from app.keitaro.client import KeitaroClient
from app.keitaro.models import Offer


async def main() -> None:
    settings = get_settings()
    client = KeitaroClient(settings)
    print("API BASE:", settings.api_base_url)
    print("KEY SET:", bool(settings.keitaro_api_key))

    try:
        domains = await client.list_domains()
        print("DOMAINS:", [(d.get("id"), d.get("name")) for d in domains][:20])
    except Exception as exc:
        print("DOMAINS ERROR:", type(exc).__name__, exc)

    try:
        groups = await client.list_groups("campaigns")
        print("GROUPS:", [(g.get("id"), g.get("name")) for g in groups][:20])
    except Exception as exc:
        print("GROUPS ERROR:", type(exc).__name__, exc)

    try:
        sources = await client.list_traffic_sources()
        print("SOURCES:", [(x.get("id"), x.get("name")) for x in sources][:20])
    except Exception as exc:
        print("SOURCES ERROR:", type(exc).__name__, exc)

    try:
        offers = await client.list_offers()
        print("OFFERS COUNT:", len(offers))
        for o in offers[:12]:
            print("  offer:", {k: o.get(k) for k in ("id", "name", "state", "country")})
        bad = []
        for o in offers:
            try:
                Offer.from_dict(o)
            except Exception as exc:
                bad.append((o.get("id"), repr(exc)))
        print("BAD OFFERS (DTO parse):", bad[:10])
    except Exception as exc:
        print("OFFERS ERROR:", type(exc).__name__, exc)

    await client.aclose()


if __name__ == "__main__":
    asyncio.run(main())
