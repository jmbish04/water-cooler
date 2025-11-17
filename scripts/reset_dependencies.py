#!/usr/bin/env python3
"""Automate dependency repair tasks for the water-cooler worker."""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Dict

ROOT = Path(__file__).resolve().parent.parent
PACKAGE_JSON = ROOT / "package.json"
DEFAULT_MANAGER = "bun" if (ROOT / "bun.lock").exists() else "npm"


def info(message: str) -> None:
    print(f"==> {message}")


def run(cmd: list[str]) -> subprocess.CompletedProcess[str]:
    info("running: " + " ".join(cmd))
    try:
        return subprocess.run(
            cmd,
            cwd=ROOT,
            text=True,
            check=True,
            capture_output=False,
        )
    except FileNotFoundError as exc:  # e.g. pnpm not installed
        sys.exit(f"Missing required tool: {cmd[0]} ({exc})")
    except subprocess.CalledProcessError as exc:
        sys.exit(
            f"Command {' '.join(cmd)} failed with exit code {exc.returncode}"
        )


def detect_lockfiles(manager: str) -> set[Path]:
    mapping = {
        "npm": {"package-lock.json"},
        "pnpm": {"package-lock.json", "pnpm-lock.yaml"},
        "bun": {"package-lock.json", "bun.lockb", "bun.lock"},
    }
    return {ROOT / name for name in mapping.get(manager, set())}


def remove_lockfiles(manager: str) -> None:
    info("removing lock files")
    for lockfile in detect_lockfiles(manager):
        if lockfile.exists():
            lockfile.unlink()
            print(f"   removed {lockfile.relative_to(ROOT)}")
        else:
            print(f"   skipped {lockfile.relative_to(ROOT)} (not found)")


def remove_node_modules() -> None:
    node_modules = ROOT / "node_modules"
    if node_modules.exists():
        info("removing node_modules")
        try:
            shutil.rmtree(node_modules)
        except OSError as exc:
            info(f"standard removal failed ({exc}); retrying via 'rm -rf'")
            result = subprocess.run(
                ["rm", "-rf", str(node_modules)],
                cwd=ROOT,
            )
            if result.returncode != 0 and node_modules.exists():
                sys.exit(
                    "Failed to delete node_modules even after rm -rf. "
                    "Inspect permissions and remove the directory manually."
                )
    else:
        info("node_modules directory not present; skipping removal")


def load_manifest() -> Dict[str, Dict[str, str]]:
    if not PACKAGE_JSON.exists():
        sys.exit("package.json not found; run the script from the repo root.")
    with PACKAGE_JSON.open("r", encoding="utf-8") as fp:
        return json.load(fp)


def save_manifest(manifest: Dict[str, Dict[str, str]]) -> None:
    with PACKAGE_JSON.open("w", encoding="utf-8") as fp:
        json.dump(manifest, fp, indent=2)
        fp.write("\n")


def latest_version(package: str) -> str:
    """Retrieve the latest published version via npm view."""
    info(f"retrieving latest {package} version from npm registry")
    try:
        result = subprocess.run(
            ["npm", "view", package, "version"],
            cwd=ROOT,
            text=True,
            check=True,
            capture_output=True,
        )
    except FileNotFoundError as exc:
        raise RuntimeError(f"npm is required to look up versions: {exc}") from exc
    except subprocess.CalledProcessError as exc:
        raise RuntimeError(
            f"Failed to look up {package} version (exit code {exc.returncode})."
        ) from exc
    version = result.stdout.strip()
    if not version:
        raise RuntimeError(f"npm returned an empty version for {package}")
    return version


def upgrade_wrangler(manifest: Dict[str, Dict[str, str]], caret: bool) -> bool:
    try:
        new_version = latest_version("wrangler")
    except RuntimeError as exc:
        info(f"skipping wrangler upgrade: {exc}")
        return False
    desired = f"^{new_version}" if caret else new_version
    changed = False

    for section in ("devDependencies", "dependencies"):
        deps = manifest.setdefault(section, {})
        if "wrangler" in deps:
            if deps["wrangler"] != desired:
                info(f"updating wrangler in {section} -> {desired}")
                deps["wrangler"] = desired
                changed = True
            else:
                info(f"wrangler already at {desired} in {section}")
            break
    else:
        info("wrangler not found in manifest; adding to devDependencies")
        manifest.setdefault("devDependencies", {})["wrangler"] = desired
        changed = True

    if changed:
        save_manifest(manifest)
    return changed


def install_dependencies(manager: str, frozen: bool) -> None:
    if manager == "npm":
        cmd = ["npm", "install"]
    elif manager == "pnpm":
        cmd = ["pnpm", "install"]
    elif manager == "bun":
        cmd = ["bun", "install"]
    else:
        sys.exit(f"Unsupported package manager: {manager}")

    if frozen and manager == "npm":
        cmd.append("--package-lock-only")
    elif frozen and manager == "pnpm":
        cmd.append("--lockfile-only")
    elif frozen and manager == "bun":
        info("--frozen flag ignored for bun install")

    run(cmd)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Rebuild JavaScript dependencies, regenerate lockfiles, "
            "and upgrade wrangler."
        )
    )
    parser.add_argument(
        "--manager",
        choices=("npm", "pnpm", "bun"),
        default=DEFAULT_MANAGER,
        help="package manager to use for reinstalling dependencies",
    )
    parser.add_argument(
        "--skip-install",
        action="store_true",
        help="update manifests but do not reinstall dependencies",
    )
    parser.add_argument(
        "--keep-node-modules",
        action="store_true",
        help="do not delete node_modules before reinstalling",
    )
    parser.add_argument(
        "--exact",
        action="store_true",
        help="pin wrangler without a caret range (default uses ^version)",
    )
    parser.add_argument(
        "--frozen-lock",
        action="store_true",
        help="only update lockfiles without touching node_modules "
        "(npm/pnpm only)",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    manifest = load_manifest()

    if not args.keep_node_modules and not args.frozen_lock:
        remove_node_modules()

    remove_lockfiles(args.manager)

    wrangler_updated = upgrade_wrangler(manifest, caret=not args.exact)
    if wrangler_updated:
        info("wrangler dependency updated")
    else:
        info("wrangler already on the latest version")

    if args.skip_install:
        info("Skipping dependency installation per --skip-install")
        return

    install_dependencies(args.manager, frozen=args.frozen_lock)
    info("Dependency repair complete.")


if __name__ == "__main__":
    main()
