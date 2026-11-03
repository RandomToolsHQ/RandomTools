"""Offline guard tests; all gcloud commands are mocked, including reads."""
import contextlib
import io
import json
import pathlib
import runpy
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

HELPER = pathlib.Path(__file__).with_name('firebase-poc-keyless.py')
PROJECT = 'randomtools-firebase-poc'
ACCOUNT = 'randomtoolshq@gmail.com'
SA = 'randomtools-poc-auth-tests@' + PROJECT + '.iam.gserviceaccount.com'


class GuardTests(unittest.TestCase):
    def rejected(self, message, *, project=PROJECT, account=ACCOUNT,
                 billing=False, attached=False, existing_sa=False,
                 existing_role=False):
        def fake_cli(args, **_kwargs):
            command = args[1:]
            if command == ['config', 'get-value', 'project']:
                value = project
            elif command[:2] == ['auth', 'list']:
                value = account
            elif command[:3] == ['billing', 'projects', 'describe']:
                value = json.dumps({'billingEnabled': billing,
                                    'billingAccountName': 'synthetic-billing' if attached else ''})
            elif command[:3] == ['iam', 'service-accounts', 'list']:
                value = json.dumps([{'email': SA}] if existing_sa else [])
            elif command[:3] == ['iam', 'roles', 'list']:
                value = json.dumps([{'name': 'projects/' + PROJECT + '/roles/randomtoolsPocAuthTests'}]
                                   if existing_role else [])
            else:
                self.fail('Unexpected command; no mutations or tokens allowed: ' + ' '.join(command[:3]))
            return subprocess.CompletedProcess(args, 0, value, '')

        with tempfile.TemporaryDirectory() as directory:
            with patch.object(pathlib.Path, 'home', return_value=pathlib.Path(directory)), \
                    patch('subprocess.run', side_effect=fake_cli), \
                    patch.object(sys, 'argv', [str(HELPER), 'setup']), \
                    contextlib.redirect_stdout(io.StringIO()):
                with self.assertRaisesRegex(RuntimeError, message):
                    runpy.run_path(str(HELPER), run_name='__main__')
            self.assertEqual(list(pathlib.Path(directory).iterdir()), [])

    def test_wrong_project(self):
        self.rejected('Exact isolated project', project='unrelated-project')

    def test_wrong_operator(self):
        self.rejected('Exact approved operator', account='unapproved@example.test')

    def test_enabled_or_attached_billing(self):
        self.rejected('Billing must remain disabled', billing=True)
        self.rejected('Billing must remain disabled', attached=True)

    def test_existing_service_account(self):
        self.rejected('Existing test service account', existing_sa=True)

    def test_existing_role(self):
        self.rejected('Existing test roles', existing_role=True)


if __name__ == '__main__':
    unittest.main()
