#!/usr/bin/env python3
"""Automate the remaining merge-resolution chores.

This helper script performs the exact sequence we discussed:
1. Refresh dependencies (to pull the missing Rollup optional binary).
2. Run the Vitest smoke test suite.
3. Stage the resolved files so `git status` is clean.

If any step fails, it prints actionable instructions so you can run the
corresponding command manually, fix the issue, and re-run the script.
"""

from __future__ import annotations

import subprocess
import sys
from dataclasses import dataclass
import json
import shutil
from pathlib import Path
from typing import List


REPO_ROOT = Path(__file__).resolve().parents[1]

# Files that should be staged after the automated fixes run.
FILES_TO_STAGE = [
    "package.json",
    "src/index.ts",
    "ui/src/components/ItemCard.tsx",
    "wrangler.jsonc",
    "wrangler.toml",
    "src/router.ts",
    "src/types/env.ts",
    "src/types.ts",
    "scripts/reset_dependencies.py",
    Path(__file__).relative_to(REPO_ROOT).as_posix(),
]


@dataclass
class Step:
    name: str
    command: List[str]
    failure_hint: str


def run_step(step: Step) -> None:
    """Run a shell command and exit with instructions if it fails."""

    print(f"\n==> {step.name}")
    print(f"$ {' '.join(step.command)}")

    try:
        subprocess.run(step.command, cwd=REPO_ROOT, check=True)
    except FileNotFoundError as exc:  # Command not available on PATH
        print(f"\n[ERROR] Could not find executable: {exc}")
        print("Install the missing tool or adjust your PATH, then rerun this script.")
        sys.exit(1)
    except subprocess.CalledProcessError as exc:
        print(f"\n[ERROR] Step '{step.name}' failed with exit code {exc.returncode}.")
        print(f"Command: {' '.join(step.command)}")
        print(f"Suggested fix: {step.failure_hint}")
        sys.exit(exc.returncode)


def get_current_branch() -> str:
    result = subprocess.run(
        ["git", "rev-parse", "--abbrev-ref", "HEAD"],
        cwd=REPO_ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip()


def working_tree_clean() -> bool:
    result = subprocess.run(
        ["git", "status", "--porcelain"],
        cwd=REPO_ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip() == ""


def push_branch(branch: str) -> bool:
    try:
        subprocess.run(["git", "push", "-u", "origin", branch], cwd=REPO_ROOT, check=True)
        return True
    except subprocess.CalledProcessError as exc:
        print(f"\n[WARN] git push failed (exit code {exc.returncode}).")
        print("Run the push manually once you resolve the issue:")
        print(f"  git push -u origin {branch}")
        return False


def gh_available() -> bool:
    return shutil.which("gh") is not None


def ensure_bun_ready() -> None:
    if shutil.which("bun") is None:
        print("\n[ERROR] Bun is required for this workflow but was not found on PATH.")
        print("Install it via https://bun.sh and rerun this script.")
        sys.exit(1)


def ensure_public_assets() -> None:
    public_dir = REPO_ROOT / "public"
    if public_dir.exists():
        return

    print("\n==> Creating placeholder ./public directory for assets binding")
    public_dir.mkdir(parents=True, exist_ok=True)
    index_file = public_dir / "index.html"
    if not index_file.exists():
        index_file.write_text(
            "<!doctype html><html><head><meta charset='utf-8'><title>Water Cooler</title></head>"
            "<body><p>Placeholder assets for local tests.</p></body></html>"
        )


def run_gh(args: List[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["gh", *args],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
    )


def ensure_gh_ready() -> bool:
    if not gh_available():
        print("\n[INFO] GitHub CLI (gh) not found on PATH; skipping PR automation.")
        print("Install it from https://cli.github.com/ and rerun to enable autopilot mode.")
        return False

    version = run_gh(["--version"])
    if version.returncode != 0:
        print("\n[WARN] 'gh --version' failed. Is GitHub CLI authenticated?")
        print("Output:\n" + version.stderr.strip())
        print("Run 'gh auth login' and re-run this script to enable PR automation.")
        return False

    return True


def get_default_branch() -> str | None:
    result = run_gh(["repo", "view", "--json", "defaultBranch"])
    if result.returncode != 0:
        return None
    try:
        data = json.loads(result.stdout)
        return data.get("defaultBranch")
    except json.JSONDecodeError:
        return None


def ensure_pr(branch: str) -> None:
    if not ensure_gh_ready():
        return

    # Try to view an existing PR for this branch
    existing = run_gh(["pr", "view", "--json", "number,url", "--head", branch])
    if existing.returncode == 0:
        try:
            data = json.loads(existing.stdout)
            number = data.get("number")
            url = data.get("url")
            print(f"\nℹ️  Existing PR #{number}: {url}")
        except json.JSONDecodeError:
            print("\nℹ️  PR already exists for this branch (could not parse JSON response).")
        return

    # Need to create a PR
    base = get_default_branch() or "main"
    print(f"\nNo PR found for branch '{branch}'. Creating one against '{base}'...")
    create = run_gh(["pr", "create", "--fill", "--head", branch, "--base", base])
    if create.returncode != 0:
        print("[WARN] Failed to create PR automatically.")
        print("Run manually if needed:")
        print(f"  gh pr create --fill --head {branch} --base {base}")
        if create.stderr:
            print("CLI output:\n" + create.stderr.strip())
    else:
        print("✅ Pull request created via GitHub CLI:")
        print(create.stdout.strip())


def main() -> None:
    ensure_bun_ready()

    reset_step = Step(
        name="Reset/install dependencies",
        command=["python3", "scripts/reset_dependencies.py", "--manager", "bun"],
        failure_hint=
        "Review the Bun install output above, fix any package issues, then rerun `python3 scripts/reset_dependencies.py --manager bun`.",
    )

    test_step = Step(
        name="Run Vitest smoke tests",
        command=["bun", "run", "test", "--", "src/index.test.ts"],
        failure_hint="Resolve the test failures, then run `bun run test -- src/index.test.ts` until it passes.",
    )

    stage_step = Step(
        name="Stage resolved files",
        command=["git", "add", *FILES_TO_STAGE],
        failure_hint=(
            "If you see 'Operation not permitted', check repo permissions (e.g. `ls -ld .git`) or remove any stale index.lock, then rerun `git add ...`."
        ),
    )

    run_step(reset_step)
    ensure_public_assets()
    run_step(test_step)
    run_step(stage_step)

    branch = get_current_branch()
    clean = working_tree_clean()

    if clean:
        print(f"\nWorking tree is clean; attempting to push '{branch}'...")
        if push_branch(branch):
            print("✅ git push completed successfully.")
            ensure_pr(branch)
    else:
        print("\n[INFO] Working tree still has changes. Skipping automatic push.")
        print("Inspect and commit as needed, then push manually once ready.")

    print("\nNext actions:")
    print("  1. Inspect status:   git status -sb")
    print("  2. Commit:           git commit -m 'Resolve merge conflicts' (adjust message)")
    print(f"  3. Push:             git push -u origin {branch}")


if __name__ == "__main__":
    main()
