"""Pipeline regressions: temporary outputs and mocked network only."""
import contextlib
import copy
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import urllib.error

ROOT = Path(__file__).resolve().parents[1]


def module(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'pipeline' / (name + '.py'))
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


build = module('build_questions')
deploy = module('deploy_api')


class BuilderTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name)
        self.payload = json.loads((ROOT / 'app/data/questions.json').read_text())
        self.content = {q['id']: {**{k: q[k] for k in ('id', 'question_en', 'asking_note', 'answer_explanation', 'distractor_notes')},
                                  'options_en': [o['text_en'] for o in q['options']]}
                        for q in self.payload['questions']}

    def shard(self, name, records):
        (self.path / name).write_text(json.dumps(records))

    def test_serialization_preserves_both_outputs_exactly(self):
        for name, data in build.serialize_payload(self.payload).items():
            self.assertEqual(data, (ROOT / 'app/data' / name).read_bytes())

    def test_assembly_preserves_core_and_provenance(self):
        core = build.load_core()
        original = copy.deepcopy(core)
        result = build.assemble(core, self.content)
        self.assertEqual(core, original)
        self.assertEqual(result, self.payload)

    def test_verified_default_and_explicit_draft_precedence(self):
        draft = {**self.content[1], 'question_en': 'draft'}
        self.shard('gen_1.json', [draft, self.content[2]])
        self.shard('final_1.json', [self.content[1]])
        content, sources = build.load_content(self.path)
        self.assertEqual(set(content), {1})
        content, sources = build.load_content(self.path, allow_drafts=True)
        self.assertEqual(content[1], self.content[1])
        self.assertEqual(sources, {1: 'final', 2: 'gen'})

    def test_missing_content_fails(self):
        with self.assertRaises(ValueError):
            build.assemble(self.payload, {})

    def test_duplicate_and_malformed_shards_fail(self):
        for records in ([self.content[1], self.content[1]], {}, [{'id': 1}]):
            with self.subTest(records=type(records).__name__):
                self.shard('final_1.json', records)
                with self.assertRaises(ValueError):
                    build.load_content(self.path)
        (self.path / 'final_1.json').write_text('invalid json')
        with self.assertRaises(ValueError):
            build.load_content(self.path)

    def test_invalid_payload_does_not_touch_either_output(self):
        for name in ('questions.js', 'questions.json'):
            (self.path / name).write_text('sentinel')
        def wrong_count(p): p['counts']['total'] = 309
        def duplicate(p): p['questions'][1] = copy.deepcopy(p['questions'][0])
        def wrong_key(p): p['questions'][0]['correct_index'] = 4
        def wrong_flag(p): p['questions'][0]['options'][0]['correct'] = 'true'
        def missing_english(p): p['questions'][0]['question_en'] = ''
        def missing_asset(p):
            q = next(q for q in p['questions'] if q['image_kind'] == 'stem')
            q['question_image'] = 'assets/img/not-there.png'
        for mutate in (wrong_count, duplicate, wrong_key, wrong_flag, missing_english, missing_asset):
            with self.subTest(case=mutate.__name__):
                payload = copy.deepcopy(self.payload)
                mutate(payload)
                with self.assertRaises(ValueError):
                    build.write_payload(payload, self.path)
                for name in ('questions.js', 'questions.json'):
                    self.assertEqual((self.path / name).read_text(), 'sentinel')

    def test_assets_cannot_escape_root(self):
        outside = self.path / 'outside.png'
        outside.write_bytes(b'image')
        app = self.path / 'app'
        app.mkdir()
        (app / 'link.png').symlink_to(outside)
        for reference in ('../outside.png', str(outside), 'link.png'):
            with self.assertRaises(ValueError):
                build.validate_asset(reference, app, 'test')

    def test_valid_output_is_staged_without_leftovers(self):
        build.write_payload(self.payload, self.path)
        self.assertEqual(set(p.name for p in self.path.iterdir()), {'questions.js', 'questions.json'})
        self.assertEqual((self.path / 'questions.js').read_bytes(), (ROOT / 'app/data/questions.js').read_bytes())


