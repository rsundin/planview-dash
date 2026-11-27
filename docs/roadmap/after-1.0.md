# After 1.0: proposed roadmap, November 2026

A proposal; the order after 1.0 is decided (see below), the task details move into plan.md as each one starts. It builds on [plan.md](plan.md) (milestones 1.1 to 1.3) and [research-2026-11.md](research-2026-11.md), with a third research pass from 27 November 2026 aimed at what to build once 1.0.0 ships (earliest 11 December 2026). Nothing here changes code before 1.0; the feature freeze holds. When the owner has decided, the chosen parts move into plan.md and ROADMAP.md, and this file stays as the record of why.

Sources are numbered [P1], [P2] … and listed at the end. [R…] points to research-2026-11.md.

## What the owner asked for

- **Music and media from the picture**: lift the roof of the house (or open the apartment's plan) and control what plays in each room.
- **Lights, temperature and energy flow first**, as before.
- **Placement mode must not nag** about minor entities. A speaker that is not placed is fine.

## What the third pass found

### Media and music

- **Home Assistant has the building blocks.** Every `media_player` exposes `group_members` and the actions `media_player.join` and `unjoin`, `volume_set`, `media_play_pause`, `select_source` and `browse_media`; `supported_features` says which ones a player has [P1]. 2026.5 added source, sound mode and playback controls to the tile card, and triggers for "starts playing", "paused" and volume [P2].
- **Music Assistant is where multi-room happens.** 2.7 (December 2025) added AirPlay 2 and the Sendspin protocol for synced playback, Spotify Connect and AirPlay as inputs that can play on any speaker, per-speaker access, synced lyrics and a player in the browser [P3]. Its Home Assistant integration has actions for moving a queue to another player (`music_assistant.transfer_queue`) and for announcements (`play_announcement`) [P4]. 2026.5 added player options as entities [P2].
- **The popular media cards are lists, not places.** Mini Media Player (1.7k stars) does one player per card with a speaker-group checklist, volume kept in step with an offset per speaker, and text-to-speech to one, all or the group [P5]. Mediocre Media Player Cards (449 stars) splits it into a player card, a big card, a multi-player card and a "chip" row for grouping, with Music Assistant queue and search [P6]. Maxi Media Player and the Sonos card (punxaphil) add predefined groups that set volumes or start a favourite, a queue that can be reordered, favourites and radio, and pick all players of a platform with one line [P7][P8]. All of them name each entity in YAML.
- **Nobody does media on a floor plan well.** NeonPlan 3D and Device Floorplan only make a TV glow while it is on [P9][P10]. The Now Playing card skews album art onto a floor plan picture by hand with CSS transforms [P11]. The oldest floorplan thread asks "how are you adding media players" and the answers are images and YAML [P12]. A Roon user built a whole-house dashboard because the per-room control was missing in the music app [P13].
- **Grouping by room is what people want.** "Sonos Smart Groups" groups and ungroups rooms automatically from presence [P14]; the ESPHome media player panel groups speakers with one main volume that scales all of them and plus/minus per speaker [P15].

**Conclusion:** a picture where you see which rooms play, tap a room to play or pause, drag the music to another room and join rooms into a group is something no card or floor plan offers today. It fits PlanView Dash's idea (the home as it is, controlled in place) and uses only Home Assistant's own actions, with Music Assistant as an optional extra.

### Floor plans: new competitors since the last pass

- **Device Floorplan** (public beta from 31 October 2026, in the Marketplace as a custom repository) ships a release every few days: a drag-and-drop editor with auto-placement and no YAML, wall panels, robot vacuums with their path and a "Clean now" per room, an energy overlay with a day scrubber, and **Home Replay** of the last 6 to 48 hours [P10]. It is the closest 2D competitor and moves fast.
- **Houseplan** (July 2026) binds drawn rooms to areas so devices place themselves, adds "virtual devices" with manuals, and shows the robot vacuum's live position from map integrations [P16].
- **NeonPlan 3D** added Wall View, moving doors and windows (1.15, October 2026); users ask for easier small-object editing and pitched roofs [P9].
- **The vacuum map card** (1.9k stars) is the reference for room cleaning: rooms as outlines, zones, go-to, many vacuum brands, but full use needs YAML and calibration points [P17].

**Conclusion:** the others compete on drawing tools and 3D. PlanView Dash keeps the lead it has (a real picture of the house, setup in an hour, fast on old tablets) and should take the features that make a picture of the home more useful every day: media, replay, vacuum by room, climate overlays.

### Lights, temperature, energy

- **Lights:** lamps glow in their own colour, but the room panel only dims. Colour and white temperature from the panel is the missing piece (the 2026.5 tile features and every floor plan competitor have it [P2][P9]).
- **Temperature:** schedule cards are among the busiest threads (Scheduler card, Climate Scheduler, a weekly-grid card, Velair) [P18][P19][P20]; competitors draw comfort heatmaps for temperature, humidity and CO₂ [P9][P10].
- **Energy:** live flow plus a replay of the day (Device Floorplan [P10]), solar forecast and battery plans (Predbat, EMHASS) [R36][R37], power per room as Home Assistant's power distribution card does it [R2].

## Proposed order after 1.0

Sizes as in plan.md (S under a day, M one to three days, L more). The plan's principles still apply, including light mode for every feature and no YAML.

### 1.1: Music in the room (new milestone)

#### MU1: Speakers and screens in their rooms. Status: done (v1.1.0-beta.1). Size: M
- **What:**
  - `media_player` entities found through areas, like lamps today, and optionally placed on the plan or the picture. A speaker or TV icon where it is placed, or one per room in the room's corner when not placed.
  - Placement mode lists them in their own group and never warns about an unplaced one; a missing entity only warns when it is placed (the owner's rule about minor entities).
  - While playing: a soft pulse in the room, tinted from the album art (averaged on a small canvas, static in light mode). A TV that is on glows like a lamp.
- **Done when:** browser tests with mock players cover found by area, placed, playing pulse, light mode static, and placement mode silent about unplaced players.

#### MU2: Now playing in the room panel. Status: done (v1.1.0-beta.1). Size: M. Depends: MU1
- **What:**
  - A "Now playing" row in the room panel: artwork, title and artist, play/pause, previous/next, volume, mute. Controls follow `supported_features`; nothing is drawn that the player cannot do.
  - Source and favourites: `select_source` for players with sources; with Music Assistant, its favourites and radio (through `browse_media`), limited to a short list.
  - Several players in one room: one row each, the playing one first.
- **Done when:** tests cover a player with all features, one with only play/pause, a failed call (shown and announced as today), and artwork missing.

#### MU3: The music view when the roof is lifted. Status: done (v1.1.0-beta.1). Size: L. Depends: MU2
- **Why:** The owner's wish, and something no card does [P11][P12].
- **What:**
  - A **Music** toggle on the floor plan, beside the coming energy view (H5). Rooms with a speaker show a volume ring and the playing title; silent rooms are dimmed.
  - Tap a room: play or pause there. Long press: the room panel's now playing row.
  - **Play here too:** drag from a playing room to another, or tap "+" on a room, to join it to the group (`media_player.join`). Rooms in one group share an outline colour and the main volume scales them all, with plus/minus per room (as in [P15]). Tap "−" to leave the group (`unjoin`).
  - **Move the music:** drag with "move" chosen, or the room panel's "Move here", moves the queue (`music_assistant.transfer_queue` when Music Assistant is there; otherwise join the new room and unjoin the old one where the platform can).
  - Works the same on the apartment's plan.
- **Done when:** tests with mock players cover join, unjoin, move with and without Music Assistant, group volume, a player that cannot group (no join offered), and keyboard use (A1 rules).

#### MU4: The whole house playing. Status: done (v1.1.0-beta.1). Size: S. Depends: MU2
- **What:** A header chip when something plays anywhere ("Kitchen + living room: title"), tap to see all rooms and pause all. Goodnight (L2) gets an option to pause music and turn TVs off. In the card for other dashboards, `view: music` shows the music view.
- **Done when:** tests cover the chip, pause all, and goodnight with and without the option.

#### MU5: Talk to a room (exploratory). Size: M. Depends: MU3
- **What:** Send a short announcement to a room or group from the wall screen: typed text through Home Assistant's text-to-speech, or Music Assistant's `play_announcement`, which lowers the music and resumes it [P4][P5]. Admin-only by default; ties in with W4 (voice from the wall).

#### H3 (narrowed): Appliances. Size: S
- What is left of H3 once media moves to MU1–MU4: washer, dryer and dishwasher running and done, robot vacuum status in its room.

### 1.2: Lights, temperature and energy, deeper

The owner's top three get the next milestone.

- **LI1: Colour and white from the room panel. Size: S.** A long press on a lamp (or a row in the panel) opens colour and white temperature for lamps whose `supported_color_modes` allow it; scenes in the room's area as one-tap chips. [P2]
- **H6: Climate overlays** (from plan.md): temperature, humidity and CO₂ as the floor plan tint. Competitors have it [P9][P10].
- **CL1: Heating schedules per room. Size: M.** Moved up from "Later": show and edit the room's schedule in the room panel through Home Assistant's schedule helper or the Scheduler integration when installed [P18][P19]. Read-only when neither is there.
- **H5: Power per room** and **E1: Solar forecast** (from plan.md).
- **RP1: Replay the day. Size: L.** Moved up from "Later" (the day timeline): a scrubber over the last 24 hours on the picture and plan, for lights, doors, heating, music and energy flow, from Home Assistant's history. Device Floorplan has just shipped it [P10]; on a real picture of the house it is more striking.

### 1.3: The home on the picture

- **H1: People in rooms** and **H2: Doors and windows where they are** (from plan.md).
- **VA1: Clean this room. Size: M.** A robot vacuum on the plan: its status in the room it cleans, and "Clean this room" in the room panel where the vacuum integration exposes rooms or segments (Roborock, Dreame, Valetudo); a live position only where a map integration gives coordinates, as Houseplan does [P16][P17]. No calibration points to type: the room mapping is picked from a list.

### 1.4 and on: wall screens and the summer house

Unchanged from plan.md: W2 screen profiles and guest mode, W1 the house as screensaver (with what is playing), W3 family strip, W5 alarm panel; F1 summer house mode, F2 warm up before arrival, F3 both homes. Exploratory W4 and W6 stay exploratory.

**Order decided by the owner (27 November 2026): take turns.** MU1–MU2 (now playing in the room) first, since they are small and bring music quickly. Then W2 and F1–F2 (the summer house is most useful in winter). Then MU3–MU4, the music view on top of MU2. Then W1, and 1.2 onward as above. plan.md's **Next up** list follows this order.

**Built (27 November 2026):** MU1–MU4, W2, F1, F2 and W1 are in 1.1.0-beta.1, on a branch of its own while main holds the 1.0 freeze. W1's photo-frame mode is left for later.

### Moved to "Later"

E2 car charging plan and E3 capacity peak stay as they are. New ideas to note, not plan yet: virtual devices with manuals (Houseplan [P16]), lyrics on the wall screen in ambient mode (Music Assistant [P3]), Sonos-style automatic grouping by presence [P14].

## Sources, third pass

1. [Media player integration (Home Assistant)](https://www.home-assistant.io/integrations/media_player/)
2. [Home Assistant 2026.5: We're on the same frequency now](https://home-assistant.io/blog/2026/05/06/release-20265/)
3. [Music Assistant 2.7: Taking over the airwaves](https://www.home-assistant.io/blog/2025/12/17/music-assistant-2-7) and [community thread](https://community.home-assistant.io/t/music-assistant-2-7-taking-over-the-airwaves/963719)
4. [Music Assistant integration (Home Assistant)](https://www.home-assistant.io/integrations/music_assistant/)
5. [Mini Media Player](https://github.com/kalkih/mini-media-player)
6. [Mediocre Media Player Cards](https://github.com/antontanderup/mediocre-hass-media-player-cards) and [community thread](https://community.home-assistant.io/t/media-player-card-with-grouping-support-and-custom-buttons/868819)
7. [Maxi Media Player](https://github.com/punxaphil/maxi-media-player) and [community thread](https://community.home-assistant.io/t/maxi-media-player/705007)
8. [Sonos card](https://github.com/punxaphil/custom-sonos-card) and [community thread](https://community.home-assistant.io/t/dashboard-sonos-card/393620)
9. [NeonPlan 3D (community thread)](https://community.home-assistant.io/t/neonplan-3d-draw-your-home-in-home-assistant-and-control-it-in-a-live-3d-floor-plan-free-hacs-online-demo/1027224)
10. [Device Floorplan: a visual floorplan editor and live dashboard card (community thread)](https://community.home-assistant.io/t/device-floorplan-a-visual-floorplan-editor-and-live-dashboard-card-without-yaml-public-beta/1031497)
11. [Now Playing Card](https://github.com/bradcrc/Now-Playing-Card)
12. [How are you adding media players in Floorplan? (community thread)](https://community.home-assistant.io/t/how-are-you-adding-media-players-in-floorplan/40882)
13. [My Home Assistant + Roon dashboard (Roon community)](https://community.roonlabs.com/t/my-home-assistant-roon-dashboard-extending-roon-into-full-house-control/308782)
14. [Sonos Smart Groups (community thread)](https://community.home-assistant.io/t/sonos-smart-groups-dynamically-un-group-and-tune-sonos-rooms-without-touching-a-button/1021891)
15. [ESPHome media player: speaker grouping](https://jtenniswood.github.io/esphome-media-player/features/speaker-grouping)
16. [Houseplan: interactive floor plan (community thread)](https://community.home-assistant.io/t/houseplan-interactive-floor-plan/1019246)
17. [Xiaomi vacuum map card](https://github.com/PiotrMachowski/lovelace-xiaomi-vacuum-map-card)
18. [Scheduler card (community thread)](https://community.home-assistant.io/t/scheduler-card-custom-component/217458)
19. [Climate Scheduler (community thread)](https://community.home-assistant.io/t/climate-scheduler/955912)
20. [Weekly Schedule Card (community thread)](https://community.home-assistant.io/t/weekly-schedule-card-a-visual-weekly-grid-card-for-the-scheduler-component/1012671)
