"""PlanView Dash on a Home Assistant newer than the test plugin supports.

pytest-homeassistant-custom-component pins one Home Assistant version per release and
can lag behind (its last release is for 2026.10, while Home Assistant 2026.11 replaced
httpx and voluptuous underneath). Until it catches up, this script starts the real
Home Assistant from tests/ha/requirements-newest-ha.txt without the plugin and checks
what matters most: the integration loads, its schemas accept and refuse what they
should, setup from YAML adds the panel, the site files need a login, and only
administrators save. When the plugin supports the version, raise tests/ha/requirements.txt and drop
this job.

Run:  pip install -r tests/ha/requirements-newest-ha.txt && python tests/ha/check_newest.py
"""

from __future__ import annotations

import homeassistant  # noqa: F401  (first: it aliases httpx and voluptuous before anything imports them)

import asyncio
import json
import logging
import shutil
import sys
import tempfile
from pathlib import Path

from aiohttp import ClientSession

from homeassistant import bootstrap, runner
from homeassistant.const import __version__ as HA_VERSION

REPO = Path(__file__).resolve().parents[2]
DOMAIN = "planview_dash"
PORT = 18123


class Problems(logging.Handler):
    """Errors from PlanView Dash, and Home Assistant's warnings about blocking calls in it."""

    def __init__(self) -> None:
        super().__init__(logging.WARNING)
        self.found: list[str] = []

    def emit(self, record: logging.LogRecord) -> None:
        text = record.getMessage()
        ours = record.name.startswith("custom_components.planview_dash") or "custom_components/planview_dash" in text
        if ours and (record.levelno >= logging.ERROR or "Detected blocking call" in text):
            self.found.append(text.splitlines()[0][:300])


PROBLEMS = Problems()


def check(ok: bool, what: str) -> None:
    print(("ok    " if ok else "FAIL  ") + what)
    if not ok:
        raise SystemExit(1)


def refused(schema, value) -> bool:
    try:
        schema(value)
    except Exception:  # voluptuous' Invalid, or what replaces it
        return True
    return False


def check_schemas() -> None:
    sys.path.insert(0, str(REPO))
    from custom_components.planview_dash import CONFIG_SCHEMA, config_flow, diagnostics, sensor, views  # noqa: F401
    from custom_components.planview_dash.goodnight import SCHEMA

    conf = CONFIG_SCHEMA({DOMAIN: {"dashboards": [{"site": "my-home"}], "github_token": "old"}})
    check(conf[DOMAIN]["dashboards"][0]["title"] == "PlanView Dash", "CONFIG_SCHEMA fills in defaults")
    check(refused(CONFIG_SCHEMA, {DOMAIN: {"dashboards": [{"site": "../x"}]}}), "CONFIG_SCHEMA refuses a bad site id")
    call = SCHEMA({"site": "home", "entity_id": "light.a", "minutes": "5", "then": "script.x"})
    check(call == {"site": "home", "entity_id": ["light.a"], "minutes": 5.0, "then": "script.x", "cancel": False},
          "goodnight schema reads a call")
    for bad in ({"site": "home", "entity_id": ["lock.door"]}, {"site": "home", "minutes": 500}, {"site": "home", "then": "lock.x"}):
        check(refused(SCHEMA, bad), f"goodnight schema refuses {bad}")


async def check_setup(config_dir: Path) -> None:
    shutil.copytree(REPO / "custom_components", config_dir / "custom_components")
    (config_dir / "configuration.yaml").write_text(
        f"http:\n  server_host: 127.0.0.1\n  server_port: {PORT}\n"
        f"{DOMAIN}:\n  dashboards:\n    - site: demo\n      title: Demo\n",
        encoding="utf-8",
    )
    hass = await bootstrap.async_setup_hass(runner.RuntimeConfig(config_dir=str(config_dir), skip_pip=True))
    check(hass is not None, "Home Assistant starts")
    try:
        await hass.async_start()
        await hass.async_block_till_done()
        check(DOMAIN in hass.config.components, f"{DOMAIN} sets up from YAML")

        from homeassistant.components import frontend
        panels = hass.data[frontend.DATA_PANELS]
        check(any(p.sidebar_title == "Demo" for p in panels.values()), "the dashboard is in the sidebar")

        async def token(name: str, group: str) -> dict:
            user = await hass.auth.async_create_user(name, group_ids=[group])
            refresh = await hass.auth.async_create_refresh_token(user, "http://localhost/")
            return {"Authorization": f"Bearer {hass.auth.async_create_access_token(refresh)}"}

        admin = await token("Admin", "system-admin")
        member = await token("Member", "system-users")
        site = "/api/planview_dash/sites/demo/site.json"
        saved = json.dumps({"name": "Checked", "floorplans": []})
        async with ClientSession() as http:
            base = f"http://127.0.0.1:{PORT}"
            async with http.get(base + site) as res:
                check(res.status == 401, f"site files need a login ({res.status})")
            async with http.put(base + site, data=saved) as res:
                check(res.status == 401, f"saving needs a login ({res.status})")
            async with http.put(base + site, data=saved, headers=member) as res:
                check(res.status == 403, f"only administrators save ({res.status})")
            async with http.put(base + site, data="[" * 100000, headers=admin) as res:
                check(res.status == 400, f"far too deeply nested JSON is refused ({res.status})")
            async with http.put(base + site, data=saved, headers=admin) as res:
                check(res.status == 200, f"an administrator saves ({res.status})")
            async with http.get(base + site, headers=member) as res:
                check(res.status == 200 and "floorplans" in await res.text(), f"a logged-in user reads the site ({res.status})")
            await hass.async_block_till_done()
            saved_file = config_dir / "planview_dash" / "sites" / "demo" / "site.json"
            stored = json.loads(await hass.async_add_executor_job(saved_file.read_text))
            check(stored == {"format": 1, "name": "Checked", "floorplans": []}, "the save is on disk in the current format")
            check(any(p.sidebar_title == "Demo" for p in panels.values()), "a dashboard from YAML keeps its title")
            async with http.get(f"{base}/planview_dash/frontend/panel.js") as res:
                check(res.status == 200, f"the dashboard code is served ({res.status})")
        check(not PROBLEMS.found, "no errors or blocking calls from PlanView Dash" + "".join(f"\n      {p}" for p in PROBLEMS.found))
    finally:
        await hass.async_stop()


def main() -> None:
    print(f"Home Assistant {HA_VERSION}")
    logging.getLogger().addHandler(PROBLEMS)
    check_schemas()
    # Left for the system to clear: removing it after Home Assistant ran trips its check
    # for blocking calls.
    asyncio.run(check_setup(Path(tempfile.mkdtemp(prefix="planview-ha-"))))
    print("All checks passed.")


if __name__ == "__main__":
    main()
