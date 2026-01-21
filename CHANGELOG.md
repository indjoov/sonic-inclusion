# Changelog - Sonic Inclusion

## [Unreleased] - 2026-01-21

### Added
- **Accessibility (A11y) Improvements:**
    - Added `aria-label` attributes to all interactive elements (Sensitivity slider, Color Mode dropdown, File input) to ensure screen reader compatibility.
    - Implemented a hidden `aria-live="polite"` region (`#srText`) to provide real-time status updates for non-visual users.
    - Added `aria-hidden="true"` to the visualization canvas to prevent screen reader confusion, prioritizing text-based descriptions.
    - Defined semantic sections with `aria-label` (Input Controls, Visualization) for better landmark navigation.
- **UX Enhancements:**
    - Improved label association by nesting inputs, increasing the clickable/tap area for users with motor impairments.
    - Added visual keyboard hints and semantic roles (`role="note"`) for shortcut keys.

### Changed
- Refactored HTML structure to comply with modern Web Content Accessibility Guidelines (WCAG).
- Optimized the UI for "Screen Reader First" navigation without changing the core audio-visual logic.
