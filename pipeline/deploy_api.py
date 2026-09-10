#!/usr/bin/env python3
"""Deploy the static app through Vercel's REST API, not its CLI.

Use --dry-run to validate and print the upload manifest without credentials or
network. Real deployment requires VERCEL_TOKEN in the environment (never argv).
"""
import argparse
import hashlib
from html.parser import HTMLParser
import json
import math
import os
from pathlib import Path, PurePosixPath
import sys
import time
import urllib.error
import urllib.request
from urllib.parse import urlencode, urlsplit

DEFAULT_PROJECT = "einbuergerungstest-berlin"
APP = Path(__file__).resolve().parent.parent / "app"
API_ROOT = "https://api.vercel.com"
REQUIRED = {"index.html", "vercel.json", "css/styles.css", "data/questions.js", "data/lessons.js",
            "js/store.js", "js/data.js", "js/session.js", "js/ui.js", "js/learn.js", "js/app.js"}
DATA_SCRIPTS = {"data/questions.js", "data/lessons.js"}  # plain-script data payloads, not fetched JSON
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico"}


class DeployError(Exception):
    pass


class References(HTMLParser):
    """Only declared scripts/styles join the fixed runtime allowlist."""
    def __init__(self):
        super().__init__()
        self.scripts = set()
        self.styles = set()

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "script" and "src" in attrs:
            self.scripts.add(attrs["src"])
        if tag == "link" and "stylesheet" in attrs.get("rel", "").split():
            self.styles.add(attrs.get("href"))


def local_reference(reference, directory, suffix):
    if not isinstance(reference, str) or not reference:
        raise DeployError("empty script/stylesheet reference in index.html")
    url = urlsplit(reference)
    path = PurePosixPath(url.path)
    if (url.scheme or url.netloc or path.is_absolute() or "\\" in reference or
            any(part.startswith(".") for part in path.parts) or
            len(path.parts) < 2 or path.parts[0] != directory or path.suffix != suffix):
        raise DeployError(f"unsupported script/stylesheet reference: {reference!r}")
    return path.as_posix()


def checked_file(root, relative):
    path = root / relative
    # No links to private files (inside or outside the app), nor hidden paths.
    if (any(part.startswith(".") for part in PurePosixPath(relative).parts) or
            path.resolve() != path or not path.is_file()):
        raise DeployError(f"missing or unsafe deploy file: {relative}")
    return path


def gather(app_dir=APP):
    root = Path(app_dir).resolve()
    references = References()
    references.feed(checked_file(root, "index.html").read_text(encoding="utf-8"))
    files = set(REQUIRED)
    for script in references.scripts:
        # Data remains a plain script, not a fetch of the reference JSON copy.
        directory = "data" if isinstance(script, str) and urlsplit(script).path in DATA_SCRIPTS else "js"
        relative = local_reference(script, directory, ".js")
        files.add(relative)
    for style in references.styles:
        files.add(local_reference(style, "css", ".css"))
    for path in (root / "assets" / "img").rglob("*"):
        relative = path.relative_to(root)
        if path.suffix.lower() in IMAGE_EXTENSIONS and not any(part.startswith(".") for part in relative.parts):
            files.add(relative.as_posix())
    for relative in files:
        checked_file(root, relative)
    # No recursive css/js/data upload: README, JSON copies, maps, credentials,
    # private directories and undeclared scripts are not deployment inputs.
    return sorted(files)


def prepare_manifest(app_dir=APP):
    root = Path(app_dir).resolve()
    blobs = {relative: checked_file(root, relative).read_bytes() for relative in gather(root)}
    manifest = [{"file": relative, "sha": hashlib.sha1(data).hexdigest(), "size": len(data)}
                for relative, data in blobs.items()]
    return manifest, blobs


