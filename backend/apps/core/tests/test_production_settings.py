"""Production settings read what the deployment gives them (Phase 13 step 0).

The test suite runs on `config.settings.test`, so nothing else would notice if
`config.settings.prod` silently dropped a variable: the first anyone would hear of it
is a managed database refusing an unencrypted connection, or mail going nowhere. These
import the real production module in a fresh interpreter, because settings are read
once at import and cannot be re-read inside this one.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest
from rest_framework.settings import api_settings
from rest_framework.test import APIRequestFactory
from rest_framework.throttling import AnonRateThrottle

BACKEND_DIR = Path(__file__).resolve().parents[3]

#: Enough for `config.settings.prod` to import at all.
REQUIRED = {"DJANGO_SECRET_KEY": "test-only", "DJANGO_ALLOWED_HOSTS": "api.example.test"}

#: Variables the tests set or that would change the answer if inherited from the shell
#: or from a developer's backend/.env (which `environ.Env.read_env` loads with
#: `setdefault`, so anything set here wins over it).
CONTROLLED = [
    "DJANGO_SETTINGS_MODULE",
    "DJANGO_EMAIL_BACKEND",
    "POSTGRES_POOL",
    "POSTGRES_SSLMODE",
    "POSTGRES_SSLROOTCERT",
    "POSTGRES_CONN_MAX_AGE",
    "POSTGRES_BEHIND_PGBOUNCER",
    "DRF_NUM_PROXIES",
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_USERNAME",
    "SMTP_PASSWORD",
    "SMTP_USE_TLS",
    "SMTP_USE_SSL",
    "SMTP_TIMEOUT",
]


def load_prod_settings(**overrides: str) -> dict:
    """Import config.settings.prod in a subprocess and return the values under test."""
    environment = {k: v for k, v in os.environ.items() if k not in CONTROLLED}
    environment.update(REQUIRED)
    environment.update(overrides)
    script = (
        "import json, config.settings.prod as s; "
        "db = s.DATABASES['default']; "
        "print(json.dumps({"
        "'db_options': db['OPTIONS'], "
        "'conn_max_age': db['CONN_MAX_AGE'], "
        "'no_server_cursors': db.get('DISABLE_SERVER_SIDE_CURSORS', False), "
        "'mailers': s.MAILERS, "
        "'num_proxies': s.REST_FRAMEWORK.get('NUM_PROXIES'), "
        "}))"
    )
    result = subprocess.run(
        [sys.executable, "-c", script],
        cwd=BACKEND_DIR,
        env=environment,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout.strip().splitlines()[-1])


def load_prod_settings_failure(**overrides: str) -> str:
    environment = {k: v for k, v in os.environ.items() if k not in CONTROLLED}
    environment.update(REQUIRED)
    environment.update(overrides)
    result = subprocess.run(
        [sys.executable, "-c", "import config.settings.prod"],
        cwd=BACKEND_DIR,
        env=environment,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode != 0, "expected the settings import to fail"
    return result.stderr


class TestDatabase:
    def test_defaults_suit_a_self_hosted_database(self):
        loaded = load_prod_settings()
        assert loaded["db_options"] == {"pool": True, "sslmode": "prefer"}
        assert loaded["conn_max_age"] == 60
        assert loaded["no_server_cursors"] is False

    def test_managed_postgres_behind_pgbouncer(self):
        loaded = load_prod_settings(
            POSTGRES_POOL="false",
            POSTGRES_SSLMODE="require",
            POSTGRES_CONN_MAX_AGE="0",
            POSTGRES_BEHIND_PGBOUNCER="true",
        )
        # The pooler is the pool, the connection is encrypted, and no server-side
        # cursor is declared that the next transaction could not see.
        assert loaded["db_options"] == {"pool": False, "sslmode": "require"}
        assert loaded["conn_max_age"] == 0
        assert loaded["no_server_cursors"] is True

    def test_verify_full_carries_the_ca_certificate(self):
        loaded = load_prod_settings(
            POSTGRES_SSLMODE="verify-full", POSTGRES_SSLROOTCERT="/certs/do-ca.crt"
        )
        assert loaded["db_options"]["sslmode"] == "verify-full"
        assert loaded["db_options"]["sslrootcert"] == "/certs/do-ca.crt"


class TestMail:
    def test_console_backend_needs_no_server(self):
        loaded = load_prod_settings()
        assert loaded["mailers"]["default"] == {
            "BACKEND": "django.core.mail.backends.console.EmailBackend",
            "OPTIONS": {},
        }

    def test_smtp_reads_its_server_from_the_environment(self):
        loaded = load_prod_settings(
            DJANGO_EMAIL_BACKEND="django.core.mail.backends.smtp.EmailBackend",
            SMTP_HOST="smtp.resend.com",
            SMTP_USERNAME="resend",
            SMTP_PASSWORD="re_secret",
        )
        assert loaded["mailers"]["default"]["OPTIONS"] == {
            "host": "smtp.resend.com",
            "port": 587,
            "username": "resend",
            "password": "re_secret",
            "use_tls": True,
            "use_ssl": False,
            "timeout": 10,
        }

    def test_smtp_without_a_host_refuses_to_start(self):
        # Better a deploy that fails at boot than one that runs for a week with every
        # notification email raising inside a Celery task.
        environment = {"DJANGO_EMAIL_BACKEND": "django.core.mail.backends.smtp.EmailBackend"}
        stderr = load_prod_settings_failure(**environment)
        assert "SMTP_HOST" in stderr

    def test_no_deprecated_email_settings_are_defined(self):
        # Django raises ImproperlyConfigured when MAILERS and EMAIL_* are both present
        # (DECISIONS D18), so the SMTP details must not arrive under EMAIL_* names.
        import config.settings.base as base

        assert not [name for name in dir(base) if name.startswith("EMAIL_")]


class TestClientAddress:
    def test_production_trusts_one_proxy(self):
        assert load_prod_settings()["num_proxies"] == 1
        assert load_prod_settings(DRF_NUM_PROXIES="2")["num_proxies"] == 2

    @pytest.mark.parametrize(
        ("forwarded_for", "expected"),
        [
            # Caddy overwrites the header with CF-Connecting-IP: one address.
            ("203.0.113.7", "203.0.113.7"),
            # A client that sends its own header gets it prepended to, never trusted.
            ("6.6.6.6, 203.0.113.7", "203.0.113.7"),
        ],
    )
    def test_the_throttle_keys_on_the_address_our_proxy_saw(
        self, monkeypatch, forwarded_for, expected
    ):
        monkeypatch.setattr(api_settings, "NUM_PROXIES", 1)
        request = APIRequestFactory().get(
            "/api/v1/health", HTTP_X_FORWARDED_FOR=forwarded_for, REMOTE_ADDR="10.0.0.2"
        )
        assert AnonRateThrottle().get_ident(request) == expected

    def test_without_num_proxies_a_forged_header_is_a_fresh_bucket(self, monkeypatch):
        # Why production sets it: DRF's default keys on the whole header, which the
        # client writes.
        monkeypatch.setattr(api_settings, "NUM_PROXIES", None)
        throttle = AnonRateThrottle()
        factory = APIRequestFactory()
        first = factory.get("/", HTTP_X_FORWARDED_FOR="1.1.1.1", REMOTE_ADDR="10.0.0.2")
        second = factory.get("/", HTTP_X_FORWARDED_FOR="2.2.2.2", REMOTE_ADDR="10.0.0.2")
        assert throttle.get_ident(first) != throttle.get_ident(second)
