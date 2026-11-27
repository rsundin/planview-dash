# Changelog

## 1.0.0

**The first stable release.** PlanView Dash shows your home as a picture in Home Assistant: lights glow where they are, windows light up, solar panels glow while they produce, and a tap on a building lifts the roof to its floor plan, where every lamp and thermostat works in place. From 1.0 on, what you set up keeps working through every 1.x version (see [What stays the same](README.md#what-stays-the-same)), and version numbers follow SemVer: 1.0.1 fixes, 1.1.0 features, 2.0.0 breaking changes.

Coming from SmartHomeDash or a 0.x version? Update as usual and restart Home Assistant; your dashboards, pictures and settings are kept. [Upgrading](docs/setup.md#upgrading) has the details, including the one-time move from the old name. From a version before 0.8.35: the action `planview_dash.update` is gone (updates come from the Marketplace), and an automation that read the goodnight state should use `sensor.<site>_goodnight`.

### The picture

- **The overview picture** of your property, by day and by evening, with lamps glowing in their own colour and brightness (and colour temperature), windows lit in the colour of their room's lamps, wall lamps washing the facade and solar panels glowing green while they produce. No drone? [An overview picture without a drone](docs/overview-picture.md) makes one from a 3D map and an AI image model
- **Dusk and weather**: the day picture fades into the evening one as the sun sets; cloud, fog, rain and snow show on the picture
- **Lift the roof**: tap a building to open its floor plan. Apartments can use a floor plan alone, and several homes each get their own panel
- **Floor plans** with rooms tinted by temperature, a flame where a room is heating, every lamp switchable with a tap and the room panel a hold away. Open doors and windows, unlocked locks and alarms are marked on the plan and as a badge on the building; rooms with someone in them are outlined. Floor plan pictures are darkened a little so lit lamps stand out, adjustable per plan
- **LED strips as what they are**: a light can be drawn as a spot, a glowing line or a lit surface
- **Cameras on the picture**: place them on a floor plan or the overview, with a field-of-view wedge that turns red on motion, and tap for the live view (stills in light mode)
- **Pinch zoom** on phones and tablets, and a trackpad pinch on computers; a pinch or a drag never switches a lamp

### Rooms, lights and heating

- **The room panel**: thermostat with target, mode and presets (Comfort, Eco, Frost …), a 24-hour temperature graph, dimmers, blinds and curtains, doors, windows and every sensor in the room
- **Rooms linked to Home Assistant areas**: a linked room takes the area's name (and follows a rename), and its lights, thermostats and sensors show up by themselves until you place them. Floor plans can be linked to Home Assistant floors
- **All on and all off** from the header and the lights card, with lights you can leave out
- **Goodnight**: one tap, the lights stay on a few minutes while you go to bed, then turn off. It runs in Home Assistant as the action `planview_dash.goodnight`, with the countdown as `sensor.<site>_goodnight` on every screen, so automations, voice and NFC tags can start it too. See [Goodnight](docs/configuration.md#goodnight)
- **Devices that drop out say so**: a lamp, sensor, thermostat or energy sensor that Home Assistant reports as unavailable shows as not responding, never as off, 0° or 0 kW, and a command Home Assistant refuses is said on the screen ("Couldn't turn on Kitchen ceiling")
- **Names as Home Assistant shows them**, from the entity and device registry; a name set in `site.json` still wins
- **Homes in Fahrenheit** as well as Celsius, from Home Assistant's unit system

### Energy, prices and weather

- **Energy flow on the picture**: one line per flow, from the sun, battery or grid to the house, car, battery or grid, in the colour of the source and with the kilowatts on it, labels at each point ("Selling 2.4 kW", "Battery charging 2.0 kW · 64 %"), and the same in a plain sentence in the energy card. Power in any of Home Assistant's units, and both sign conventions for grid and battery, with a direction check in the setup guide. See [energy](docs/configuration.md#energy)
- **Electricity price** per hour or per quarter-hour, with "cheap now" and the cheapest hours ahead marked in the chart; Home Assistant's own Nord Pool integration works too. See [Electricity price](docs/configuration.md#electricity-price)
- **Cards** for weather, power now, energy today, outdoor and indoor lights, scenes and scripts, and heating per room
- **Warnings** above the picture: smoke, gas, carbon monoxide and water leaks, a window open while heating, low batteries, devices not responding, and devices the dashboard names that no longer exist in Home Assistant, with a shortcut to fix them in placement mode

### Setting it up

- **Set up entirely in the UI**: add a dashboard under **Settings → Devices & services**, and a setup guide walks through the pictures, buildings, solar panels, windows, floor plans and rooms, energy and weather sensors, buttons and wall screens. Undo and redo throughout. See [Setting up a new dashboard](docs/setup.md)
- **Quick start from Home Assistant**: a floor plan per floor with a tile per area, working before you draw anything; add a picture and draw the rooms when you like
- **Placement mode**: pick a light, switch, thermostat, temperature sensor or camera and tap where it is; drag to move, arrow keys to nudge. The devices that matter come first, the rest are folded away
- **Shape editing**: move and add corners, snap to other rooms, move a whole room with its lamps
- **Backup**: export a whole dashboard as a .zip, import it into another, and the last ten saves kept as restore points. Everything is checked before it is written
- **Two people editing** are asked before one save replaces the other's
- **A readable `site.json`** in `<config>/planview_dash/sites/<name>/`, or dashboards defined in `configuration.yaml`. The file says its format, and older files are upgraded by themselves. See [docs/configuration.md](docs/configuration.md) and [Format and compatibility](docs/configuration.md#format-and-compatibility)
- **Example house and apartment** to start from, also as an [online demo](https://rsundin.github.io/planview-dash/)

### Wall screens, tablets and phones

- **Kiosk mode** (`?kiosk`) hides Home Assistant's sidebar and the dashboard's own buttons and goes full screen. See [Wall screens and tablets](docs/setup.md#wall-screens-and-tablets)
- **The doorbell camera** on every open screen when someone rings; **idle mode** back to the overview; **night dimming** with a faint clock until a touch or a motion sensor wakes it. See [Wall screens](docs/configuration.md#wall-screens)
- **Light mode** (`?lite`) without blur or animation for older tablets, on by itself on weak devices, and fast on large homes: a performance budget is checked on every change
- **Text size per device** (the **Aa** button), keyboard use, screen reader names and checked contrast. See [Text size and accessibility](docs/setup.md#text-size-and-accessibility)

### In other dashboards

- **The card `custom:planview-dash-card`** shows the overview, a floor plan or a room inside any Home Assistant dashboard, with lamps, heating and the room panel working in it, sized by sections views, and suggested in the card picker for a lamp or thermostat in one of your rooms. See [The card](docs/setup.md#the-card)

### Languages, help and privacy

- **Seven languages**: Swedish, English, and machine-assisted Danish, German, Finnish, Norwegian and Dutch, with numbers and times in the language's own format. Corrections welcome: [docs/translating.md](docs/translating.md)
- **Help**: [Troubleshooting](docs/troubleshooting.md), and the **?** button, which fills in a bug report without details about your home. Home Assistant's diagnostics for PlanView Dash hold counts and sizes only
- **Private by design**: the dashboard runs behind Home Assistant's login with no access tokens, site files are served only to logged-in users and written only by administrators, and nothing calls outside services; the typefaces ship with it. See [SECURITY.md](SECURITY.md) and [Sharing your dashboard safely](docs/sharing.md)
- **Supported Home Assistant versions**: 2025.6 and newer, tested on 2025.6 and 2026.11. Install from the Marketplace (HACS before Home Assistant 2026.11)
