## ADDED Requirements

### Requirement: AR session uses gravity-aligned world tracking
WHEN the AR route view appears, the iOS app SHALL run `ARWorldTrackingConfiguration` with `worldAlignment = .gravity` and horizontal plane detection, SHALL enable mesh scene reconstruction with occlusion, person segmentation with depth, and scene depth only WHERE the device supports them, SHALL allow relocalization, and SHALL present the AR view full screen with a „Schließen“ button.

#### Scenario: Device without LiDAR
- **GIVEN** a device that does not support mesh reconstruction
- **WHEN** the AR view starts
- **THEN** the session runs without scene reconstruction and the route can still be shown

### Requirement: AR route rendering is bounded by configuration
The AR route view SHALL use these render defaults: marker height 0.03 m, marker spacing 0.75 m (0.45 m in curves), preview distance 4.5 m, at most 3 waypoints, stop the preview at the next decision point, marker smoothing 0.22, floor smoothing 0.14, visible distance 0.25–15 m, at most 120 pooled markers, breadcrumbs enabled with width 0.02 m and height 0.002 m, and markers behind the user hidden.

#### Scenario: Long straight route
- **GIVEN** a 30 m straight route
- **WHEN** the AR preview is built
- **THEN** at most 4.5 m ahead of the user and at most three waypoints are displayed

### Requirement: AR progress is derived from the aligned camera pose
WHILE an alignment exists, the AR view SHALL compute the user's map position from the camera pose through the alignment instead of the beacon estimate, SHALL select the nearest sampled route point as preview start, and SHALL publish the distance to the next turn in the HUD.

#### Scenario: Beacon estimate jitters
- **GIVEN** the AR alignment is established
- **WHEN** the beacon position jumps by one meter
- **THEN** the visible AR route does not jump because progress follows the camera pose

### Requirement: AR tracking problems are explained in German
The AR view SHALL show these HUD messages and dim the overlay accordingly: „Signal schwach. Kalibrierung empfohlen (Ich stehe hier).“ with opacity 0.32 WHILE positioning is low confidence; „AR initialisiert... bewege das iPhone langsam.“, „Zu schnelle Bewegung erkannt. Kurz stabil halten.“, „Zu wenig visuelle Features. Richte die Kamera auf strukturierte Flächen.“, „Tracking wird neu lokalisiert. Kurz warten.“, or „Tracking eingeschränkt.“ with opacity 0.45 WHILE tracking is limited; „AR-Tracking nicht verfügbar.“ with opacity 0.2 WHILE tracking is unavailable; and „Kalibrierung fehlt: Starte an einem bekannten Punkt und richte die Kamera kurz in Blickrichtung aus.“ WHILE no alignment exists.

#### Scenario: Fast movement
- **GIVEN** ARKit reports limited tracking due to excessive motion
- **WHEN** the frame is processed
- **THEN** the HUD shows „Zu schnelle Bewegung erkannt. Kurz stabil halten.“ and the overlay is dimmed

#### Scenario: No route
- **GIVEN** the navigation route is empty
- **WHEN** a frame is processed
- **THEN** all route markers are hidden

### Requirement: AR view offers recalibration at the current estimate
WHILE a displayed user position exists, the AR view SHALL show „AR neu ausrichten“ (orange while low confidence, blue otherwise), and WHEN tapped SHALL run manual calibration at the current position estimate and re-anchor the AR alignment on the resulting calibration revision.

#### Scenario: Customer realigns
- **GIVEN** the AR route appears rotated
- **WHEN** the customer taps „AR neu ausrichten“
- **THEN** a new calibration revision is emitted and the markers fade in at the re-anchored positions
