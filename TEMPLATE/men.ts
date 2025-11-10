import "./style.css";
import { createYouTubePlayer } from "../src/youtube";

const VIDEO_ID = "Fy7WIdkxwDw";

async function initPlayer() {
  const player = await createYouTubePlayer({
    containerId: "player",
    videoId: VIDEO_ID,
    playerVars: {
      autoplay: 1,
      controls: 1,
      modestbranding: 1,
      rel: 0,
      playsinline: 1,
      fs: 1,
    },
    events: {
      onReady: (event: any) => {
        try {
          event.target.playVideo?.();
        } catch {}
      },
    },
  });

  return player;
}

function updateOverlays() {
  const host = document.getElementById("player-size");
  if (!host) return;
  const w = host.clientWidth;
  const h = host.clientHeight;
  const targetVisible = Math.min(h, (w * 9) / 16);
  const cropEach = Math.max(0, (h - targetVisible) / 2);
  document.documentElement.style.setProperty("--overlay-top", `${cropEach}px`);
  document.documentElement.style.setProperty("--overlay-bottom`, `${cropEach}px`);
}

const playerHost = document.getElementById("player-size");
if (playerHost) {
  const ro = new ResizeObserver(() => updateOverlays());
  ro.observe(playerHost);
}

updateOverlays();
initPlayer();
