"""Node runtime used to call the existing API study command."""

from __future__ import annotations

import os
import shutil
import subprocess
import tarfile
import urllib.request
from dataclasses import dataclass
from pathlib import Path

NODE_VERSION = "22.21.0"
NODE_DIST = f"node-v{NODE_VERSION}-linux-x64"
NODE_URL = f"https://nodejs.org/dist/v{NODE_VERSION}/{NODE_DIST}.tar.xz"


@dataclass(frozen=True)
class StudyRuntime:
    node: str
    tsx: Path
    env: dict[str, str]


def ensure_study_runtime(repo_root: Path, env: dict[str, str]) -> StudyRuntime:
    prepared = dict(env)
    if not prepared.get("DIRECT_URL", "").strip() and prepared.get("DATABASE_URL", "").strip():
        prepared["DIRECT_URL"] = prepared["DATABASE_URL"]
    prepared.pop("NPM_CONFIG_PRODUCTION", None)
    node = _node_binary()
    bin_dir = str(Path(node).resolve().parent)
    prepared["PATH"] = bin_dir + os.pathsep + prepared.get("PATH", "")
    tsx = _find_tsx(repo_root)
    if tsx is None or not _prisma_ready(repo_root):
        _npm_ci(repo_root, prepared)
        tsx = _find_tsx(repo_root)
    if tsx is None:
        raise RuntimeError("The study command is missing its Node dependencies.")
    return StudyRuntime(node=node, tsx=tsx, env=prepared)


def _node_binary() -> str:
    found = shutil.which("node")
    if found and _node_major(found) >= 20:
        return found
    cached = Path.home() / ".cache" / "rev-node" / NODE_DIST / "bin" / "node"
    if cached.is_file() and _node_major(str(cached)) >= 20:
        return str(cached)
    if os.uname().sysname != "Linux" or os.uname().machine not in {"x86_64", "amd64"}:
        raise RuntimeError("Install Node.js 20 or newer to run the study command.")
    _download_node(cached.parent.parent)
    if not cached.is_file():
        raise RuntimeError("Node.js 22 could not be installed.")
    return str(cached)


def _download_node(destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    archive = destination.parent / f"{NODE_DIST}.tar.xz"
    urllib.request.urlretrieve(NODE_URL, archive)
    with tarfile.open(archive, "r:xz") as tar:
        tar.extractall(destination.parent, filter="data")
    archive.unlink(missing_ok=True)


def _node_major(binary: str) -> int:
    try:
        out = subprocess.check_output([binary, "-p", "process.versions.node"], text=True, timeout=20).strip()
    except (OSError, subprocess.SubprocessError):
        return 0
    try:
        return int(out.split(".", 1)[0])
    except ValueError:
        return 0


def _find_tsx(repo_root: Path) -> Path | None:
    for candidate in (
        repo_root / "node_modules" / "tsx" / "dist" / "cli.mjs",
        repo_root / "apps" / "api" / "node_modules" / "tsx" / "dist" / "cli.mjs",
    ):
        if candidate.is_file():
            return candidate
    return None


def _prisma_ready(repo_root: Path) -> bool:
    for candidate in (
        repo_root / "node_modules" / ".prisma" / "client",
        repo_root / "apps" / "api" / "node_modules" / ".prisma" / "client",
    ):
        if candidate.is_dir() and any(candidate.glob("*.js")):
            return True
    return False


def _npm_ci(repo_root: Path, env: dict[str, str]) -> None:
    npm = Path(env["PATH"].split(os.pathsep, 1)[0]) / "npm"
    if not npm.is_file():
        found = shutil.which("npm", path=env.get("PATH"))
        if not found:
            raise RuntimeError("npm is not available.")
        npm = Path(found)
    install_env = dict(env)
    install_env.pop("NPM_CONFIG_PRODUCTION", None)
    install_env.pop("NODE_ENV", None)
    subprocess.run(
        [str(npm), "ci", "-w", "@rev/api", "--include-workspace-root", "--include=dev"],
        cwd=repo_root,
        env=install_env,
        check=True,
        timeout=900,
    )