def api(method, url, token, data=None, headers=None, raw=False, timeout=30):
    request_headers = {"Authorization": "Bearer " + token}
    if headers:
        request_headers.update(headers)
    body = data if raw else (json.dumps(data).encode("utf-8") if data is not None else None)
    if data is not None and not raw:
        request_headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=body, headers=request_headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            status, response_body = response.status, response.read()
    except urllib.error.HTTPError as error:
        # Do not echo response bodies: they may contain credentials or HTML.
        raise DeployError(f"{method} {urlsplit(url).path}: HTTP {error.code}") from error
    except (urllib.error.URLError, OSError) as error:
        raise DeployError(f"{method} {urlsplit(url).path}: network request failed or timed out") from error
    try:
        result = json.loads(response_body.decode("utf-8")) if response_body.strip() else {}
    except (UnicodeError, ValueError) as error:
        raise DeployError(f"{method} {urlsplit(url).path}: invalid JSON response") from error
    if not isinstance(result, dict):
        raise DeployError(f"{method} {urlsplit(url).path}: expected a JSON object")
    return status, result


def deploy(manifest, blobs, token, request_timeout=30, wait_timeout=180, poll_interval=3):
    team = os.environ.get("VERCEL_TEAM_ID", "").strip()
    project = os.environ.get("VERCEL_PROJECT", DEFAULT_PROJECT).strip()
    if not project:
        raise DeployError("VERCEL_PROJECT must not be empty")
    scope = {"teamId": team} if team else {}

    def endpoint(path, **query):
        encoded = urlencode({**scope, **query})
        return API_ROOT + path + ("?" + encoded if encoded else "")

    for entry in manifest:
        relative = entry["file"]
        status, _ = api("POST", endpoint("/v2/files"), token,
                        data=blobs[relative], raw=True, timeout=request_timeout,
                        headers={"Content-Type": "application/octet-stream", "x-vercel-digest": entry["sha"]})
        if status not in (200, 201):
            raise DeployError(f"upload failed for {relative}: HTTP {status}")
    body = {"name": project, "project": project, "target": "production", "files": manifest,
            "projectSettings": {"framework": None}}
    status, created = api("POST", endpoint("/v13/deployments", forceNew=1), token,
                          data=body, timeout=request_timeout)
    if status not in (200, 201):
        raise DeployError(f"deployment creation failed: HTTP {status}")
    dep_id, url = created.get("id"), created.get("url")
    if not isinstance(dep_id, str) or not dep_id or not isinstance(url, str) or not url:
        raise DeployError("deployment response is missing id or url")
    deadline = time.monotonic() + wait_timeout
    while True:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise DeployError("timed out waiting for READY; deployment may still finish on Vercel")
        status, result = api("GET", endpoint(f"/v13/deployments/{dep_id}"), token,
                             timeout=min(request_timeout, remaining))
        if status != 200:
            raise DeployError(f"deployment status check failed: HTTP {status}")
        state = result.get("readyState") or result.get("status")
        if state == "READY":
            print("PRODUCTION URL: https://" + url)
            return result
        if state in ("ERROR", "CANCELED", "CANCELLED"):
            raise DeployError(f"deployment failed: {state}")
        if state not in ("QUEUED", "INITIALIZING", "BUILDING"):
            raise DeployError(f"invalid deployment state: {state!r}")
        time.sleep(min(poll_interval, max(0, deadline - time.monotonic())))


def positive_seconds(value):
    number = float(value)
    if not math.isfinite(number) or number <= 0:
        raise argparse.ArgumentTypeError("must be a positive finite number of seconds")
    return number


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--app", type=Path, default=APP)
    parser.add_argument("--dry-run", action="store_true", help="print manifest only; no token/network")
    parser.add_argument("--request-timeout", type=positive_seconds, default=30)
    parser.add_argument("--wait-timeout", type=positive_seconds, default=180)
    args = parser.parse_args(argv)
    try:
        manifest, blobs = prepare_manifest(args.app)
        if args.dry_run:
            print(json.dumps(manifest, indent=2))
            return 0
        token = os.environ.get("VERCEL_TOKEN", "").strip()
        if not token:
            raise DeployError("set VERCEL_TOKEN in the environment or use --dry-run")
        deploy(manifest, blobs, token, args.request_timeout, args.wait_timeout)
    except (DeployError, OSError, ValueError) as error:
        print(f"DEPLOY FAILED: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
