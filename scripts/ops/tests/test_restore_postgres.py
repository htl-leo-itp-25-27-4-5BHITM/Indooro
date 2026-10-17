"""Tests fuer restore_postgres.py. Kein Docker: der runner ist ein Fake."""

import argparse
import contextlib
import io
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import restore_postgres as rp

PROJECT = "indooro-restore"
PASSWORD = "test-pass-1234-abcdef"
DUMP_BYTES = b"PGDMP" + b"\x00" * 2000


def clean_env(**extra):
    """Umgebung ohne RESTORE_*-Variablen, damit Tests reproduzierbar bleiben."""
    base = {k: v for k, v in os.environ.items() if not k.startswith("RESTORE_")}
    base.update(extra)
    return base


class FakeDocker:
    """Simuliert docker compose. pg_isready liefert ready_after Fehlschlaege zuerst."""

    def __init__(self, ready_after=0, restore_rc=0, up_rc=0):
        self.ready_after = ready_after
        self.restore_rc = restore_rc
        self.up_rc = up_rc
        self.calls = []

    def __call__(self, command, **kwargs):
        self.calls.append((list(command), kwargs))
        verb = self._verb(command)
        if verb == "up":
            return subprocess.CompletedProcess(command, self.up_rc)
        if verb == "pg_isready":
            self.ready_after -= 1
            return subprocess.CompletedProcess(command, 0 if self.ready_after < 0 else 2)
        if verb == "pg_restore":
            kwargs["stdin"].read(1)  # Dump wird als stdin uebergeben
            return subprocess.CompletedProcess(command, self.restore_rc)
        if verb == "psql":
            return subprocess.CompletedProcess(command, 0, stdout="7\n", stderr="")
        return subprocess.CompletedProcess(command, 0)

    @staticmethod
    def _verb(command):
        if "pg_isready" in command:
            return "pg_isready"
        if "pg_restore" in command:
            return "pg_restore"
        if "psql" in command:
            return "psql"
        if "up" in command:
            return "up"
        return "other"

    def commands(self):
        return [command for command, _ in self.calls]


def run_main(argv, runner, env=None, sleep=None, clock=None):
    out = io.StringIO()
    err = io.StringIO()
    fake_clock = clock or _FakeClock()
    with mock.patch.dict(os.environ, env if env is not None else clean_env(), clear=True), \
            contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        code = rp.main(argv, runner=runner, sleep=sleep or (lambda s: None), clock=fake_clock)
    return code, out.getvalue(), err.getvalue()


class _FakeClock:
    def __init__(self, step=0.0):
        self.now = 0.0
        self.step = step

    def __call__(self):
        self.now += self.step
        return self.now


class ArgumentTest(unittest.TestCase):

    def setUp(self):
        self.parser = rp.build_parser()

    def test_defaults(self):
        args = self.parser.parse_args(["backups/x.dump"])
        self.assertEqual(args.dump, "backups/x.dump")
        self.assertEqual(args.project, "indooro-restore")
        self.assertIsNone(args.port)
        self.assertIsNone(args.image)
        self.assertFalse(args.down)

    def test_down_without_dump_is_allowed(self):
        args = self.parser.parse_args(["--down"])
        self.assertTrue(args.down)
        self.assertIsNone(args.dump)

    def test_keep_option_was_removed(self):
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
            self.parser.parse_args(["x.dump", "--keep"])

    def test_invalid_project_is_rejected(self):
        for value in ("Bad Name", "-x", "a/b", ""):
            with self.subTest(value=value), contextlib.redirect_stderr(io.StringIO()), \
                    self.assertRaises(SystemExit):
                self.parser.parse_args(["x.dump", "--project", value])

    def test_port_range(self):
        self.assertEqual(rp.parse_port("55432"), 55432)
        for value in ("0", "80", "70000", "abc"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                rp.parse_port(value)

    def test_resolve_port_prefers_cli_then_env_then_default(self):
        self.assertEqual(rp.resolve_port(60000, {"RESTORE_PORT": "55000"}), 60000)
        self.assertEqual(rp.resolve_port(None, {"RESTORE_PORT": "55000"}), 55000)
        self.assertEqual(rp.resolve_port(None, {}), 55432)

    def test_resolve_image_validates_name(self):
        self.assertEqual(rp.resolve_image(None, {}), "postgres:16-alpine")
        self.assertEqual(rp.resolve_image(None, {"RESTORE_IMAGE": "postgres:16"}), "postgres:16")
        with self.assertRaises(ValueError):
            rp.resolve_image("postgres; rm -rf /", {})

    def test_password_is_random_when_not_set(self):
        first, from_user = rp.resolve_password({})
        second, _ = rp.resolve_password({})
        self.assertFalse(from_user)
        self.assertGreaterEqual(len(first), 20)
        self.assertNotEqual(first, second)

    def test_password_from_env_is_used(self):
        password, from_user = rp.resolve_password({"RESTORE_PASSWORD": PASSWORD})
        self.assertEqual(password, PASSWORD)
        self.assertTrue(from_user)

    def test_short_password_from_env_is_rejected(self):
        with self.assertRaises(ValueError):
            rp.resolve_password({"RESTORE_PASSWORD": "kurz"})


class ValidateDumpTest(unittest.TestCase):

    def test_missing_dump_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertTrue(rp.validate_dump(Path(tmp, "fehlt.dump")))

    def test_wrong_magic_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp, "x.dump")
            path.write_bytes(b"SQL-Dump\n" * 10)
            self.assertTrue(rp.validate_dump(path))

    def test_valid_magic_passes(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp, "x.dump")
            path.write_bytes(DUMP_BYTES)
            self.assertEqual(rp.validate_dump(path), [])


