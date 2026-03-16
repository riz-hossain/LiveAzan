#!/usr/bin/env python3
"""
LiveAzan — Setup & Build Tool
Cross-platform (Windows / macOS / Linux). Requires only Docker Desktop + Python 3.10+.

USAGE (run from repo root):
  python setup.py local                   Start local dev stack
  python setup.py production              Start full production stack
  python setup.py restart local           Rebuild & restart (keeps data)
  python setup.py restart production      Rebuild & restart full stack
  python setup.py down                    Stop all LiveAzan containers
  python setup.py clean                   Full wipe: containers + volumes + images
  python setup.py status                  Show container + dev server status
  python setup.py android local           Build Android APK (mobile app)
  python setup.py android local --fresh   Fresh rebuild (cleans caches + prebuild)
  python setup.py --help                  Show this help
"""

import os
import sys
import re
import json
import time
import shutil
import socket
import signal
import secrets
import platform
import textwrap
import subprocess
from pathlib import Path

# ── Project identifiers ───────────────────────────────────────────────────────
PROJECT_LOCAL = "liveaszan_local"
PROJECT_PROD  = "liveaszan_prod"

# ── Globals ───────────────────────────────────────────────────────────────────
COMPOSE_CMD = None  # Set by detect_compose()

# ── App configs ───────────────────────────────────────────────────────────────
ADMIN_APP = {
    "name": "admin",
    "dir": "apps/admin",
    "pkg_manager": "npm",
    "port": 5174,
    "dev_cmd": ["npm", "run", "dev"],
}

MOBILE_APP = {
    "name": "mobile",
    "dir": "apps/mobile",
    "pkg_manager": "npm",
}

PID_FILE = ".liveaszan_pids"

# ── Helpers ───────────────────────────────────────────────────────────────────

def is_windows():
    return platform.system().lower() == "windows"


def is_mac():
    return platform.system().lower() == "darwin"


def run(cmd, cwd=None, check=True, capture=True):
    """Run command, return stdout. Raises RuntimeError on failure if check=True."""
    try:
        r = subprocess.run(
            cmd, cwd=cwd, check=check, text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
        )
        return r.stdout or ""
    except subprocess.CalledProcessError as e:
        out = e.stdout or ""
        if check:
            raise RuntimeError(f"Command failed: {' '.join(str(x) for x in cmd)}\n{out}") from e
        return out


def run_visible(cmd, cwd=None, check=True, env=None):
    """Run command with output shown to user."""
    try:
        subprocess.run(cmd, cwd=cwd, check=check, env=env)
    except subprocess.CalledProcessError as e:
        if check:
            raise RuntimeError(f"Command failed: {' '.join(str(x) for x in cmd)}") from e


def has_cmd(name):
    return shutil.which(name) is not None


def die(msg, code=1):
    print(f"\n  ERROR: {msg}\n", file=sys.stderr)
    sys.exit(code)


def info(msg):
    print(f"  {msg}")


def warn(msg):
    print(f"  [!!] {msg}")


def header(msg):
    width = 60
    print(f"\n{'=' * width}")
    print(f"  {msg}")
    print(f"{'=' * width}\n")


def ask_yes_no(prompt, default=False):
    suffix = " [Y/n]: " if default else " [y/N]: "
    try:
        answer = input(f"  {prompt}{suffix}").strip().lower()
    except (EOFError, KeyboardInterrupt):
        print()
        return default
    if not answer:
        return default
    return answer in ("y", "yes")


# ── Docker detection ──────────────────────────────────────────────────────────

def detect_compose():
    """Detect docker compose v2 plugin or docker-compose v1 standalone."""
    global COMPOSE_CMD

    try:
        r = subprocess.run(
            ["docker", "compose", "version"],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        )
        if r.returncode == 0:
            COMPOSE_CMD = ["docker", "compose"]
            return
    except FileNotFoundError:
        pass

    try:
        r = subprocess.run(
            ["docker-compose", "version"],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        )
        if r.returncode == 0:
            COMPOSE_CMD = ["docker-compose"]
            return
    except FileNotFoundError:
        pass

    die(
        "Neither 'docker compose' (v2) nor 'docker-compose' (v1) found.\n"
        "  Install Docker Desktop: https://www.docker.com/products/docker-desktop"
    )


def docker_running():
    try:
        r = subprocess.run(
            ["docker", "info"],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        )
        return r.returncode == 0
    except FileNotFoundError:
        return False


