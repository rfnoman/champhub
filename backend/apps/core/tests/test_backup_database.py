"""`backup_database` against a managed cluster (Phase 13 step 4).

The command shells out to pg_dump, createdb, pg_restore and dropdb; these tests check
the *commands it builds*, which is where managed Postgres differs from a local one. The
dump-and-restore round trip itself is exercised by running the command for real against
the live cluster during the launch checks.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from django.core.management import call_command

from apps.core.management.commands import backup_database


@pytest.fixture
def recorded_commands(monkeypatch, tmp_path):
    """Run the command with every subprocess replaced by a recorder."""
    commands: list[list[str]] = []

    def fake_run(self, command, environment, *, allow_failure=False):
        commands.append(command)
        if command[0] == "pg_dump":
            # The real pg_dump writes the file the command then measures.
            Path(command[command.index("--file") + 1]).write_bytes(b"x" * 2048)
        return type("Result", (), {"returncode": 0, "stdout": "42", "stderr": ""})()

    monkeypatch.setattr(backup_database.Command, "_run", fake_run)
    monkeypatch.setattr(backup_database.Command, "_query", lambda *a, **k: 42)
    return commands, tmp_path


def test_the_scratch_database_is_created_through_the_given_maintenance_database(
    recorded_commands,
):
    """Without this, createdb connects to template1 and DigitalOcean says no."""
    commands, tmp_path = recorded_commands

    call_command("backup_database", "--output-dir", str(tmp_path), "--maintenance-db", "defaultdb")

    for name in ("createdb", "dropdb"):
        built = [c for c in commands if c[0] == name]
        assert built, f"{name} was never called"
        for command in built:
            assert "--maintenance-db" in command
            assert command[command.index("--maintenance-db") + 1] == "defaultdb"


def test_without_the_flag_the_commands_are_left_alone(recorded_commands):
    """A self-hosted Postgres is happy with template1, and must not be changed."""
    commands, tmp_path = recorded_commands

    call_command("backup_database", "--output-dir", str(tmp_path))

    assert not any("--maintenance-db" in command for command in commands)


def test_the_dump_itself_never_goes_through_the_maintenance_database(recorded_commands):
    """`--maintenance-db` is a createdb/dropdb flag; pg_dump would reject it."""
    commands, tmp_path = recorded_commands

    call_command("backup_database", "--output-dir", str(tmp_path), "--maintenance-db", "defaultdb")

    for name in ("pg_dump", "pg_restore"):
        for command in [c for c in commands if c[0] == name]:
            assert "--maintenance-db" not in command
