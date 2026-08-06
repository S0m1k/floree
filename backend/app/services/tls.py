"""Shared TLS context for outbound HTTPS clients.

T-Bank (securepay.tinkoff.ru) serves a certificate chain issued by the
Russian Trusted Root CA (НУЦ Минцифры), which is not part of the standard
certifi bundle — default verification fails with "self-signed certificate
in certificate chain". Instead of disabling verification, we extend the
trust store: certifi's bundle plus the official Минцифры root/sub CAs
(downloaded from gu-st.ru, committed in backend/certs/).

The combined context is a superset of the default one, so it is safe to use
for every outbound client (Posiflora, aQsi) — they keep working today and
survive their own migration to Минцифры certificates tomorrow.
"""

import ssl
from functools import lru_cache
from pathlib import Path

import certifi

_CERTS_DIR = Path(__file__).resolve().parent.parent.parent / "certs"


@lru_cache(maxsize=1)
def outbound_ssl_context() -> ssl.SSLContext:
    ctx = ssl.create_default_context(cafile=certifi.where())
    for pem in sorted(_CERTS_DIR.glob("*.pem")):
        ctx.load_verify_locations(cafile=str(pem))
    return ctx
