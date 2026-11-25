## ADDED Requirements

### Requirement: iOS layout and copy consistency
The iOS app SHALL render every screen without clipped or overlapping content on the smallest and largest supported iPhone, with Dynamic Type up to accessibility sizes where text is shown, in light and dark mode, and SHALL use consistent German copy and button styles.

#### Scenario: Smallest supported iPhone
- **WHEN** a user opens any main screen on the smallest supported iPhone simulator
- **THEN** no text is truncated without a way to read it and no control overlaps another