def wait_docker(timeout_sec=120):
    """Wait for Docker daemon; try to auto-start it."""
    if docker_running():
        info("Docker engine: running")
        return

    info("Docker is not running. Attempting to start...")

    if is_mac():
        try:
            subprocess.Popen(["open", "-a", "Docker"],
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except Exception:
            pass
    elif is_windows():
        for p in [
            r"C:\Program Files\Docker\Docker\Docker Desktop.exe",
            r"C:\Program Files (x86)\Docker\Docker\Docker Desktop.exe",
        ]:
            if os.path.isfile(p):
                try:
                    subprocess.Popen([p], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                except Exception:
                    pass
                break
    else:
        try:
            subprocess.run(["sudo", "systemctl", "start", "docker"],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
        except Exception:
            pass

    info(f"Waiting up to {timeout_sec}s for Docker engine...")
    start = time.time()
    while time.time() - start < timeout_sec:
        if docker_running():
            info("Docker engine: ready")
            return
        time.sleep(3)

    die(
        "Docker engine did not start within 2 minutes.\n"
        "  Windows/macOS: Start Docker Desktop manually.\n"
        "  Linux: Run 'sudo systemctl start docker'"
    )


# ── Windows-specific checks ───────────────────────────────────────────────────

def windows_check_virtualization():
    _check_hyperv_virtualization()
    _ensure_wsl2_features()
    _check_wsl_installed()


def _check_hyperv_virtualization():
    try:
        out = run(["systeminfo"], capture=True, check=False)
    except Exception:
        warn("Could not run systeminfo. Skipping virtualization check.")
        return

    m = re.search(r"Hyper-V Requirements:(.*)", out, flags=re.S)
    if not m:
        warn("Hyper-V Requirements not found in systeminfo. Skipping check.")
        return

    block = m.group(1)
    if "hypervisor has been detected" in block.lower():
        info("Hardware virtualization: OK (hypervisor already active)")
        return

    req = {}
    for line in block.splitlines():
        line = line.strip()
        if ":" in line:
            k, v = line.split(":", 1)
            req[k.strip()] = v.strip()

    def yes(key):
        return req.get(key, "").lower().startswith("yes")

    virt_fw = yes("Virtualization Enabled In Firmware")
    vm_mon  = yes("VM Monitor Mode Extensions")

    if not req:
        warn("Could not parse Hyper-V fields (non-English OS?). Skipping.")
        return

    if virt_fw and vm_mon:
        info("Hardware virtualization: OK")
        return

    header("BLOCKER: Hardware Virtualization Not Enabled")
    info("Enable virtualization in BIOS/UEFI:")
    info("  Intel CPU: Enable VT-x (and VT-d)")
    info("  AMD CPU:   Enable SVM Mode / AMD-V")
    die("Virtualization must be enabled in firmware before Docker can work.", code=2)


def _ensure_wsl2_features():
    features = ["Microsoft-Windows-Subsystem-Linux", "VirtualMachinePlatform"]
    needs_reboot = False
    for feat in features:
        try:
            fi = run(["dism", "/online", "/get-featureinfo", f"/featurename:{feat}"],
                     capture=True, check=False)
            if "State : Enabled" in fi:
                info(f"Windows feature OK: {feat}")
                continue
        except Exception:
            pass
        info(f"Enabling Windows feature: {feat} ...")
        try:
            run(["dism", "/online", "/enable-feature",
                 f"/featurename:{feat}", "/all", "/norestart"], capture=True)
            needs_reboot = True
        except Exception as e:
            warn(f"Failed to enable {feat} (run as Administrator): {e}")
    if has_cmd("wsl"):
        try:
            run(["wsl", "--set-default-version", "2"], check=False, capture=True)
        except Exception:
            pass
    if needs_reboot:
        header("Reboot Required")
        info("Windows features were enabled. Reboot and re-run this script.")
        die("Please reboot your computer, then try again.", code=3)


def _check_wsl_installed():
    if not has_cmd("wsl"):
        warn("WSL command not found. Docker Desktop requires WSL2.")
        info("  Install WSL: wsl --install")
        return
    try:
        out = run(["wsl", "--list", "--quiet"], capture=True, check=False)
    except Exception:
        return
    distros = [line.strip() for line in out.splitlines() if line.strip()]
    if distros:
        info(f"WSL distribution installed: {distros[0]}")
    else:
        warn("WSL installed but no Linux distribution found.")
        info("  Install one: wsl --install -d Ubuntu")


def windows_check_docker_backend():
    try:
        out = run(["docker", "info"], capture=True, check=False)
    except Exception:
        return
    if "wsl" in out.lower():
        info("Docker backend: WSL2")
    elif "hyper-v" in out.lower():
        warn("Docker Desktop is using Hyper-V backend, not WSL2.")
        info("  Recommended: Docker Desktop > Settings > General > 'Use the WSL 2 based engine'")


# ── Env file management ───────────────────────────────────────────────────────

def ensure_env_local(repo):
    """Create .env.local from example if missing."""
    env_file = repo / ".env.local"
    if env_file.exists():
        return

    example = repo / ".env.local.example"
    if example.exists():
        shutil.copyfile(example, env_file)
        warn("Created .env.local from .env.local.example")
        info("  Edit .env.local to change passwords/secrets if needed.")
        return

    # Generate one from scratch
    jwt_secret  = secrets.token_urlsafe(48)
    db_password = secrets.token_urlsafe(16)
    env_file.write_text(
        f"DB_PASSWORD={db_password}\n"
        f"JWT_SECRET={jwt_secret}\n"
        f"ADMIN_EMAIL=admin@liveaszan.local\n"
        f"ADMIN_PASSWORD=admin1234\n"
    )
    info(".env.local created with generated secrets.")
    info("  Default admin: admin@liveaszan.local / admin1234")


def ensure_env_prod(repo):
    """Ensure .env.prod exists for production."""
    env_file = repo / ".env.prod"
    if env_file.exists():
        return

    example = repo / ".env.prod.example"
    if example.exists():
        shutil.copyfile(example, env_file)
        warn("Created .env.prod from .env.prod.example")
        info("  IMPORTANT: Edit .env.prod and set strong DB_PASSWORD and JWT_SECRET before deploying!")
        return

    die(
        "Missing .env.prod. Create it from .env.prod.example:\n"
        "  copy .env.prod.example .env.prod   (Windows)\n"
        "  cp .env.prod.example .env.prod     (macOS/Linux)\n"
        "  Then set strong values for DB_PASSWORD and JWT_SECRET."
    )


# ── Compose command builders ──────────────────────────────────────────────────

def compose_local(repo):
    return COMPOSE_CMD + [
        "-p", PROJECT_LOCAL,
        "-f", str(repo / "docker-compose.local.yml"),
        "--env-file", str(repo / ".env.local"),
    ]


def compose_prod(repo):
    return COMPOSE_CMD + [
        "-p", PROJECT_PROD,
        "-f", str(repo / "docker-compose.prod.yml"),
        "--env-file", str(repo / ".env.prod"),
    ]


def get_compose_prefix(repo, mode):
    return compose_local(repo) if mode == "local" else compose_prod(repo)


# ── Compose operations ────────────────────────────────────────────────────────

def compose_up(repo, mode):
    prefix = get_compose_prefix(repo, mode)
    run_visible(prefix + ["up", "--build", "-d"], cwd=str(repo))


def compose_down(repo, mode, wipe_volumes=False):
    down_args = ["down", "--remove-orphans"]
    if wipe_volumes:
        down_args.append("-v")
    try:
        prefix = get_compose_prefix(repo, mode)
        run(prefix + down_args, cwd=str(repo), check=False)
    except Exception:
        project = PROJECT_LOCAL if mode == "local" else PROJECT_PROD
        run(COMPOSE_CMD + ["-p", project] + down_args, cwd=str(repo), check=False)


def compose_status(repo, mode):
    try:
        prefix = get_compose_prefix(repo, mode)
        out = run(prefix + ["ps"], cwd=str(repo), check=False)
        if out.strip():
            print(out)
        else:
            info(f"No containers running for {mode} stack.")
    except Exception:
        info(f"({mode} stack: env files not configured)")


# ── Admin dev server (background process) ────────────────────────────────────

def _pid_file(repo):
    return repo / PID_FILE


def _is_process_running(pid):
    try:
        if is_windows():
            out = subprocess.run(
                ["tasklist", "/FI", f"PID eq {pid}", "/NH"],
                stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=False,
            )
            return str(pid) in out.stdout
        else:
            os.kill(pid, 0)
            return True
    except (ProcessLookupError, OSError):
        return False


def start_admin(repo):
    """Start the Vite dev server as a background process."""
    stop_admin(repo, quiet=True)

    app_dir = repo / ADMIN_APP["dir"]
    if not app_dir.is_dir():
        warn(f"Admin dir not found: {ADMIN_APP['dir']}")
        return

    # Ensure deps are installed
    if not (app_dir / "node_modules").is_dir():
        info("Installing admin dependencies...")
        install_cmd = ["npm", "install"]
        if is_windows():
            install_cmd = ["cmd", "/c"] + install_cmd
        run_visible(install_cmd, cwd=str(app_dir))

    dev_cmd = list(ADMIN_APP["dev_cmd"])
    if is_windows():
        dev_cmd = ["cmd", "/c"] + dev_cmd

    log_file = repo / "apps" / "admin" / "dev.log"
    log_file.parent.mkdir(parents=True, exist_ok=True)

    kwargs = {}
    if is_windows():
        kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP

    lf = open(log_file, "w")
    proc = subprocess.Popen(
        dev_cmd,
        cwd=str(app_dir),
        stdout=lf,
        stderr=subprocess.STDOUT,
        **kwargs,
    )

    pid_file = _pid_file(repo)
    with open(pid_file, "w") as f:
        f.write(f"admin={proc.pid}\n")

    info(f"Admin portal: http://localhost:{ADMIN_APP['port']}  (PID {proc.pid})")
    info(f"Admin logs:   {log_file}")


def stop_admin(repo, quiet=False):
    pid_file = _pid_file(repo)
    if not pid_file.exists():
        return
    with open(pid_file) as f:
        for line in f:
            line = line.strip()
            if "=" not in line:
                continue
            name, pid_str = line.split("=", 1)
            pid = int(pid_str)
            try:
                if is_windows():
                    subprocess.run(
                        ["taskkill", "/F", "/T", "/PID", str(pid)],
                        stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False,
                    )
                else:
                    os.kill(pid, signal.SIGTERM)
                if not quiet:
                    info(f"Stopped {name} dev server (PID {pid})")
            except (ProcessLookupError, OSError):
                pass
    pid_file.unlink(missing_ok=True)


def admin_status(repo):
    pid_file = _pid_file(repo)
    if not pid_file.exists():
        info("Admin dev server: not running")
        return
    with open(pid_file) as f:
        for line in f:
            line = line.strip()
            if "=" not in line:
                continue
            name, pid_str = line.split("=", 1)
            pid = int(pid_str)
            running = _is_process_running(pid)
            status = "running" if running else "stopped"
            info(f"Admin dev server: {status}  (PID {pid}, http://localhost:{ADMIN_APP['port']})")


# ── Mobile: LAN IP + .env generation ─────────────────────────────────────────

def _get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(2)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


def ensure_mobile_env(repo):
    """Write apps/mobile/.env with the machine's LAN IP for Expo dev."""
    ip = _get_local_ip()
    app_dir = repo / MOBILE_APP["dir"]
    if not app_dir.is_dir():
        return

    env_content = (
        f"# Auto-generated by setup.py — LAN IP: {ip}\n"
        f"EXPO_PUBLIC_API_URL=http://{ip}:3001\n"
    )
    env_file = app_dir / ".env"
    env_file.write_text(env_content)
    info(f"Mobile .env: EXPO_PUBLIC_API_URL=http://{ip}:3001")
    return ip


# ── Mobile data bundle ────────────────────────────────────────────────────────

def generate_mosque_bundle(repo):
    """Merge /data/mosques/**/*.json into the mobile app's bundled asset."""
    script = repo / "scripts" / "generate-mosque-bundle.py"
    if not script.exists():
        info("  WARNING: generate-mosque-bundle.py not found — skipping bundle generation.")
        return
    info("Generating mosque data bundle for mobile app...")
    run_visible([sys.executable, str(script)], cwd=str(repo))


def cmd_generate_data(repo):
    header("Generating Data Assets")
    generate_mosque_bundle(repo)
    info("")
    info("Bundle written to apps/mobile/assets/data/mosques-index.json")
    info("Rebuild or reload the mobile app to pick up the new data.")


# ── Android build helpers ─────────────────────────────────────────────────────

def _check_android_prerequisites():
    """Upfront checks for Node, npm, Java, and Android SDK before any build work."""
    # -- Node --
    if not has_cmd("node"):
        die("Node.js is not installed.\n"
            "  Install Node.js 20+ from: https://nodejs.org/")
    try:
        ver = subprocess.check_output(["node", "--version"], text=True).strip()
        major = int(ver.lstrip("v").split(".")[0])
        if major < 18:
            die(f"Node.js {ver} is too old. Need 18+.\n"
                "  Install from: https://nodejs.org/")
        info(f"Node.js {ver} ✓")
    except Exception:
        die("Could not determine Node.js version.")

    # -- npm --
    if not has_cmd("npm"):
        die("npm is not installed. Install Node.js 20+: https://nodejs.org/")
    try:
        npm_cmd = ["cmd", "/c", "npm", "--version"] if is_windows() else ["npm", "--version"]
        npm_ver = subprocess.check_output(npm_cmd, text=True).strip()
        info(f"npm {npm_ver} ✓")
    except Exception:
        die("Could not determine npm version.")

    # -- Java --
    java_found = False
    try:
        out = subprocess.check_output(["java", "-version"],
                                      stderr=subprocess.STDOUT, text=True)
        m = re.search(r'version "(\d+)', out)
        if m:
            jmajor = int(m.group(1))
            if jmajor < 17:
                die(f"Java {jmajor} found but need Java 17+.\n"
                    "  Install JDK 17+ from: https://adoptium.net/")
            info(f"Java {jmajor} ✓")
            java_found = True
    except Exception:
        pass
    if not java_found:
        # Also check common Windows install paths
        if is_windows():
            for base in [
                Path("C:/Program Files/Java"),
                Path("C:/Program Files/Eclipse Adoptium"),
                Path("C:/Program Files/Microsoft"),
                Path("C:/Program Files/Amazon Corretto"),
            ]:
                if base.exists() and any(base.iterdir()):
                    java_found = True
                    info("Java found in Program Files ✓")
                    break
        if not java_found:
            die("Java (JDK 17+) not found.\n"
                "  Install from: https://adoptium.net/")

    # -- Android SDK --
    sdk_root = (
        os.environ.get("ANDROID_HOME")
        or os.environ.get("ANDROID_SDK_ROOT")
    )
    if not sdk_root:
        if is_windows():
            default = Path(os.environ.get("LOCALAPPDATA", "")) / "Android" / "Sdk"
        elif is_mac():
            default = Path.home() / "Library" / "Android" / "sdk"
        else:
            default = Path.home() / "Android" / "Sdk"
        if default.is_dir():
            sdk_root = str(default)
            info(f"Android SDK found at {sdk_root} ✓")
        else:
            die("Android SDK not found. Set ANDROID_HOME or install Android Studio.\n"
                "  https://developer.android.com/studio")
    else:
        info(f"Android SDK: {sdk_root} ✓")
    # Verify build-tools exist
    build_tools = Path(sdk_root) / "build-tools"
    if not build_tools.is_dir() or not any(build_tools.iterdir()):
        die(f"Android build-tools not found under {sdk_root}.\n"
            "  Open Android Studio → SDK Manager and install build-tools.")


def _stop_gradle_daemons(android_dir):
    info("Stopping Gradle daemons...")
    gradlew = "gradlew.bat" if is_windows() else "gradlew"
    gradlew_path = android_dir / gradlew
    if gradlew_path.exists():
        cmd = ["cmd", "/c", f".\\{gradlew}", "--stop"] if is_windows() else [str(gradlew_path), "--stop"]
        try:
            subprocess.run(cmd, cwd=str(android_dir), check=False,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=12)
        except subprocess.TimeoutExpired:
            warn("gradlew --stop timed out; force-killing Gradle daemons...")
        except Exception:
            pass
    if is_windows():
        ps = (
            r"Get-CimInstance Win32_Process | "
            r"Where-Object { $_.Name -eq 'java.exe' -and $_.CommandLine -match 'GradleDaemon' } | "
            r"ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"
        )
        subprocess.run(["powershell", "-NoProfile", "-Command", ps],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    else:
        subprocess.run(["pkill", "-f", "GradleDaemon"],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
    time.sleep(1)


def _clean_gradle_caches(android_dir, nuke_global=False):
    info("Clearing Gradle caches...")
    gradle_home = Path.home() / ".gradle"
    daemon_dir = gradle_home / "daemon"
    if daemon_dir.exists():
        info(f"  Removing {daemon_dir}")
        shutil.rmtree(daemon_dir, ignore_errors=True)
    if nuke_global:
        caches_dir = gradle_home / "caches"
        if caches_dir.exists():
            info(f"  Removing {caches_dir}")
            shutil.rmtree(caches_dir, ignore_errors=True)
    else:
        info("  Keeping ~/.gradle/caches for stability (use --nuke-gradle to wipe)")
    for sub in (".gradle", "build", "app/build", "app/.cxx"):
        target = android_dir / sub
        if target.exists():
            info(f"  Removing {target}")
            shutil.rmtree(target, ignore_errors=True)


def _ensure_mobile_deps(app_dir, fresh=False):
    node_modules = app_dir / "node_modules"
    pkg_json = app_dir / "package.json"
    if fresh and node_modules.is_dir():
        info("Removing node_modules for fresh install...")
        shutil.rmtree(node_modules, ignore_errors=True)
    elif node_modules.is_dir():
        if not pkg_json.exists() or pkg_json.stat().st_mtime <= node_modules.stat().st_mtime:
            return
    info("Installing mobile dependencies (npm install)...")
    if not has_cmd("npm"):
        die("npm is not installed. Install Node.js 20+ first: https://nodejs.org/")
    # --legacy-peer-deps: prevents npm from auto-installing peer deps like
    # expo-linking@55.x / expo-font@55.x that get hoisted to root node_modules
    # and break the Android build with missing 'expo-module-gradle-plugin'
    cmd = (["cmd", "/c", "npm", "install", "--legacy-peer-deps"]
           if is_windows() else ["npm", "install", "--legacy-peer-deps"])
    run_visible(cmd, cwd=str(app_dir))



def _patch_expo_modules_core_gradle(app_dir):
    """Fix MissingPropertyException for 'components.release' in ExpoModulesCorePlugin.gradle.
    AGP 8.3 (used by React Native 0.74) registers the release SoftwareComponent later
    in the lifecycle than AGP 8.1, so the direct 'from components.release' inside
    afterEvaluate throws. Replace with a null-safe findByName guard.
    Checks both app-local and workspace-root node_modules (npm workspaces hoisting)."""
    candidate_paths = [
        app_dir / "node_modules" / "expo-modules-core" / "android" / "ExpoModulesCorePlugin.gradle",
        # npm workspaces may hoist expo-modules-core to the monorepo root node_modules
        app_dir.parent.parent / "node_modules" / "expo-modules-core" / "android" / "ExpoModulesCorePlugin.gradle",
    ]
    old = "from components.release"
    new = 'def _comp = components.findByName("release"); if (_comp != null) { from _comp }'
    for plugin_file in candidate_paths:
        if not plugin_file.exists():
            continue
        content = plugin_file.read_text(encoding="utf-8")
        if old not in content:
            continue  # already patched or different version
        patched = content.replace(old, new)
        plugin_file.write_text(patched, encoding="utf-8")
        info(f"Patched ExpoModulesCorePlugin.gradle: replaced components.release with guarded lookup ({plugin_file})")


def _patch_gradle_wrapper(android_dir):
    """Pin Gradle wrapper to exactly 8.7.
    - Gradle ≤8.6 ships with ASM 9.5 which crashes on kotlin-compiler-embeddable
      1.9.24 class files (ArrayIndexOutOfBoundsException in ClassReader).
    - Gradle 8.7 ships with ASM 9.6 which handles Kotlin 1.9.24 correctly.
    - Gradle ≥8.8 has additional compatibility issues with expo-modules-core.
    NOTE: Gradle 8.7 alone is not sufficient for Expo SDK 51 / RN 0.74.
    One additional patch is also required (applied separately):
      - ExpoModulesCorePlugin.gradle: null-safe components.findByName for AGP 8.3+"""
    props = android_dir / "gradle" / "wrapper" / "gradle-wrapper.properties"
    if not props.exists():
        return
    content = props.read_text(encoding="utf-8")
    # Match gradle-X.Y or gradle-X.Y.Z in the distributionUrl
    m = re.search(r"gradle-(\d+)\.(\d+)", content)
    if not m:
        return
    major, minor = int(m.group(1)), int(m.group(2))
    if (major, minor) == (8, 7):
        info(f"Gradle wrapper: {major}.{minor} (compatible, no patch needed)")
        return
    # Replace the version portion in the URL
    patched = re.sub(
        r"(gradle-)(\d+\.\d+(?:\.\d+)?)([-\w]*\.zip)",
        r"\g<1>8.7\3",
        content,
    )
    if patched != content:
        props.write_text(patched, encoding="utf-8")
        info(f"Patched gradle-wrapper.properties: {major}.{minor} → 8.7 (ASM 9.6 for Kotlin 1.9.24, stable with expo-modules-core)")


def _patch_ndk_version(android_dir):
    """On Windows, downgrade NDK 26.1.10909125 → 25.1.8937393.

    NDK 26.1 ships with a broken ld.lld.exe on Windows that fails with
    'Unknown error (0xC1)' when linking any C/C++ code (e.g. expo-av,
    expo-modules-core).  NDK 25.1 is the stable LTS release that works
    correctly on all platforms, including Windows.  NDK 26.3 also fixed
    the Windows linker, but 25.1 is better-tested with RN 0.74 / Expo 51.

    The ndkVersion field lives in the top-level android/build.gradle that
    expo prebuild generates from react-native's template.  We patch it here
    rather than requiring users to install a specific NDK themselves."""
    if not is_windows():
        return
    build_gradle = android_dir / "build.gradle"
    if not build_gradle.exists():
        return
    content = build_gradle.read_text(encoding="utf-8")
    BROKEN_NDK = "26.1.10909125"
    STABLE_NDK = "25.1.8937393"
    if BROKEN_NDK not in content:
        if STABLE_NDK in content:
            info(f"NDK version: {STABLE_NDK} (already patched, no action needed)")
        return
    patched = content.replace(BROKEN_NDK, STABLE_NDK)
    build_gradle.write_text(patched, encoding="utf-8")
    info(f"Patched build.gradle: ndkVersion {BROKEN_NDK} → {STABLE_NDK} (fixes ld.lld.exe 0xC1 on Windows)")


def _preflight_check_settings_gradle(android_dir):
    """Scan settings.gradle for includeBuild entries and verify each path exists.
    Emits clear diagnostics so the cause of 'Included build does not exist' errors
    is visible before Gradle even starts."""
    settings = android_dir / "settings.gradle"
    if not settings.exists():
        return
    content = settings.read_text(encoding="utf-8")
    info("  Pre-flight: verifying includeBuild paths in settings.gradle...")
    # Match simple quoted includeBuild("...") entries
    for m in re.finditer(r'includeBuild\s*\(\s*["\']([^"\']+)["\']\s*\)', content):
        rel = m.group(1)
        abs_path = (android_dir / rel).resolve()
        if abs_path.exists():
            info(f"    OK   {rel}  →  {abs_path}")
        else:
            info(f"    MISSING  {rel}  →  {abs_path}")
            info(f"    FIX: run 'npm install' in the directory that owns expo-modules-core")
    # Also flag any dynamic includeBuild(new File(...)) for @react-native/gradle-plugin
    if re.search(r'includeBuild\s*\(\s*new\s+File\s*\(', content):
        info("    NOTE: dynamic includeBuild(new File(...)) detected — path resolved at build time by Node")


def _ensure_expo_prebuild(app_dir, clean=False):
    gradlew = "gradlew.bat" if is_windows() else "gradlew"
    if (app_dir / "android" / gradlew).exists() and not clean:
        _ensure_cleartext_traffic(app_dir)
        _patch_gradle_wrapper(app_dir / "android")
        _patch_ndk_version(app_dir / "android")
        _patch_expo_modules_core_gradle(app_dir)
        return
    cmd_args = ["npx", "expo", "prebuild", "--platform", "android"]
    if clean:
        cmd_args.append("--clean")
        info("Running: npx expo prebuild --platform android --clean")
    else:
        info("Running: npx expo prebuild --platform android")
    if is_windows():
        cmd_args = ["cmd", "/c"] + cmd_args
    run_visible(cmd_args, cwd=str(app_dir))
    _patch_gradle_wrapper(app_dir / "android")
    _patch_ndk_version(app_dir / "android")
    _ensure_cleartext_traffic(app_dir)
    _patch_expo_modules_core_gradle(app_dir)


def _ensure_cleartext_traffic(app_dir):
    """Patch AndroidManifest.xml to allow plain HTTP for local dev."""
    manifest = app_dir / "android" / "app" / "src" / "main" / "AndroidManifest.xml"
    if not manifest.exists():
        return
    content = manifest.read_text()
    if "usesCleartextTraffic" in content:
        return
    patched = content.replace(
        "<application",
        '<application android:usesCleartextTraffic="true"',
        1,
    )
    if patched != content:
        manifest.write_text(patched)
        info("Patched AndroidManifest.xml: added usesCleartextTraffic=true")


def _clean_stale_outputs(app_dir):
    for d in [
        app_dir / "android" / "app" / "build" / "outputs",
        app_dir / "android" / "app" / ".cxx",
        app_dir / "android" / ".gradle",
    ]:
        if d.exists():
            shutil.rmtree(d, ignore_errors=True)


def _find_apk(outputs_dir):
    if not outputs_dir.exists():
        return None
    apks = list(outputs_dir.rglob("*.apk"))
    return max(apks, key=lambda p: p.stat().st_mtime) if apks else None


def _java_major_from(java_exe):
    try:
        out = subprocess.check_output([str(java_exe), "-version"],
                                      stderr=subprocess.STDOUT, text=True)
        m = re.search(r'version "(\d+)', out)
        return int(m.group(1)) if m else None
    except Exception:
        return None


def _detect_agp_version(android_dir):
    for fname in ["build.gradle", "build.gradle.kts", "settings.gradle", "settings.gradle.kts"]:
        f = android_dir / fname
        if not f.exists():
            continue
        t = f.read_text(encoding="utf-8", errors="ignore")
        m = re.search(r"com\.android\.tools\.build:gradle:([0-9.]+)", t)
        if m:
            return m.group(1)
    return None


def _select_jdk_for_android(android_dir):
    agp = _detect_agp_version(android_dir)
    agp_major = int(agp.split(".")[0]) if agp else 8
    min_java = 17 if agp_major >= 8 else (11 if agp_major == 7 else 8)
    preferred = (17, 21) if agp_major >= 8 else (11, 17)
    info(f"Android toolchain: AGP={agp or 'unknown'}, requires Java {min_java}+")

    jh = os.environ.get("JAVA_HOME")
    candidates = []
    homes = []
    if jh:
        homes.append(Path(jh))
    if is_windows():
        for base in [
            Path("C:/Program Files/Java"),
            Path("C:/Program Files/Eclipse Adoptium"),
            Path("C:/Program Files/Microsoft"),
            Path("C:/Program Files/Amazon Corretto"),
        ]:
            if base.exists():
                for d in base.iterdir():
                    if d.is_dir() and "jdk" in d.name.lower():
                        homes.append(d)
    for home in homes:
        java_exe = home / "bin" / ("java.exe" if is_windows() else "java")
        if not java_exe.exists():
            continue
        major = _java_major_from(java_exe)
        if major is not None and major >= min_java:
            candidates.append((major, home))

    if not candidates:
        try:
            out = subprocess.check_output(["java", "-version"],
                                          stderr=subprocess.STDOUT, text=True)
            m = re.search(r'version "(\d+)', out)
            if m and int(m.group(1)) >= min_java:
                info("Using Java from PATH.")
                return None
        except Exception:
            pass
        die(f"No compatible JDK found. Need Java {min_java}+ for this Android project.\n"
            f"  Install from: https://adoptium.net/")

    candidates.sort(key=lambda x: (0 if x[0] in preferred else 1, -x[0]))
    selected = candidates[0][1]
    info(f"Selected JDK: {selected} (Java {candidates[0][0]})")
    return selected


def _run_streaming(cmd, cwd=None, env=None):
    tail = []
    p = subprocess.Popen(cmd, cwd=cwd, env=env, stdout=subprocess.PIPE,
                         stderr=subprocess.STDOUT, text=True,
                         encoding="utf-8", errors="replace")
    while True:
        line = p.stdout.readline()
        if not line and p.poll() is not None:
            break
        if line:
            print(line, end="")
            tail.append(line)
            if len(tail) > 250:
                tail = tail[-250:]
    return p.wait(), "".join(tail)


def _gradle_build_with_retry(android_dir, base_cmd, env):
    rc, tail = _run_streaming(base_cmd, cwd=str(android_dir), env=env)
    if rc == 0:
        return
    tail_lower = tail.lower()
    if "daemon disappeared" in tail_lower or "jvm crash" in tail_lower or "hs_err" in tail_lower:
        warn("Gradle daemon crashed. Stopping daemons and retrying with --no-daemon...")
        _stop_gradle_daemons(android_dir)
    else:
        warn("Gradle build failed. Retrying with conservative settings...")
    retry_env = dict(env)
    retry_env["GRADLE_OPTS"] = "-Dorg.gradle.jvmargs=-Xmx2g -Dfile.encoding=UTF-8"
    retry_env.pop("JAVA_TOOL_OPTIONS", None)
    retry_cmd = base_cmd + ["--no-daemon", "--no-parallel", "--max-workers=1"]
    rc2, _ = _run_streaming(retry_cmd, cwd=str(android_dir), env=retry_env)
    if rc2 != 0:
        raise RuntimeError("Android build failed after retry.")


def cmd_android(repo, fresh=False, nuke_gradle=False):
    """Build Android APK for the mobile app."""
    app_dir = repo / MOBILE_APP["dir"]
    android_dir = app_dir / "android"

    if not app_dir.is_dir():
        die(f"Mobile app directory not found: {MOBILE_APP['dir']}")

    steps = 7 if fresh else 5
    header(f"Building Android APK — LiveAzan Mobile" + (" [FRESH]" if fresh else ""))

    info("Checking prerequisites...")
    _check_android_prerequisites()

    info("Generating mobile .env with local IP...")
    ensure_mobile_env(repo)

    info(f"Step 1/{steps}: Checking dependencies...")
    _ensure_mobile_deps(app_dir, fresh=fresh)

    if fresh:
        info(f"Step 2/{steps}: Stopping Gradle daemons...")
        _stop_gradle_daemons(android_dir)
        info(f"Step 3/{steps}: Clearing Gradle caches...")
        _clean_gradle_caches(android_dir, nuke_global=nuke_gradle)
        info(f"Step 4/{steps}: Fresh prebuild...")
    else:
        info(f"Step 2/{steps}: Checking Android prebuild...")

    step_prebuild = 5 if fresh else 3
    info(f"Step {step_prebuild}/{steps}: Ensuring Android prebuild...")
    _ensure_expo_prebuild(app_dir, clean=fresh)

    step_clean = 6 if fresh else 4
    info(f"Step {step_clean}/{steps}: Cleaning stale build outputs...")
    _clean_stale_outputs(app_dir)

    step_build = 7 if fresh else 5
    info(f"Step {step_build}/{steps}: Running Gradle assembleRelease...")

    # Pre-flight: verify that every includeBuild path in settings.gradle exists,
    # so failures are diagnosed here rather than deep inside Gradle's stack trace.
    _preflight_check_settings_gradle(android_dir)

    if is_windows():
        gradle_cmd = ["cmd", "/c", ".\\gradlew.bat", "clean", "assembleRelease",
                      "--no-configuration-cache", "--stacktrace", "--warning-mode", "all"]
    else:
        gradlew = android_dir / "gradlew"
        if gradlew.exists() and not os.access(gradlew, os.X_OK):
            gradlew.chmod(gradlew.stat().st_mode | 0o755)
        gradle_cmd = ["./gradlew", "clean", "assembleRelease",
                      "--no-configuration-cache", "--stacktrace", "--warning-mode", "all"]

    build_env = dict(os.environ)
    build_env.setdefault("GRADLE_OPTS",
                         "-Dorg.gradle.jvmargs=-Xmx3g -Dfile.encoding=UTF-8")
    build_env.pop("JAVA_TOOL_OPTIONS", None)
    build_env.setdefault("NODE_ENV", "production")

    selected_jdk = _select_jdk_for_android(android_dir)
    if selected_jdk is not None:
        build_env["JAVA_HOME"] = str(selected_jdk)
        sep = ";" if is_windows() else ":"
        build_env["PATH"] = str(Path(selected_jdk) / "bin") + sep + build_env.get("PATH", "")

    _gradle_build_with_retry(android_dir, gradle_cmd, build_env)

    outputs_dir = android_dir / "app" / "build" / "outputs"
    apk = _find_apk(outputs_dir)
    if not apk:
        die(f"No APK found under: {outputs_dir}")

    dist_dir = app_dir / "dist"
    dist_dir.mkdir(parents=True, exist_ok=True)
    timestamp = time.strftime("%Y%m%d_%H%M")
    dest = dist_dir / f"LiveAzan_release_{timestamp}.apk"
    shutil.copy2(apk, dest)

    header("Build Complete")
    info(f"APK: {dest}")


# ── Admin credentials helper ──────────────────────────────────────────────────

def _read_env_value(env_file, key):
    """Read a single key from a .env file."""
    try:
        for line in Path(env_file).read_text().splitlines():
            line = line.strip()
            if line.startswith(f"{key}="):
                return line[len(key) + 1:]
    except Exception:
        pass
    return None


def print_admin_credentials(repo, mode):
    env_file = repo / (".env.local" if mode == "local" else ".env.prod")
    email    = _read_env_value(env_file, "ADMIN_EMAIL")
    password = _read_env_value(env_file, "ADMIN_PASSWORD")
    if not email:
        email    = "admin@liveaszan.local" if mode == "local" else "admin@liveaszan.com"
        password = "(see ADMIN_PASSWORD in env file)"
    info("")
    info("  ┌─ Default Admin Account ──────────────────────┐")
    info(f"  │  Email:    {email:<35}│")
    info(f"  │  Password: {(password or '(see env file)'):<35}│")
    info("  │  Login at the Admin Portal URL above.        │")
    info("  └──────────────────────────────────────────────┘")
    info("")


# ── Commands ──────────────────────────────────────────────────────────────────

def cmd_up(repo, mode):
    header(f"Starting LiveAzan {mode.upper()} stack")

    if mode == "local":
        ensure_env_local(repo)
        compose_up(repo, mode)

        header("Mobile Data Bundle")
        generate_mosque_bundle(repo)

        header("Starting Admin Dev Server")
        start_admin(repo)

        header("Mobile Setup")
        ip = ensure_mobile_env(repo)

        header("Container Status")
        compose_status(repo, mode)

        info("")
        info("LiveAzan local stack is running.")
        info("")
        info("  Backend API:   http://localhost:3001/api/health")
        info(f"  Admin Portal:  http://localhost:{ADMIN_APP['port']}")
        info("")
        info("  Mobile dev:")
        info(f"    API URL:     http://{ip or 'localhost'}:3001")
        info(f"    Start Expo:  cd apps/mobile && npx expo start")
        info("")
        info("  Database:      localhost:5432  (liveaszan / see .env.local)")
        print_admin_credentials(repo, mode)
    else:
        ensure_env_prod(repo)
        compose_up(repo, mode)

        header("Mobile Data Bundle")
        generate_mosque_bundle(repo)

        header("Container Status")
        compose_status(repo, mode)

        info("")
        info("LiveAzan production stack is running.")
        info("  Admin Portal:  http://localhost:80")
        info("  Backend API:   http://localhost:3001/api/health")
        print_admin_credentials(repo, mode)


def cmd_restart(repo, mode):
    header(f"Restarting LiveAzan {mode.upper()} stack (rebuilding, keeping data)")

    if mode == "local":
        stop_admin(repo)
    compose_down(repo, mode, wipe_volumes=False)
    compose_up(repo, mode)

    if mode == "local":
        start_admin(repo)
        ensure_mobile_env(repo)

    header("Container Status")
    compose_status(repo, mode)
    info("Restart complete. Images rebuilt, data volumes preserved.")


def cmd_down(repo):
    header("Stopping LiveAzan containers")
    stop_admin(repo)
    info("Stopping local stack...")
    compose_down(repo, "local", wipe_volumes=False)
    info("Stopping production stack...")
    compose_down(repo, "production", wipe_volumes=False)
    info("All containers stopped. Data is preserved.")
    info("Run 'python setup.py local' or 'python setup.py production' to start again.")


def cmd_clean(repo):
    header("Full Clean")
    info("This will DELETE all LiveAzan Docker data:")
    info("  - Stop and remove all containers")
    info("  - Delete database volumes (all PostgreSQL data)")
    info("  - Remove built Docker images")
    info("")
    if not ask_yes_no("Are you sure you want to wipe everything?"):
        info("Cancelled.")
        return

    stop_admin(repo)
    compose_down(repo, "local", wipe_volumes=True)
    compose_down(repo, "production", wipe_volumes=True)

    for project in [PROJECT_LOCAL, PROJECT_PROD]:
        try:
            out = run(["docker", "images", "--filter", f"reference={project}*",
                       "--format", "{{.ID}}"], check=False)
            ids = [i.strip() for i in out.splitlines() if i.strip()]
            if ids:
                run(["docker", "rmi", "-f"] + ids, check=False)
                info(f"Removed {len(ids)} image(s) for {project}")
        except Exception:
            pass

    info("Clean complete. Next start will rebuild everything from scratch.")


def cmd_status(repo):
    header("LOCAL Stack — Containers")
    compose_status(repo, "local")
    header("LOCAL Stack — Admin Dev Server")
    admin_status(repo)
    header("PRODUCTION Stack — Containers")
    compose_status(repo, "production")


def show_help():
    print(textwrap.dedent("""
    LiveAzan — Setup & Build Tool

    USAGE:
      python setup.py <command> [options]

    DOCKER COMMANDS:
      local                 Start local dev stack
                            (PostgreSQL + Server in Docker; Admin as background process)
      production            Start full production stack
                            (PostgreSQL + Server + Admin/nginx all in Docker)
      restart <mode>        Rebuild images and restart after code changes
                            Data volumes are preserved.
                            mode: local or production
      down                  Stop all LiveAzan containers (data is preserved)
      clean                 Full wipe: containers + volumes + images

    STATUS:
      status                Show running containers + admin dev server

    MOBILE BUILD:
      android local         Build Android APK for the mobile app
                            Sets EXPO_PUBLIC_API_URL to your LAN IP automatically
      android local --fresh Fresh build: stops Gradle daemons, cleans caches,
                            runs expo prebuild --clean, then builds
      android local --fresh --nuke-gradle
                            Also wipes ~/.gradle/caches (slow; use to fix corruption)

    OTHER:
      --help, -h            Show this help

    EXAMPLES:
      python setup.py local                  # First-time local dev
      python setup.py restart local          # After pulling new code
      python setup.py production             # Run full production stack
      python setup.py down                   # Stop everything, keep data
      python setup.py clean                  # Nuclear reset
      python setup.py android local          # Build Android APK
      python setup.py android local --fresh  # Fresh Android build

    WHAT IT HANDLES AUTOMATICALLY:
      - Detects your OS (Windows / macOS / Linux)
      - Checks Docker is installed and running
      - Windows: checks WSL2 / Hyper-V virtualization
      - Creates .env.local / .env.prod from examples if missing
      - Builds Docker images and starts containers
      - Starts admin Vite dev server as a background process
      - Detects your LAN IP for mobile Expo dev
      - Android: detects JDK version, runs Gradle, copies APK to dist/

    URLs (local mode):
      Backend API:   http://localhost:3001/api/health
      Admin Portal:  http://localhost:5174
      Mobile Expo:   cd apps/mobile && npx expo start
    """))


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    args = sys.argv[1:]

    print("\n" + "=" * 60)
    print("  LiveAzan — Setup Script")
    print(f"  Platform: {platform.system()} {platform.machine()}")
    print("=" * 60)

    if not args or args[0] in ("--help", "-h", "help"):
        show_help()
        sys.exit(0)

    command  = args[0].lower()
    mode_arg = args[1].lower() if len(args) > 1 else None
    extra    = [a.lower() for a in args[2:]]

    repo = Path(__file__).parent.resolve()

    # ── Android build (no Docker required) ──────────────────────────────
    if command == "android":
        if mode_arg != "local":
            die("Usage: python setup.py android local [--fresh] [--nuke-gradle]")
        if not has_cmd("node") or not has_cmd("npx"):
            die("Node.js is required for mobile builds.\n"
                "  Install: https://nodejs.org/")
        fresh       = "--fresh" in extra
        nuke_gradle = "--nuke-gradle" in extra
        cmd_android(repo, fresh=fresh, nuke_gradle=nuke_gradle)
        return

    # ── All other commands need Docker ───────────────────────────────────
    if not has_cmd("docker"):
        die(
            "Docker is not installed.\n"
            "  Windows / macOS: Install Docker Desktop\n"
            "    https://www.docker.com/products/docker-desktop\n"
            "  Linux: Install Docker Engine\n"
            "    https://docs.docker.com/engine/install/"
        )

    if is_windows():
        windows_check_virtualization()

    wait_docker()

    if is_windows():
        windows_check_docker_backend()

    detect_compose()

    compose_ver = run(COMPOSE_CMD + ["version", "--short"], check=False).strip()
    info(f"Compose: {' '.join(COMPOSE_CMD)} ({compose_ver})")

    # ── Dispatch ─────────────────────────────────────────────────────────
    if command in ("local", "production"):
        cmd_up(repo, command)

    elif command == "restart":
        if mode_arg not in ("local", "production"):
            die("Usage: python setup.py restart local\n"
                "       python setup.py restart production")
        cmd_restart(repo, mode_arg)

    elif command == "down":
        cmd_down(repo)

    elif command == "clean":
        cmd_clean(repo)

    elif command == "status":
        cmd_status(repo)

    elif command == "generate-data":
        cmd_generate_data(repo)

    else:
        die(f"Unknown command: '{command}'\n  Run 'python setup.py --help' for usage.")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n  Interrupted.")
        sys.exit(130)
    except RuntimeError as e:
        die(str(e))
