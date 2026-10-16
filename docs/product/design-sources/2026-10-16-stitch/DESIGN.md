---
name: Aerodynamic Avionics Intelligence
colors:
  surface: '#041428'
  surface-dim: '#041428'
  surface-bright: '#2b3a50'
  surface-container-lowest: '#000e23'
  surface-container-low: '#0c1c31'
  surface-container: '#112035'
  surface-container-high: '#1c2a40'
  surface-container-highest: '#27354c'
  on-surface: '#d5e3ff'
  on-surface-variant: '#bac9cc'
  inverse-surface: '#d5e3ff'
  inverse-on-surface: '#223147'
  outline: '#859396'
  outline-variant: '#3c494c'
  surface-tint: '#21daf3'
  primary: '#7aebff'
  on-primary: '#00363e'
  primary-container: '#00d2eb'
  on-primary-container: '#005661'
  inverse-primary: '#006875'
  secondary: '#abcae8'
  on-secondary: '#12334b'
  secondary-container: '#2b4963'
  on-secondary-container: '#9ab8d6'
  tertiary: '#ffd4a3'
  on-tertiary: '#472a00'
  tertiary-container: '#ffaf41'
  on-tertiary-container: '#6f4400'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#9eefff'
  primary-fixed-dim: '#21daf3'
  on-primary-fixed: '#001f24'
  on-primary-fixed-variant: '#004e59'
  secondary-fixed: '#cde5ff'
  secondary-fixed-dim: '#abcae8'
  on-secondary-fixed: '#001d32'
  on-secondary-fixed-variant: '#2b4963'
  tertiary-fixed: '#ffddb8'
  tertiary-fixed-dim: '#ffb95f'
  on-tertiary-fixed: '#2a1700'
  on-tertiary-fixed-variant: '#653e00'
  background: '#041428'
  on-background: '#d5e3ff'
  surface-variant: '#27354c'
typography:
  headline-xl:
    fontFamily: Inter
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: -0.02em
  headline-xl-mobile:
    fontFamily: Inter
    fontSize: 30px
    fontWeight: '700'
    lineHeight: 38px
    letterSpacing: -0.015em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
  headline-sm:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  label-md:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.25rem
  gutter-desktop: 1.75rem
  margin: 1rem
  margin-desktop: 2.5rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

This design system embodies an aerodynamic, high-precision flight intelligence aesthetic. Designed for aviators, flight telemetry operators, and aerospace analysts, it evokes calm mastery, high-speed computational intelligence, and atmospheric clarity. 

The visual style blends sleek dark-mode minimalism with subtle glassmorphic avionics instrumentation. Deep oceanic navy night layers mimic high-altitude night skies, punctured by piercing electric cyan vector highlights reminiscent of night-vision HUDs (heads-up displays), wind currents, and precision vector flightpaths. Structural surfaces rely on high-tech translucent backing, polished borders, and precise visual hierarchy rather than visual clutter.

## Colors

The palette is engineered around nocturnal aviation operations:
- **Primary Electric Cyan (`#00d2eb`, `#14c8e6`)**: The primary vector accent. Used for critical interactive triggers, active navigation tracks, telemetry pulses, and focused state indicators.
- **Deep Midnight Navy Canvas (`#07172c`)**: The deepest ground layer. Extended upward into `#0a1f3a` (primary card container) and `#0f2747` (elevated HUD or popover elements).
- **Secondary Cool Ice Blue (`#7d9bb8` / `#b3cde3`)**: Bridges foreground data with atmospheric depth. Used for secondary labels, non-active icon strokes, and structural metadata.
- **Tertiary Amber (`#f59e0b`)**: A functional safety alert color reserved strictly for crosswinds, weather warnings, and critical telemetry thresholds. Never used decoratively.
- **Text & Foreground**: Crisp White (`#ffffff`) for dominant headlines and dynamic flight data values; Ice Tint (`#d2e4f3`) for body descriptions.

## Typography

Inter serves as the primary typographic engine across all screen tiers. Its neutral geometric clarity ensures that alphanumeric flight instrumentation, degrees, altitudes, and timecodes remain instantly decipherable at high density.

- **Headlines**: Rendered in pure white (`#ffffff`) with tight negative tracking (`-0.02em`) for an athletic, aerospace cockpit display character.
- **Body**: Rendered in `#d2e4f3` or `#9fb8d0` to establish visual hierarchy without stark eye fatigue in dim lighting conditions.
- **Labels & Telemetry Tags**: Rendered with subtle letter spacing (`0.05em`) and uppercase styling where critical flight instrument codes (e.g., knots, heading, FL, altimeter) are shown.

