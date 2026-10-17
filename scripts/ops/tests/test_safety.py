"""Sicherheitspruefungen ueber alle Skripte in scripts/ops (ohne Netzwerk)."""

import unittest
from pathlib import Path

OPS_DIR = Path(__file__).resolve().parent.parent
SCRIPTS = sorted(OPS_DIR.glob("*.py"))  # nur die Skripte, nicht tests/


class ScriptSafetyTest(unittest.TestCase):

    def test_scripts_exist(self):
        names = {path.name for path in SCRIPTS}
        self.assertTrue({"backup_postgres.py", "export_products.py", "restore_postgres.py",
                         "pilot_smoke.py"} <= names, names)

    def test_no_down_with_volume_flag_in_any_script(self):
        for path in SCRIPTS:
            text = path.read_text(encoding="utf-8")
            with self.subTest(script=path.name):
                self.assertNotIn("down -v", text)
                self.assertNotIn("down\", \"-v\"", text)
                self.assertNotIn("'-v'", text)
                self.assertNotIn('"-v"', text)
                self.assertNotIn("--volumes", text)

    def test_no_shell_true_and_no_bash_only_calls(self):
        for path in SCRIPTS:
            text = path.read_text(encoding="utf-8")
            with self.subTest(script=path.name):
                self.assertNotIn("shell=True", text)
                self.assertNotIn("os.system", text)

    def test_ops_root_has_no_init_file(self):
        # discover muss scripts/ops als Startverzeichnis nutzen, nicht als Paket.
        self.assertFalse((OPS_DIR / "__init__.py").exists())
        self.assertTrue((OPS_DIR / "tests" / "__init__.py").exists())


if __name__ == "__main__":
    unittest.main()
