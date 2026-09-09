# Research: Android Background Execution (stub — Phase 3/voice prep only)

Not needed for Phase 1 (dashboard-only mobile app, no background service, no mic).
Fill in before implementing any background connectivity or voice capture.

Known constraints to verify at that time, not yet confirmed against current Play
policy/AOSP behavior:
- Foreground services require a declared type (`dataSync`, `mediaPlayback`,
  `microphone`, etc.) and a persistent notification.
- Background mic access without a foreground service is not reliable on modern
  Android and is increasingly restricted.
- Doze/App Standby will suspend background network work outside of foreground
  services, WorkManager, or push (FCM).

Phase 1 conclusion: build the WebSocket client to reconnect cleanly when the app
returns to foreground, and design the notification path around FCM (push) rather
than assuming a persistent background connection. Do not claim always-on mic.
