"""Synthetic-only Auth tests inside approved Cloud Shell; prints no credentials.

Uses only the approved short-lived impersonated token. Never exports it, creates
keys, changes IAM, or sends passwords/gateway credentials to Cloud Shell.
"""
import json
import pathlib
import secrets
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

PROJECT = 'randomtools-firebase-poc'
ROOT = pathlib.Path.home() / '.randomtools-phase91'


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def run():
    manifest = json.loads((ROOT / 'remote-fixtures.json').read_text())
    auth = json.loads((ROOT / 'admin-access.json').read_text())
    require(manifest['project'] == PROJECT and auth['projectId'] == PROJECT,
            'Exact isolated project required')
    require(not any(k in auth for k in ['private_key', 'refresh_token', 'type']),
            'Only a short-lived access token is permitted')
    require(0 < auth['expiresAt'] / 1000 - time.time() <= 901,
            'Mint another approved 15-minute token')
    require(set(f['label'] for f in manifest['fixtures']) == {'admin', 'member', 'other'},
            'Exact synthetic fixture labels required')
    require(manifest['runId'].startswith('phase9-') and len(manifest['runId']) == 43,
            'Synthetic run required')
    for f in manifest['fixtures']:
        require(f['email'] == manifest['runId'] + '-' + f['label'] + '@example.com'
                and isinstance(f['uid'], str) and 0 < len(f['uid']) <= 128
                and set(f) == {'label', 'uid', 'email'}, 'Synthetic-only manifest required')

    def post(op, body, privileged=False):
        require(auth['expiresAt'] / 1000 > time.time(), 'Temporary token expired')
        headers = {'Content-Type': 'application/json'}
        if privileged:
            url = 'https://identitytoolkit.googleapis.com/v1/projects/' + PROJECT + '/accounts:' + op
            headers['Authorization'] = 'Bearer ' + auth['accessToken']
        else:
            url = 'https://identitytoolkit.googleapis.com/v1/accounts:' + op + '?key=' + urllib.parse.quote(manifest['apiKey'])
        req = urllib.request.Request(url, data=json.dumps(body).encode(), headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=12) as response:
                raw, status = response.read(65537), response.status
        except urllib.error.HTTPError as response:
            raw, status = response.read(65537), response.code
        require(len(raw) <= 65536, 'Provider response too large')
        result = json.loads(raw)
        if status >= 400:
            code = str(result.get('error', {}).get('message', '')).split(' : ')[0]
            require(len(code) < 100 and all(c.isupper() or c.isdigit() or c == '_' for c in code),
                    'Provider returned an unexpected error')
            return status, {'errorCode': code}
        return status, result

    def successful(op, body, privileged=False):
        status, result = post(op, body, privileged)
        require(status == 200, 'Provider operation rejected: ' + op + ' HTTP ' + str(status)
                + ' ' + result.get('errorCode', ''))
        return result

    def record(f, allow_absent=False):
        d = successful('lookup', {'localId': [f['uid']]}, True).get('users', [])
        if allow_absent and not d:
            return None
        require(len(d) == 1 and d[0]['localId'] == f['uid'] and d[0]['email'] == f['email'],
                'Synthetic identity mismatch')
        return d[0]

    def action_code(f, kind):
        d = successful('sendOobCode', {'requestType': kind, 'email': f['email'],
                                     'returnOobLink': True,
                                     'continueUrl': 'https://randomtools-firebase-poc.pages.dev'}, True)
        link = urllib.parse.urlparse(d['oobLink'])
        q = urllib.parse.parse_qs(link.query)
        expected = 'verifyEmail' if kind == 'VERIFY_EMAIL' else 'resetPassword'
        require(link.scheme == 'https' and link.netloc == PROJECT + '.firebaseapp.com'
                and q.get('mode') == [expected] and len(q.get('oobCode', [])) == 1,
                'Unexpected official action link')
        return q['oobCode'][0]

    action = sys.argv[1]
    label = sys.argv[2] if len(sys.argv) > 2 else None
    targets = manifest['fixtures'] if action in ['verify', 'inspect'] else [
        f for f in manifest['fixtures'] if f['label'] == label]
    require(len(targets) == (3 if action in ['verify', 'inspect'] else 1), 'Exact target required')
    evidence = []
    for f in targets:
        profile = record(f, allow_absent=action == 'delete')
        if action == 'verify':
            print(json.dumps({'label': f['label'], 'stage': 'request-official-verification-action'}), flush=True)
            code = action_code(f, 'VERIFY_EMAIL')
            successful('update', {'oobCode': code})
            require(post('update', {'oobCode': code})[0] == 400, 'Consumed verification code reused')
            require(record(f).get('emailVerified') is True, 'Verification not reflected by provider')
            evidence.append({'label': f['label'], 'officialVerification': True,
                             'singleUseAction': True})
            time.sleep(2)
        elif action in ['disable', 'enable', 'revoke']:
            change = {'disableUser': action == 'disable'} if action != 'revoke' else {'validSince': str(int(time.time()))}
            successful('update', {'localId': f['uid'], **change}, True)
            current = record(f)
            if action != 'revoke':
                require(current.get('disabled', False) == (action == 'disable'), 'Disable state not reflected')
            else:
                require(int(current['validSince']) >= int(change['validSince']), 'Revocation state not reflected')
            evidence.append({'label': f['label'], 'action': action, 'providerStateVerified': True})
        elif action == 'recover':
            require(f['label'] == 'admin', 'Recovery test is restricted to the disposable admin fixture')
            code = action_code(f, 'PASSWORD_RESET')
            require(successful('resetPassword', {'oobCode': code})['email'] == f['email'], 'Reset ownership mismatch')
            first, second = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
            successful('resetPassword', {'oobCode': code, 'newPassword': first})
            require(post('resetPassword', {'oobCode': code})[0] == 400, 'Consumed reset code reused')
            signed = successful('signInWithPassword', {'email': f['email'], 'password': first, 'returnSecureToken': True})
            require(signed['localId'] == f['uid'], 'Recovery sign-in ownership mismatch')
            successful('update', {'idToken': signed['idToken'], 'password': second, 'returnSecureToken': True})
            require(post('signInWithPassword', {'email': f['email'], 'password': first, 'returnSecureToken': True})[0] == 400,
                    'Previous test password still accepted')
            signed = successful('signInWithPassword', {'email': f['email'], 'password': second, 'returnSecureToken': True})
            require(signed['localId'] == f['uid'], 'Changed password sign-in failed')
            evidence.append({'label': f['label'], 'officialRecovery': True, 'resetActionSingleUse': True,
                             'passwordChange': True, 'previousCredentialDenied': True, 'newCredentialAccepted': True})
        elif action == 'delete':
            if profile:
                successful('delete', {'localId': f['uid']}, True)
            require(record(f, allow_absent=True) is None, 'Synthetic deletion not reflected')
            evidence.append({'label': f['label'], 'providerDeleted': True})
        elif action == 'inspect':
            evidence.append({'label': f['label'], 'verified': profile.get('emailVerified', False),
                             'disabled': profile.get('disabled', False), 'revocationBoundaryPresent': 'validSince' in profile})
        else:
            raise RuntimeError('Unsupported synthetic action')
    name = 'auth-' + action + '-' + (label or 'all') + '.json'
    (ROOT / name).write_text(json.dumps({'hosted': True, 'project': PROJECT, 'checks': evidence}, indent=2))
    (ROOT / name).chmod(0o600)
    print(json.dumps({'hosted': True, 'project': PROJECT, 'checks': evidence}))


if __name__ == '__main__':
    try:
        run()
    except Exception as error:
        # No urllib tracebacks: they may include a public API key in a URL.
        print(json.dumps({'failed': True, 'error': str(error) if isinstance(error, RuntimeError) else type(error).__name__}))
        sys.exit(1)
