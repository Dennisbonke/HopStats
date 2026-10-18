# Collecting iOS Safari layout diagnostics

The temporary layout recorder is opt-in and only renders on Analytics when the
URL contains `debugLayout=1`. It does not send captured data anywhere.

## Build and open on iPhone

Build and deploy the normal frontend/backend using the project's usual
deployment process. For a local Vite server accessible on the phone, run
`npm run dev -- --host 0.0.0.0` in `frontend`, then open the computer's
reachable LAN URL in iPhone Safari (for example,
`http://192.168.1.10:5173/analytics?debugLayout=1`). Authenticate as usual.
For a production-style deploy, append `?debugLayout=1` to the Analytics URL.

The small **Layout debug** panel shows root document scroll width/client width,
horizontal root position and sample count. Capture starts automatically upon
opening the page. **Pause/Start capture** controls recording; **Clear** resets
the ring buffer; **Copy / export JSON** copies the local measurements to the
clipboard, or downloads a JSON file if clipboard access is unavailable. If
overflow is detected, the panel marks it and lists likely offending elements.

## Reproduction procedure

1. Open Analytics with weekly granularity and wait for both charts to render.
2. Interact with a chart to show its tooltip, and separately repeat with no
   active tooltip if possible.
3. Rotate portrait → landscape → portrait. Immediately attempt a horizontal
   swipe on blank space outside the charts; repeat several times.
4. Also try a horizontal swipe beginning inside each chart and note whether the
   chart or the page moves. The recorder captures touch coordinates/direction,
   root and chart scroll positions, resize/orientation events, visual viewport
   state and chart geometry. It samples animation frames for about 2.8 seconds
   after resize/orientation events.
5. As soon as the issue occurs (or after several failed attempts), tap **Copy /
   export JSON** and retain the JSON with a note describing which swipe caused
   the observed behavior. Avoid putting the file in a public location: it
   includes browser user-agent and layout/touch measurements, but no app data,
   cookies, credentials, or API responses.

`documentScrollWidth > documentClientWidth` or non-zero `scrollX` marks a
potential document anomaly. An element may still extend beyond the viewport
without increasing root scroll width; the wider offender scan runs only when a
root anomaly is observed. Each offender notes whether an overflow-scroll
ancestor contains it. An intentional chart-local scroll is recorded separately
from root document movement.

This first-stage instrumentation is evidence collection, not a fix. Desktop
Playwright WebKit results cannot establish behavior on physical iOS Safari.
