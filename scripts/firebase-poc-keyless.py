"""Run only in the explicitly approved Cloud Shell session; never creates keys.

Commands: python3 firebase-poc-keyless.py setup|mint|cleanup
Source gcloud credentials stay in Cloud Shell memory. The emitted credential file
contains only a 900-second impersonated access token. No source token is saved.
"""
import datetime
import json
import pathlib
import subprocess
import sys
import urllib.request
import urllib.error

PROJECT = 'randomtools-firebase-poc'
ACCOUNT = 'randomtoolshq@gmail.com'
SA = 'randomtools-poc-auth-tests@' + PROJECT + '.iam.gserviceaccount.com'
ROOT = pathlib.Path.home() / '.randomtools-phase91'
ROLE = 'projects/' + PROJECT + '/roles/'


def require(condition, message):
    # Do not use assert for authorization/billing guards: python -O removes it.
    if not condition:
        raise RuntimeError(message)


def cli(*args):
    r = subprocess.run(['gcloud', *args], capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError('Google command failed: ' + ' '.join(args[:3]) +
                           '; billing mentioned=' + str('billing' in r.stderr.lower()))
    return r.stdout.strip()


def save(name, value):
    path = ROOT / name
    path.write_text(json.dumps(value, indent=2))
    path.chmod(0o600)


def bindings(policy):
    return sorted(json.dumps({**b, 'members': sorted(b['members'])}, sort_keys=True)
                  for b in policy.get('bindings', []))


def mint():
    source = cli('auth', 'print-access-token')
    req = urllib.request.Request(
        'https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/' + SA + ':generateAccessToken',
        data=json.dumps({'scope': ['https://www.googleapis.com/auth/cloud-platform'], 'lifetime': '900s'}).encode(),
        headers={'Authorization': 'Bearer ' + source, 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=30) as response:
        value = json.load(response)
    expiry = datetime.datetime.fromisoformat(value['expireTime'].replace('Z', '+00:00'))
    save('admin-access.json', {'projectId': PROJECT, 'accessToken': value['accessToken'],
                               'expiresAt': int(expiry.timestamp() * 1000)})
    print(json.dumps({'project': PROJECT, 'serviceAccount': SA, 'lifetimeSeconds': 900,
                      'credentialFile': str(ROOT / 'admin-access.json'), 'noPrivateKey': True}))


require(cli('config', 'get-value', 'project') == PROJECT, 'Exact isolated project required')
require(cli('auth', 'list', '--filter=status:ACTIVE', '--format=value(account)') == ACCOUNT,
        'Exact approved operator required')
billing = json.loads(cli('billing', 'projects', 'describe', PROJECT, '--format=json'))
require(billing.get('billingEnabled') is False and not billing.get('billingAccountName'),
        'Billing must remain disabled and unattached')
action = sys.argv[1]
if action == 'setup':
    require(not ROOT.exists(), 'Existing setup requires ledger review; never overwrite it')
    existing = json.loads(cli('iam', 'service-accounts', 'list', '--project=' + PROJECT, '--format=json'))
    require(all(a['email'] != SA for a in existing), 'Existing test service account requires review')
    roles = json.loads(cli('iam', 'roles', 'list', '--project=' + PROJECT, '--format=json'))
    require(all(r['name'] not in (ROLE + 'randomtoolsPocAuthTests', ROLE + 'randomtoolsPocAccessTokenMinter') for r in roles),
            'Existing test roles require review')
    ROOT.mkdir(mode=0o700)
    expiry = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=2)
    condition = 'expression=request.time < timestamp("' + expiry.strftime('%Y-%m-%dT%H:%M:%SZ') + '"),title=RandomToolsPhase91'
    ledger = {'project': PROJECT, 'serviceAccount': SA, 'condition': condition, 'createdRoles': [],
              'serviceAccountCreated': False, 'authBinding': False, 'mintBinding': False,
              'policyBefore': json.loads(cli('projects', 'get-iam-policy', PROJECT, '--format=json')),
              'accountsBefore': sorted(a['email'] for a in existing)}
    save('ledger.json', ledger)
    cli('iam', 'service-accounts', 'create', 'randomtools-poc-auth-tests', '--project=' + PROJECT,
        '--display-name=Temporary RandomTools synthetic Auth tests')
    ledger['serviceAccountCreated'] = True
    save('ledger.json', ledger)
    for name, permissions in [
        ('randomtoolsPocAuthTests', 'firebaseauth.users.get,firebaseauth.users.sendEmail,firebaseauth.users.update,firebaseauth.users.delete'),
        ('randomtoolsPocAccessTokenMinter', 'iam.serviceAccounts.getAccessToken')]:
        cli('iam', 'roles', 'create', name, '--project=' + PROJECT, '--title=' + name,
            '--stage=GA', '--permissions=' + permissions)
        ledger['createdRoles'].append(name)
        save('ledger.json', ledger)
    cli('projects', 'add-iam-policy-binding', PROJECT, '--member=serviceAccount:' + SA,
        '--role=' + ROLE + 'randomtoolsPocAuthTests', '--condition=' + condition, '--quiet')
    ledger['authBinding'] = True
    save('ledger.json', ledger)
    cli('iam', 'service-accounts', 'add-iam-policy-binding', SA, '--project=' + PROJECT,
        '--member=user:' + ACCOUNT, '--role=' + ROLE + 'randomtoolsPocAccessTokenMinter', '--condition=' + condition, '--quiet')
    ledger['mintBinding'] = True
    save('ledger.json', ledger)
    mint()
elif action == 'mint':
    ledger = json.loads((ROOT / 'ledger.json').read_text())
    require(ledger['project'] == PROJECT and ledger['serviceAccount'] == SA and ledger['mintBinding'],
            'An approved scoped setup ledger is required')
    mint()
elif action == 'cleanup':
    ledger = json.loads((ROOT / 'ledger.json').read_text())
    require(ledger['project'] == PROJECT and ledger['serviceAccount'] == SA,
            'An exact scoped cleanup ledger is required')
    condition = ledger['condition']
    if ledger['mintBinding']:
        cli('iam', 'service-accounts', 'remove-iam-policy-binding', SA, '--project=' + PROJECT,
            '--member=user:' + ACCOUNT, '--role=' + ROLE + 'randomtoolsPocAccessTokenMinter', '--condition=' + condition, '--quiet')
        ledger['mintBinding'] = False
        save('ledger.json', ledger)
    if ledger['authBinding']:
        cli('projects', 'remove-iam-policy-binding', PROJECT, '--member=serviceAccount:' + SA,
            '--role=' + ROLE + 'randomtoolsPocAuthTests', '--condition=' + condition, '--quiet')
        ledger['authBinding'] = False
        save('ledger.json', ledger)
    if ledger['serviceAccountCreated']:
        cli('iam', 'service-accounts', 'disable', SA, '--project=' + PROJECT, '--quiet')
        cli('iam', 'service-accounts', 'delete', SA, '--project=' + PROJECT, '--quiet')
        ledger['serviceAccountCreated'] = False
        save('ledger.json', ledger)
    for name in ledger['createdRoles'][:]:
        cli('iam', 'roles', 'delete', name, '--project=' + PROJECT, '--quiet')
        ledger['createdRoles'].remove(name)
        save('ledger.json', ledger)
    token_denied = None
    token_path = ROOT / 'admin-access.json'
    if token_path.exists():
        access = json.loads(token_path.read_text())['accessToken']
        request = urllib.request.Request('https://identitytoolkit.googleapis.com/v1/projects/' + PROJECT + '/accounts:lookup',
            data=json.dumps({'localId': ['phase92-revocation-probe-not-a-user']}).encode(),
            headers={'Authorization': 'Bearer ' + access, 'Content-Type': 'application/json'})
        try:
            with urllib.request.urlopen(request, timeout=20):
                token_denied = False
        except urllib.error.HTTPError as error:
            token_denied = error.code in (401, 403)
        if token_denied:
            token_path.unlink()
    policy_after = json.loads(cli('projects', 'get-iam-policy', PROJECT, '--format=json'))
    accounts_after = json.loads(cli('iam', 'service-accounts', 'list', '--project=' + PROJECT, '--format=json'))
    preserved = bindings(policy_after) == bindings(ledger['policyBefore']) and sorted(a['email'] for a in accounts_after) == ledger['accountsBefore']
    save('cleanup-evidence.json', {'project': PROJECT, 'unrelatedIamPreserved': preserved, 'temporaryTokenDenied': token_denied})
    print(json.dumps({'project': PROJECT, 'temporaryBindingsRemoved': True, 'temporaryServiceAccountRemoved': True,
                      'customRolesDeleted': True, 'remoteTokenFileRemoved': not token_path.exists(),
                      'unrelatedIamPreserved': preserved, 'temporaryTokenDenied': token_denied}))
    require(preserved, 'IAM baseline mismatch needs operator review')
    require(token_denied is not False, 'Token denial not yet verified; wait for expiry and recheck')
else:
    raise RuntimeError('Use setup, mint or cleanup')
