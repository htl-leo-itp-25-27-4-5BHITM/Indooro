"""Tests fuer backup_postgres.py. Kein kubectl: der runner ist ein Fake."""

import argparse
import contextlib
import hashlib
import io
import subprocess
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

import backup_postgres as bp

NOW = datetime(2026, 10, 17, 8, 5, 9, tzinfo=timezone.utc)
VALID_PAYLOAD = b"PGDMP" + b"\x00" * 2000


class FakeRunner:
    """Simuliert kubectl: schreibt payload in stdout und liefert returncode."""

    def __init__(self, payload=VALID_PAYLOAD, returncode=0, raises=None):
        self.payload = payload
        self.returncode = returncode
        self.raises = raises
        self.calls = []

    def __call__(self, command, **kwargs):
        self.calls.append((list(command), kwargs))
        if self.raises:
            raise self.raises
        kwargs["stdout"].write(self.payload)
        return subprocess.CompletedProcess(command, self.returncode)


def run_main(argv, runner, now=NOW):
    out = io.StringIO()
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(io.StringIO()):
        code = bp.main(argv, runner=runner, now=now)
    return code, out.getvalue()


class DumpNameTest(unittest.TestCase):

    def test_plain_name_with_utc_date(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = bp.dump_file_path(Path(tmp), NOW)
            self.assertEqual(path.name, "2026-10-17-indooro.dump")

    def test_existing_file_gets_hhmmss_suffix(self):
        with tempfile.TemporaryDirectory() as tmp:
            Path(tmp, "2026-10-17-indooro.dump").write_bytes(b"x")
            path = bp.dump_file_path(Path(tmp), NOW)
            self.assertEqual(path.name, "2026-10-17-indooro-080509.dump")


class CommandTest(unittest.TestCase):

    def test_exact_kubectl_argument_list(self):
        self.assertEqual(
            bp.build_pg_dump_command("student-it220209", "postgres"),
            ["kubectl", "-n", "student-it220209", "exec", "deploy/postgres", "--",
             "sh", "-c", 'pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB"'],
        )

    def test_dry_run_prints_command_and_creates_nothing(self):
        with tempfile.TemporaryDirectory() as tmp:
            out_dir = Path(tmp, "backups")
            runner = FakeRunner()
            code, out = run_main(["--dry-run", "--out-dir", str(out_dir)], runner)
            self.assertEqual(code, 0)
            self.assertIn("kubectl", out)
            self.assertIn("pg_dump -Fc", out)
            self.assertIn("2026-10-17-indooro.dump", out)
            self.assertFalse(out_dir.exists())
            self.assertEqual(runner.calls, [])

    def test_invalid_namespace_is_rejected(self):
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as cm:
            bp.main(["--namespace", "Bad_Name; rm"], runner=FakeRunner())
        self.assertEqual(cm.exception.code, 2)


class ValidateDumpTest(unittest.TestCase):

    def write(self, tmp, data):
        path = Path(tmp, "x.dump")
        path.write_bytes(data)
        return path

    def test_valid_magic_and_size(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(bp.validate_dump_file(self.write(tmp, VALID_PAYLOAD)), [])

    def test_wrong_magic(self):
        with tempfile.TemporaryDirectory() as tmp:
            problems = bp.validate_dump_file(self.write(tmp, b"XXXXX" + b"\x00" * 2000))
            self.assertEqual(len(problems), 1)
            self.assertIn("PGDMP", problems[0])

    def test_too_small_even_with_magic(self):
        with tempfile.TemporaryDirectory() as tmp:
            problems = bp.validate_dump_file(self.write(tmp, b"PGDMP" + b"\x00" * 100))
            self.assertEqual(len(problems), 1)
            self.assertIn("zu klein", problems[0])

    def test_exactly_1024_bytes_is_too_small(self):
        with tempfile.TemporaryDirectory() as tmp:
            data = b"PGDMP" + b"\x00" * (1024 - 5)
            self.assertTrue(bp.validate_dump_file(self.write(tmp, data)))

    def test_missing_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertTrue(bp.validate_dump_file(Path(tmp, "gibt-es-nicht.dump")))


class MainTest(unittest.TestCase):

    def test_success_streams_dump_and_prints_hash(self):
        with tempfile.TemporaryDirectory() as tmp:
            runner = FakeRunner()
            code, out = run_main(["--out-dir", tmp], runner)
            self.assertEqual(code, 0)
            target = Path(tmp, "2026-10-17-indooro.dump")
            self.assertEqual(target.read_bytes(), VALID_PAYLOAD)
            expected_hash = hashlib.sha256(VALID_PAYLOAD).hexdigest()
            self.assertIn(expected_hash, out)
            self.assertIn(str(len(VALID_PAYLOAD)), out)
            command, kwargs = runner.calls[0]
            self.assertEqual(command[0], "kubectl")
            self.assertIn("deploy/postgres", command)
            self.assertIsNone(kwargs["stderr"])
            self.assertTrue(hasattr(kwargs["stdout"], "write"))

    def test_kubectl_failure_removes_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            code, _ = run_main(["--out-dir", tmp], FakeRunner(returncode=1))
            self.assertEqual(code, 1)
            self.assertFalse(Path(tmp, "2026-10-17-indooro.dump").exists())

    def test_invalid_output_removes_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            code, _ = run_main(["--out-dir", tmp], FakeRunner(payload=b"kaputt" * 500))
            self.assertEqual(code, 1)
            self.assertFalse(Path(tmp, "2026-10-17-indooro.dump").exists())

    def test_missing_kubectl_returns_1(self):
        with tempfile.TemporaryDirectory() as tmp:
            runner = FakeRunner(raises=FileNotFoundError("kubectl"))
            code, _ = run_main(["--out-dir", tmp], runner)
            self.assertEqual(code, 1)
            self.assertEqual(list(Path(tmp).iterdir()), [])

    def test_existing_target_is_never_overwritten(self):
        with tempfile.TemporaryDirectory() as tmp:
            Path(tmp, "2026-10-17-indooro.dump").write_bytes(b"alt")
            Path(tmp, "2026-10-17-indooro-080509.dump").write_bytes(b"alt2")
            runner = FakeRunner()
            code, _ = run_main(["--out-dir", tmp], runner)
            self.assertEqual(code, 1)
            self.assertEqual(Path(tmp, "2026-10-17-indooro.dump").read_bytes(), b"alt")
            self.assertEqual(runner.calls, [])


if __name__ == "__main__":
    unittest.main()
