"""Reject unsafe remote manifests before any network operation, including under -O."""
import json
import pathlib
import runpy
import tempfile
import time
import unittest
from unittest.mock import patch

HELPER = pathlib.Path(__file__).with_name('phase111-remote.py')


class RemoteGuards(unittest.TestCase):
    def rejected(self, mutate, message):
        run_id = 'phase11-00000000-0000-4000-8000-000000000000'
        manifest = {'project': 'randomtools-supabase-auth-poc', 'runId': run_id,
                    'fixtures': [{'label': label, 'uid': 'synthetic-' + label,
                                  'email': run_id + '-' + label + '@example.com'}
                                 for label in ['admin', 'member', 'other']]}
        auth = {'projectId': 'randomtools-supabase-auth-poc', 'accessToken': 'synthetic',
                'expiresAt': int((time.time() + 850) * 1000)}
        mutate(manifest, auth)
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory) / '.randomtools-phase111'
            root.mkdir()
            (root / 'remote-fixtures.json').write_text(json.dumps(manifest))
            (root / 'admin-access.json').write_text(json.dumps(auth))
            with patch.object(pathlib.Path, 'home', return_value=pathlib.Path(directory)), \
                    patch('urllib.request.urlopen') as network:
                module = runpy.run_path(str(HELPER), run_name='guard_test')
                with self.assertRaisesRegex(RuntimeError, message):
                    module['run']()
                network.assert_not_called()

    def test_wrong_project(self):
        self.rejected(lambda m, a: m.update(project='genuine-project'), 'Exact isolated')

    def test_permanent_key(self):
        self.rejected(lambda m, a: a.update(private_key='synthetic'), 'short-lived')

    def test_source_refresh_credential(self):
        self.rejected(lambda m, a: a.update(refresh_token='synthetic'), 'short-lived')

    def test_expired_token(self):
        self.rejected(lambda m, a: a.update(expiresAt=1), '15-minute')

    def test_long_lived_token(self):
        self.rejected(lambda m, a: a.update(expiresAt=int((time.time()+3600)*1000)), '15-minute')

    def test_genuine_email(self):
        self.rejected(lambda m, a: m['fixtures'][0].update(email='owner@example.org'), 'Synthetic-only')

    def test_credentials_in_manifest(self):
        self.rejected(lambda m, a: m['fixtures'][0].update(password='synthetic'), 'Synthetic-only')


if __name__ == '__main__':
    unittest.main()
