# R6 proof numbers (25 Nov, this machine: 4 CPUs, 15 GB; Chromium 158.0.8127.36 build 1243 with playwright-core 1.63.0; web role and render-worker as two processes; built web beside them)
| run | style | result | wall time | video | memory peak (web process / render worker with its browser and encoder) |
|---|---|---|---|---|---|
| status video | golden (portrait scroll) | done, MP4 h264 1080x1920 30/1 fps yuv420p | 65.7 s | 26.7 s, 1.66 MB | 190 MB / 1512 MB |
| film wish | reel (film) | done, same format | 381.7 s | 32.2 s, 0.24 MB | 196 MB / 1534 MB |
| worker killed (kill -9) at about 20 s | golden | taken again, done, losses 1 | 91.8 s | 26.7 s | 195 MB / 1588 MB |
| worker killed twice | golden | failed with words (losses 2), Ask again on the same job: queued | - | - | - |
| erase in the middle of a render | golden | render stopped, row failed, no stored file, storage files 6 before and 6 after, no fw-render-* left in /tmp | - | - | - |
Other jobs of the web role (a clean-up job every 8 s) ran while the renders ran: 8 during the status video, 46 during the film.
Owner's download address gave the MP4 (200, video/mp4); another account got 404 on both the read and the ask.
Token: no 43-character token-like string and no render/<token> address in either process's log.