## Layout & Spacing

The layout is built upon an adaptive 12-column fluid grid tailored to both desktop operations center dashboards and handheld in-cockpit tablet views. 

- **Breakpoints**: 
  - Mobile: `< 768px` (4-column layout, compact 16px margins).
  - Tablet: `768px - 1024px` (8-column layout, 20px gutters).
  - Desktop: `> 1024px` (12-column layout, 28px gutters, max-width 1440px).
- **Rhythm & Structure**: Component padding uses `space-md` (16px) for interior instrument clusters and `space-lg` (24px) for master card containers. Fluid card gaps preserve aerodynamic continuity while preventing sensory overload.

## Elevation & Depth

Visual hierarchy does not use harsh drop shadows; instead, it relies on tonal night layering, soft glassmorphism, and cyan edge illumination:

- **Surface Ground**: Solid `#07172c` backdrop.
- **Layer 1 (Cards & Data Panels)**: `#0a1f3a` with 80% opacity, `backdrop-filter: blur(16px)`, and a subtle 1px border gradient (`linear-gradient(180deg, rgba(0, 210, 235, 0.25) 0%, rgba(15, 39, 71, 0.4) 100%)`).
- **Layer 2 (Overlays, Flight Menus, Modals)**: Solid or semi-translucent `#0f2747` framed by a faint ambient electric cyan glow (`box-shadow: 0 0 24px -4px rgba(0, 210, 235, 0.15)`).
- **Interactive State Elevation**: When hovered or active, elements lift visually via an accentuated neon cyan border threshold (`rgba(0, 210, 235, 0.6)`) and an internal highlight wash.

## Shapes

The shape system blends aerodynamic curves with technical discipline. 

- Primary cards and dashboard widgets utilize `rounded-2xl` (1.5rem / 24px) or `rounded-xl` (1rem / 16px) to emulate smooth wing foils and fluid airfoils.
- Nested chips, pills, and status tags employ fully rounded circular or pill geometries to signify dynamic variable readings.
- Tactical inputs and internal micro-panels stick to `rounded-lg` (0.5rem / 8px) to retain structural alignment.

## Components

### Buttons
- **Primary**: Solid electric cyan background (`#00d2eb`) with dark midnight text (`#07172c`), weight 600, rounded-xl. Hover transitions to bright cyan (`#14c8e6`) with a diffused outer aura (`0 0 16px rgba(0, 210, 235, 0.4)`).
- **Secondary (Glass HUD)**: Background of `rgba(15, 39, 71, 0.6)` with a 1px border of `rgba(0, 210, 235, 0.3)` and white text (`#ffffff`). Hover introduces border brightening to full `#00d2eb`.
- **Destructive/Alert**: Transparent background with a 1px amber border (`#f59e0b`) and amber text.

### Chips & Telemetry Badges
- Pill-shaped (`rounded-full`), padding `0.25rem 0.75rem`.
- Background `rgba(0, 210, 235, 0.1)` with electric cyan text (`#00d2eb`) and a crisp `0.5px` border of `rgba(0, 210, 235, 0.3)`.
- Alert variant uses `rgba(245, 158, 11, 0.1)` with warm amber text (`#f59e0b`).

### Cards & Telemetry Pods
- Styled in `rounded-2xl`, background layered at `#0a1f3a` with `backdrop-filter: blur(12px)`.
- Border: 1px continuous hairline tinted with `rgba(125, 155, 184, 0.15)`, top edge highlighted with a subtle cyan gradient.

### Input Fields & Controls
- Background `#061324`, border `1px solid rgba(125, 155, 184, 0.25)`, rounded-xl.
- Focus State: Border transitions seamlessly to `#00d2eb` with an accompanying inner and outer cyan bloom (`0 0 0 3px rgba(0, 210, 235, 0.15)`). Placeholder text in cool slate `#7d9bb8`.

### Checkboxes & Radios
- Rounded-md for checkboxes, circular for radios.
- Unchecked: Inset border `#7d9bb8`, translucent midnight fill.
- Checked: Electric cyan fill (`#00d2eb`) with deep navy (`#07172c`) checkmark or central indicator dot.

### Specialized Flight Components
- **Vector Stream Graph**: Line graphs rendered with `#00d2eb` glowing strokes and vertical drop gradients fading to transparent over the `#07172c` backdrop.
- **Attitude / Horizon Indicator Widgets**: Framed in `rounded-full` rings accented by dual ice-blue tick marks and minimal cyan flight vector indicators.