"""Offline guard tests; all gcloud commands are mocked, including reads."""
import contextlib
import io
import json
import pathlib
import runpy
import subprocess
import sys
import tempfile
import urllib.error
import unittest
from unittest.mock import patch

HELPER = pathlib.Path(__file__).with_name('phase111-keyless.py')
PROJECT = 'randomtools-supabase-auth-poc'
ACCOUNT = 'randomtoolshq@gmail.com'
SA = 'rt-phase111-auth-tests@' + PROJECT + '.iam.gserviceaccount.com'


class GuardTests(unittest.TestCase):
    def test_invalid_service_account_id_rejected_before_cloud_access(self):
        source = HELPER.read_text().replace('rt-phase111-auth-tests', 'randomtools-phase111-auth-tests')
        with patch('subprocess.run') as cloud:
            with self.assertRaisesRegex(RuntimeError, 'Service-account ID'):
                exec(compile(source, str(HELPER), 'exec'), {'__name__': 'guard_test'})
            cloud.assert_not_called()

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
                value = json.dumps([{'name': 'projects/' + PROJECT + '/roles/randomtoolsPhase111AuthTests'}]
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

    def cleanup_probe(self, denied):
        with tempfile.TemporaryDirectory() as directory:
            home = pathlib.Path(directory)
            root = home / '.randomtools-phase111'
            root.mkdir()
            ledger = {'project': PROJECT, 'serviceAccount': SA, 'condition': 'synthetic',
                      'mintBinding': False, 'authBinding': False, 'serviceAccountCreated': False,
                      'createdRoles': [], 'policyBefore': {'bindings': []}, 'accountsBefore': []}
            (root / 'ledger.json').write_text(json.dumps(ledger))
            (root / 'admin-access.json').write_text(json.dumps({'accessToken': 'synthetic-access-token'}))

            def fake_cli(args, **_kwargs):
                command = args[1:]
                if command[:3] == ['config', 'get-value', 'project']:
                    value = PROJECT
                elif command[:2] == ['auth', 'list']:
                    value = ACCOUNT
                elif command[:3] == ['billing', 'projects', 'describe']:
                    value = json.dumps({'billingEnabled': False})
                elif command[:2] == ['projects', 'get-iam-policy']:
                    value = json.dumps({'bindings': []})
                elif command[:3] == ['iam', 'service-accounts', 'list']:
                    value = '[]'
                else:
                    self.fail('Unexpected cleanup command')
                return subprocess.CompletedProcess(args, 0, value, '')

            outcome = urllib.error.HTTPError('https://identitytoolkit.googleapis.com', 403, 'Forbidden', {}, None) if denied else None
            with patch.object(pathlib.Path, 'home', return_value=home), \
                    patch('subprocess.run', side_effect=fake_cli), \
                    patch('urllib.request.urlopen', side_effect=outcome) as opening, \
                    patch.object(sys, 'argv', [str(HELPER), 'cleanup']), \
                    contextlib.redirect_stdout(io.StringIO()):
                if not denied:
                    opening.return_value.__enter__.return_value = io.BytesIO(b'{}')
                    with self.assertRaisesRegex(RuntimeError, 'Token denial not yet verified'):
                        runpy.run_path(str(HELPER), run_name='__main__')
                else:
                    runpy.run_path(str(HELPER), run_name='__main__')
            self.assertEqual((root / 'admin-access.json').exists(), not denied)
            evidence = json.loads((root / 'cleanup-evidence.json').read_text())
            self.assertIs(evidence['temporaryTokenDenied'], denied)

    def test_keeps_token_for_recheck_until_denial_is_verified(self):
        self.cleanup_probe(False)

    def test_removes_token_after_verified_denial(self):
        self.cleanup_probe(True)


if __name__ == '__main__':
    unittest.main()