class CommandTest(unittest.TestCase):

    def test_every_command_uses_own_project_name(self):
        commands = [
            rp.build_up_cmd(PROJECT, rp.COMPOSE_FILE),
            rp.build_down_cmd(PROJECT, rp.COMPOSE_FILE),
            rp.build_ready_cmd(PROJECT, rp.COMPOSE_FILE),
            rp.build_restore_cmd(PROJECT, rp.COMPOSE_FILE),
            rp.build_count_cmd(PROJECT, rp.COMPOSE_FILE, "regions"),
        ]
        for command in commands:
            with self.subTest(command=command):
                self.assertEqual(command[:4], ["docker", "compose", "-p", PROJECT])
                self.assertIn("-f", command)

    def test_down_command_has_no_volume_flag(self):
        command = rp.build_down_cmd(PROJECT, rp.COMPOSE_FILE)
        self.assertEqual(command[-1], "down")
        self.assertNotIn("-v", command)
        self.assertNotIn("--volumes", command)
        self.assertNotIn("--remove-orphans", command)

    def test_restore_command_flags(self):
        command = rp.build_restore_cmd(PROJECT, rp.COMPOSE_FILE)
        for flag in ("--no-owner", "--no-privileges", "--clean", "--if-exists", "-U", "indooro",
                     "-d", "indooro"):
            self.assertIn(flag, command)

    def test_count_command_rejects_unknown_table(self):
        with self.assertRaises(ValueError):
            rp.build_count_cmd(PROJECT, rp.COMPOSE_FILE, "users; DROP TABLE x")

    def test_compose_file_has_no_literal_password(self):
        text = rp.COMPOSE_FILE.read_text(encoding="utf-8")
        self.assertIn("${RESTORE_PASSWORD", text)
        self.assertNotIn("POSTGRES_PASSWORD: indooro", text)
        self.assertIn("127.0.0.1:", text)


