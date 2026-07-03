<script setup lang="ts">
// A cute take on the Hermit: wild white hair and beard framing the face,
// a little lantern in both hands. One compact silhouette so it still
// reads at 16-32px; the mane, blush and lantern glow carry the charm
// at 160px.
withDefaults(defineProps<{ halo?: boolean }>(), { halo: false })
</script>

<template>
  <svg
    viewBox="0 0 120 120"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    aria-label="Eremite.js — a peaceful wild-haired hermit holding a lantern"
  >
    <!-- Lantern-light halo (hero size only) -->
    <g v-if="halo" class="halo">
      <circle cx="60" cy="50" r="44" fill="none" stroke="#dcb85f" stroke-width="2.5" opacity="0.9" />
      <circle cx="60" cy="50" r="44" fill="#dcb85f" opacity="0.12" />
    </g>

    <!-- Robe -->
    <path
      d="M60 66
         C45 66 37 76 35 88
         C33.8 96 32.3 104.5 31.8 108
         C31.4 111 33.2 113 36.2 113
         L83.8 113
         C86.8 113 88.6 111 88.2 108
         C87.7 104.5 86.2 96 85 88
         C83 76 75 66 60 66 Z"
      fill="#6f4a2f"
    />
    <!-- Hem shadow so the robe sits on the ground -->
    <path
      d="M36 113 L84 113 C85.3 113 86.6 112.4 87.4 111 C82.5 108.6 71 106.8 60 106.8 C49 106.8 37.5 108.6 32.6 111 C33.4 112.4 34.7 113 36 113 Z"
      fill="#5a3b26"
    />

    <!-- Wild white mane: overlapping tufts around the head -->
    <g fill="#e9e0d2">
      <circle cx="60" cy="44" r="27" />
      <circle cx="60" cy="22" r="13" />
      <circle cx="46" cy="26" r="11" />
      <circle cx="74" cy="26" r="11" />
      <circle cx="36" cy="38" r="11" />
      <circle cx="84" cy="38" r="11" />
      <circle cx="34" cy="52" r="10" />
      <circle cx="86" cy="52" r="10" />
      <circle cx="38" cy="64" r="9" />
      <circle cx="82" cy="64" r="9" />
    </g>
    <!-- Flyaway strands -->
    <path d="M27 32 Q22 28 24.5 22" stroke="#dcd2c0" stroke-width="2.2" stroke-linecap="round" fill="none" />
    <path d="M93 32 Q98 28 95.5 22" stroke="#dcd2c0" stroke-width="2.2" stroke-linecap="round" fill="none" />
    <path d="M56 10 Q57 5 62 4" stroke="#dcd2c0" stroke-width="2.2" stroke-linecap="round" fill="none" />

    <!-- Face -->
    <circle cx="60" cy="48" r="18" fill="#f0d6b3" />

    <!-- Bushy eyebrows -->
    <path d="M46.5 42.5 Q51 40.3 55.5 42.2" stroke="#f4ece0" stroke-width="3.2" stroke-linecap="round" fill="none" />
    <path d="M64.5 42.2 Q69 40.3 73.5 42.5" stroke="#f4ece0" stroke-width="3.2" stroke-linecap="round" fill="none" />
    <!-- Closed, contented eyes -->
    <path d="M47.5 48.5 Q51.5 44.5 55.5 48.5" stroke="#3d2817" stroke-width="2.4" stroke-linecap="round" fill="none" />
    <path d="M64.5 48.5 Q68.5 44.5 72.5 48.5" stroke="#3d2817" stroke-width="2.4" stroke-linecap="round" fill="none" />
    <!-- Rosy cheeks -->
    <circle cx="45.5" cy="53.5" r="3.4" fill="#d98c6a" opacity="0.55" />
    <circle cx="74.5" cy="53.5" r="3.4" fill="#d98c6a" opacity="0.55" />
    <!-- Little nose -->
    <circle cx="60" cy="53" r="2.4" fill="#dcae82" />

    <!-- The hermit's white beard -->
    <path
      d="M45 50
         C42 62 45.5 73 52.5 77
         Q60 80.5 67.5 77
         C74.5 73 78 62 75 50
         C70.5 55.5 65.5 57.5 60 57.5
         C54.5 57.5 49.5 55.5 45 50 Z"
      fill="#e9e0d2"
    />
    <!-- Beard strands -->
    <path d="M54 62 Q56.5 68 60 70" stroke="#cfc3ae" stroke-width="1.6" stroke-linecap="round" fill="none" />
    <path d="M66 62 Q63.5 68 60 70" stroke="#cfc3ae" stroke-width="1.6" stroke-linecap="round" fill="none" />
    <!-- Moustache over the top of the beard -->
    <path
      d="M60 55.5
         C56.5 53.2 51.5 53.8 49.5 56.5
         C52 59 57 59.6 60 57.6
         C63 59.6 68 59 70.5 56.5
         C68.5 53.8 63.5 53.2 60 55.5 Z"
      fill="#f4ece0"
    />

    <!-- Lantern glow -->
    <circle cx="60" cy="91" r="12.5" fill="#d9a13f" opacity="0.2" />
    <!-- Lantern: cap, gold frame, glowing pane -->
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