class DeployTests(unittest.TestCase):
    def setUp(self):
        environment = patch.dict(deploy.os.environ, {}, clear=True)
        environment.start()
        self.addCleanup(environment.stop)
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.app = Path(self.tmp.name)
        for name in deploy.REQUIRED:
            path = self.app / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text('fixture')
        (self.app / 'index.html').write_text('<script src="data/questions.js"></script><script src="js/app.js"></script><link rel="stylesheet" href="css/styles.css">')
        for name in ('README.md', 'data/questions.json', 'js/secret.js', '.env', 'private/secret.txt'):
            path = self.app / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text('must not publish')
        self.manifest, self.blobs = deploy.prepare_manifest(self.app)

    def test_manifest_excludes_nonruntime_files(self):
        self.assertEqual({e['file'] for e in self.manifest}, deploy.REQUIRED)

    def test_dry_run_needs_no_token_and_never_calls_network(self):
        with patch.dict(deploy.os.environ, {}, clear=True), patch.object(deploy, 'api') as api, contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(deploy.main(['--app', str(self.app), '--dry-run']), 0)
            api.assert_not_called()

    def test_missing_token_fails_without_network(self):
        with patch.dict(deploy.os.environ, {}, clear=True), patch.object(deploy, 'api') as api, contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(deploy.main(['--app', str(self.app)]), 1)
            api.assert_not_called()

    def test_missing_required_file_and_symlink_fail(self):
        (self.app / 'js/session.js').unlink()
        with self.assertRaises(deploy.DeployError): deploy.gather(self.app)
        (self.app / 'js/session.js').symlink_to(self.app / 'js/app.js')
        with self.assertRaises(deploy.DeployError): deploy.gather(self.app)

    def test_remote_or_escaping_script_rejected(self):
        for ref in ('https://example.com/a.js', '../private/a.js', '/js/app.js', 'js/.secret.js'):
            with self.assertRaises(deploy.DeployError): deploy.local_reference(ref, 'js', '.js')

    def run_deploy(self, responses):
        with patch.object(deploy, 'api', side_effect=responses), patch.object(deploy.time, 'sleep'), contextlib.redirect_stdout(io.StringIO()):
            return deploy.deploy([], {}, 'dummy-test-token')

    def test_creation_and_poll_failures(self):
        for responses in ([(500, {})], [(201, {})], [(201, {'id': 'd', 'url': 'test.invalid'}), (500, {})]):
            with self.subTest(responses=responses), self.assertRaises(deploy.DeployError):
                self.run_deploy(responses)
        for state in ('ERROR', 'CANCELED', 'CANCELLED', 'UNKNOWN', None):
            with self.subTest(state=state), self.assertRaises(deploy.DeployError):
                self.run_deploy([(201, {'id': 'd', 'url': 'test.invalid'}), (200, {'readyState': state})])

    def test_upload_failure_stops_before_creation(self):
        with patch.object(deploy, 'api', return_value=(500, {})) as api:
            with self.assertRaises(deploy.DeployError): deploy.deploy(self.manifest, self.blobs, 'dummy')
            self.assertEqual(api.call_count, 1)

    def test_ready_and_timeout(self):
        self.assertEqual(self.run_deploy([(201, {'id': 'd', 'url': 'test.invalid'}), (200, {'readyState': 'BUILDING'}), (200, {'readyState': 'READY'})])['readyState'], 'READY')
        with patch.object(deploy.time, 'monotonic', side_effect=[0, 181]):
            with self.assertRaisesRegex(deploy.DeployError, 'timed out'):
                self.run_deploy([(201, {'id': 'd', 'url': 'test.invalid'})])

    def test_deployment_scope_and_project_are_environment_configured(self):
        from urllib.parse import parse_qs, urlsplit
        for env in ({}, {'VERCEL_TEAM_ID': 'fixture-team & scope', 'VERCEL_PROJECT': 'fixture-project'}):
            with self.subTest(env=env), patch.dict(deploy.os.environ, env, clear=True), \
                    patch.object(deploy, 'api', side_effect=[(200, {}), (201, {'id': 'd', 'url': 'test.invalid'}), (200, {'readyState': 'READY'})]) as api, \
                    contextlib.redirect_stdout(io.StringIO()):
                deploy.deploy([{'file': 'index.html', 'sha': 'fixture'}], {'index.html': b'fixture'}, 'dummy')
                for call in api.call_args_list:
                    query = parse_qs(urlsplit(call.args[1]).query)
                    self.assertEqual(query.get('teamId'), [env['VERCEL_TEAM_ID']] if env else None)
                creation = api.call_args_list[1]
                self.assertEqual(creation.kwargs['data']['project'], env.get('VERCEL_PROJECT', deploy.DEFAULT_PROJECT))
                self.assertEqual(parse_qs(urlsplit(creation.args[1]).query)['forceNew'], ['1'])

    def test_empty_project_fails_before_network(self):
        with patch.dict(deploy.os.environ, {'VERCEL_PROJECT': ' '}, clear=True), patch.object(deploy, 'api') as api:
            with self.assertRaises(deploy.DeployError):
                deploy.deploy([], {}, 'dummy')
            api.assert_not_called()

    def test_network_errors_are_redacted(self):
        for error in (urllib.error.URLError('secret'), urllib.error.HTTPError('https://example.com', 401, 'secret', {}, None)):
            with patch.object(deploy.urllib.request, 'urlopen', side_effect=error):
                with self.assertRaises(deploy.DeployError) as caught:
                    deploy.api('GET', 'https://example.com/test', 'dummy')
                self.assertNotIn('secret', str(caught.exception))


if __name__ == '__main__':
    unittest.main()