class MainTest(unittest.TestCase):

    def test_missing_dump_returns_1_and_runs_nothing(self):
        with tempfile.TemporaryDirectory() as tmp:
            docker = FakeDocker()
            code, _, err = run_main([str(Path(tmp, "fehlt.dump"))], docker)
            self.assertEqual(code, 1)
            self.assertIn("nicht gefunden", err)
            self.assertEqual(docker.calls, [])

    def test_invalid_dump_returns_1_and_runs_nothing(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp, "x.dump")
            path.write_bytes(b"nicht pgdmp" * 100)
            docker = FakeDocker()
            code, _, _ = run_main([str(path)], docker)
            self.assertEqual(code, 1)
            self.assertEqual(docker.calls, [])

    def test_full_run_order_and_project_name(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp, "x.dump")
            path.write_bytes(DUMP_BYTES)
            docker = FakeDocker(ready_after=2)
            code, out, _ = run_main([str(path)], docker)
            self.assertEqual(code, 0)
            verbs = [FakeDocker._verb(c) for c in docker.commands()]
            self.assertEqual(verbs[0], "up")
            self.assertEqual(verbs[1:4], ["pg_isready", "pg_isready", "pg_isready"])
            self.assertEqual(verbs[4], "pg_restore")
            self.assertEqual(verbs.count("psql"), len(rp.COUNT_TABLES))
            for command in docker.commands():
                self.assertIn(PROJECT, command)
            self.assertNotIn("-v", [a for c in docker.commands() for a in c])
            self.assertIn("Zeilen je Tabelle", out)
            self.assertIn("regions", out)

    def test_restore_gets_dump_as_stdin(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp, "x.dump")
            path.write_bytes(DUMP_BYTES)
            docker = FakeDocker()
            run_main([str(path)], docker)
            restore_kwargs = next(kw for c, kw in docker.calls if "pg_restore" in c)
            self.assertTrue(hasattr(restore_kwargs["stdin"], "read"))

    def test_password_is_passed_via_env_and_never_printed(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp, "x.dump")
            path.write_bytes(DUMP_BYTES)
            docker = FakeDocker()
            code, out, err = run_main([str(path)], docker,
                                      env=clean_env(RESTORE_PASSWORD=PASSWORD))
            self.assertEqual(code, 0)
            up_kwargs = docker.calls[0][1]
            self.assertEqual(up_kwargs["env"]["RESTORE_PASSWORD"], PASSWORD)
            self.assertNotIn(PASSWORD, out)
            self.assertNotIn(PASSWORD, err)
            self.assertIn("RESTORE_PASSWORD ist gesetzt", out)

    def test_generated_password_is_not_printed(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp, "x.dump")
            path.write_bytes(DUMP_BYTES)
            docker = FakeDocker()
            code, out, err = run_main([str(path)], docker)
            generated = docker.calls[0][1]["env"]["RESTORE_PASSWORD"]
            self.assertNotIn(generated, out + err)

    def test_readiness_timeout_returns_1(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp, "x.dump")
            path.write_bytes(DUMP_BYTES)
            docker = FakeDocker(ready_after=10_000)
            clock = _FakeClock(step=10.0)  # 60 s sind nach wenigen Abfragen vorbei
            code, _, err = run_main([str(path)], docker, clock=clock)
            self.assertEqual(code, 1)
            self.assertIn("nicht bereit", err)
            self.assertFalse(any("pg_restore" in c for c in docker.commands()))

    def test_pg_restore_failure_returns_1_but_still_counts(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp, "x.dump")
            path.write_bytes(DUMP_BYTES)
            docker = FakeDocker(restore_rc=1)
            code, out, err = run_main([str(path)], docker)
            self.assertEqual(code, 1)
            self.assertIn("WARNUNG", err)
            self.assertIn("Zeilen je Tabelle", out)

    def test_missing_docker_returns_1(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp, "x.dump")
            path.write_bytes(DUMP_BYTES)

            def runner(command, **kwargs):
                raise FileNotFoundError("docker")

            code, _, err = run_main([str(path)], runner)
            self.assertEqual(code, 1)
            self.assertIn("docker", err)

    def test_down_runs_only_compose_down_without_volumes(self):
        docker = FakeDocker()
        code, out, _ = run_main(["--down"], docker)
        self.assertEqual(code, 0)
        self.assertEqual(len(docker.calls), 1)
        command = docker.commands()[0]
        self.assertEqual(command[:4], ["docker", "compose", "-p", PROJECT])
        self.assertEqual(command[-1], "down")
        self.assertNotIn("-v", command)
        self.assertNotIn("--volumes", command)
        self.assertIn("Datenbank lag im tmpfs", out)

    def test_down_with_dump_is_rejected(self):
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as cm:
            rp.main(["--down", "x.dump"], runner=FakeDocker())
        self.assertEqual(cm.exception.code, 2)

    def test_no_dump_and_no_down_is_rejected(self):
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as cm:
            rp.main([], runner=FakeDocker())
        self.assertEqual(cm.exception.code, 2)


if __name__ == "__main__":
    unittest.main()
