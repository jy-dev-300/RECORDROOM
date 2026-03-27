# RECORDROOM Design System v1

## Character

RECORDROOM is editorial, tactile, and object-first.
The app should feel like handling records in a quiet white gallery rather than operating a dense utility dashboard.

Core traits:
- Light canvas, dark ink, very little color.
- Physical objects do the visual work.
- Controls stay small and calm.
- Motion should feel weighted and believable.
- Layout should breathe, especially around the active record object.

## Color

- Default canvas is near-white.
- Primary text and controls use near-black.
- Muted text should stay translucent rather than switching to gray families.
- Red is reserved for blocked or unavailable playback states.
- Large color fields should remain subtle until a future palette pass is defined.

## Typography

- Titles are compact, centered, and restrained.
- Supporting metadata is smaller and softer.
- Menu text should read as interface text, not poster text.
- Decorative side branding can be letter-spaced, but primary UI text should remain clear and compact.

## Layout

### Overview

- Overview should be driven from viewport ratios, not per-device nudges.
- Column gap and preview size should be independently controllable.
- The brand mark should live in a dedicated side rail, not be parked off-screen with magic offsets.
- Nav chrome should reserve its own top band; the grid starts below that band with a ratio-based inset.

### Play

- The title block, hero object cluster, and transport controls are three separate vertical zones.
- Use stable section relationships first; use transforms only for object motion or deliberate perspective.
- Negative margins should be treated as a temporary fix, not a default layout tool.

### Gift

- The gift object remains the focal center.
- Message UI should sit close enough to feel attached, but never so close that it competes with the object.
- Composer interactions may move to dedicated surfaces when keyboard ergonomics demand it.

## Motion

- Record/object motion should feel physical and slightly theatrical.
- Utility UI motion should stay short and quiet.
- Drift/parallax should add atmosphere, not noise.
- Scrubbing should prioritize one-to-one control feel over decorative easing.

## Layering

- Navigation and overlays always sit above world content.
- Overview stack ordering must come from a shared rule across both parent stack containers and child cards.
- Within a stack, front layers should remain visually front unless a higher-level screen rule intentionally overrides them.

## Controls

- Plus/minus/gift/play controls should remain minimal and typographic unless a status needs a stronger semantic symbol.
- Unavailable playback uses the blocked red symbol and a direct explanation.
- Scrub bars should feel immediate under the finger and never visually bounce backward after release.

## Implementation Guidance

- Put shared values in `design-system/tokens.ts`, `design-system/layout.ts`, and `design-system/motion.ts`.
- Prefer named ratios and tokens over inline magic numbers.
- If a new screen needs a one-off tweak, first ask whether it belongs in a shared pattern.
- When preserving a tuned visual result, refactor underneath only if the new structure keeps the same look while reducing future layout risk.
