<script setup lang="ts">
// A cute take on the Hermit: bald on top, long grey beard, a little
// lantern in both hands. One compact silhouette so it still reads at
// 16-32px; the beard, blush and lantern glow carry the charm at 160px.
withDefaults(defineProps<{ halo?: boolean }>(), { halo: false })
</script>

<template>
  <svg
    viewBox="0 0 120 120"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    aria-label="Eremite.js — a peaceful bald, bearded hermit holding a lantern"
  >
    <!-- Lantern-light halo (hero size only) -->
    <g v-if="halo" class="halo">
      <circle cx="60" cy="48" r="41" fill="none" stroke="#dcb85f" stroke-width="2.5" opacity="0.9" />
      <circle cx="60" cy="48" r="41" fill="#dcb85f" opacity="0.12" />
    </g>

    <!-- Robe -->
    <path
      d="M60 64
         C45 64 37 75 35 87
         C33.8 95 32.3 104 31.8 108
         C31.4 111 33.2 113 36.2 113
         L83.8 113
         C86.8 113 88.6 111 88.2 108
         C87.7 104 86.2 95 85 87
         C83 75 75 64 60 64 Z"
      fill="#6f4a2f"
    />
    <!-- Hem shadow so the robe sits on the ground -->
    <path
      d="M36 113 L84 113 C85.3 113 86.6 112.4 87.4 111 C82.5 108.6 71 106.8 60 106.8 C49 106.8 37.5 108.6 32.6 111 C33.4 112.4 34.7 113 36 113 Z"
      fill="#5a3b26"
    />

    <!-- Balding side tufts -->
    <g fill="#d8ccb5">
      <circle cx="38" cy="41" r="6.2" />
      <circle cx="82" cy="41" r="6.2" />
      <circle cx="35.5" cy="49" r="4.6" />
      <circle cx="84.5" cy="49" r="4.6" />
    </g>
    <!-- Ears -->
    <circle cx="38.5" cy="48.5" r="4" fill="#f0d6b3" />
    <circle cx="81.5" cy="48.5" r="4" fill="#f0d6b3" />

    <!-- Bald head -->
    <circle cx="60" cy="44" r="21" fill="#f0d6b3" />
    <!-- Dome shine -->
    <path d="M50 30.5 Q57 26.5 64 28.5" stroke="#f9e6c8" stroke-width="2.6" stroke-linecap="round" fill="none" />

    <!-- Bushy eyebrows -->
    <path d="M46.5 41 Q51 38.8 55.5 40.7" stroke="#e6dcc8" stroke-width="3.2" stroke-linecap="round" fill="none" />
    <path d="M64.5 40.7 Q69 38.8 73.5 41" stroke="#e6dcc8" stroke-width="3.2" stroke-linecap="round" fill="none" />
    <!-- Closed, contented eyes -->
    <path d="M47.5 47 Q51.5 43 55.5 47" stroke="#3d2817" stroke-width="2.4" stroke-linecap="round" fill="none" />
    <path d="M64.5 47 Q68.5 43 72.5 47" stroke="#3d2817" stroke-width="2.4" stroke-linecap="round" fill="none" />
    <!-- Rosy cheeks -->
    <circle cx="45.5" cy="52" r="3.4" fill="#d98c6a" opacity="0.55" />
    <circle cx="74.5" cy="52" r="3.4" fill="#d98c6a" opacity="0.55" />
    <!-- Little nose -->
    <circle cx="60" cy="51.5" r="2.4" fill="#dcae82" />

    <!-- The hermit's long grey beard -->
    <path
      d="M45 48
         C41 60 42 75 46.5 85
         C50 92.5 55 96.5 60 97.5
         C65 96.5 70 92.5 73.5 85
         C78 75 79 60 75 48
         C70.5 53.5 65.5 55.5 60 55.5
         C54.5 55.5 49.5 53.5 45 48 Z"
      fill="#d8ccb5"
    />
    <!-- Beard strands -->
    <path d="M53 62 Q55.5 74 60 81" stroke="#b5a68c" stroke-width="1.6" stroke-linecap="round" fill="none" />
    <path d="M67 62 Q64.5 74 60 81" stroke="#b5a68c" stroke-width="1.6" stroke-linecap="round" fill="none" />
    <!-- Moustache over the top of the beard -->
    <path
      d="M60 53.5
         C56.5 51.2 51.5 51.8 49.5 54.5
         C52 57 57 57.6 60 55.6
         C63 57.6 68 57 70.5 54.5
         C68.5 51.8 63.5 51.2 60 53.5 Z"
      fill="#e6dcc8"
    />

    <!-- Lantern glow -->
    <circle cx="60" cy="91" r="12.5" fill="#d9a13f" opacity="0.22" />
    <!-- Lantern: cap, gold frame, glowing pane — held in front of the beard -->
    <path d="M54.5 84.5 Q60 79.5 65.5 84.5 Z" fill="#b0842a" />
    <rect x="53" y="84" width="14" height="14.5" rx="2.6" fill="#b0842a" />
    <rect x="55.3" y="86.3" width="9.4" height="10" rx="1.4" fill="#f3d27a" />
    <!-- Tiny flame inside -->
    <path d="M60 88 C61.6 90.2 61.7 92.2 60 93.2 C58.3 92.2 58.4 90.2 60 88 Z" fill="#c47b2e" />
    <!-- Frame bars -->
    <path d="M58 86.3 L58 96.3 M62 86.3 L62 96.3" stroke="#b0842a" stroke-width="1.1" />

    <!-- Little hands holding the lantern -->
    <circle cx="50" cy="91" r="4.8" fill="#f0d6b3" />
    <circle cx="70" cy="91" r="4.8" fill="#f0d6b3" />
    <!-- Sleeve cuffs -->
    <path d="M45 88.5 Q48 85.5 52.5 86.5" stroke="#4a2f1c" stroke-width="2.4" stroke-linecap="round" fill="none" />
    <path d="M75 88.5 Q72 85.5 67.5 86.5" stroke="#4a2f1c" stroke-width="2.4" stroke-linecap="round" fill="none" />
  </svg>
</template>
