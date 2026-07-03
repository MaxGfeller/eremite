<script setup lang="ts">
// A cute take on the Hermit: hooded, white-bearded, holding a little
// lantern. One bell-shaped silhouette so it still reads at 16-32px;
// the beard, blush and lantern glow carry the charm at 160px.
withDefaults(defineProps<{ halo?: boolean }>(), { halo: false })
</script>

<template>
  <svg
    viewBox="0 0 120 120"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    aria-label="Eremite.js — a peaceful bearded hermit holding a lantern"
  >
    <!-- Lantern-light halo (hero size only) -->
    <g v-if="halo" class="halo">
      <circle cx="60" cy="48" r="42" fill="none" stroke="#dcb85f" stroke-width="2.5" opacity="0.9" />
      <circle cx="60" cy="48" r="42" fill="#dcb85f" opacity="0.12" />
    </g>

    <!-- Robe + hood: one bell-shaped silhouette -->
    <path
      d="M60 7
         C39 7 29 24 29 43
         C29 57 26 82 23.5 108
         C23.2 111 25 113 28 113
         L92 113
         C95 113 96.8 111 96.5 108
         C94 82 91 57 91 43
         C91 24 81 7 60 7 Z"
      fill="#6f4a2f"
    />
    <!-- Hem shadow so the robe sits on the ground -->
    <path
      d="M28 113 L92 113 C93 113 94.5 112.4 95.3 111 C90 108.4 76 106.5 60 106.5 C44 106.5 30 108.4 24.7 111 C25.5 112.4 27 113 28 113 Z"
      fill="#5a3b26"
    />

    <!-- Hood opening: shadowed ring, then the face -->
    <circle cx="60" cy="50" r="24" fill="#4a2f1c" />
    <circle cx="60" cy="52" r="19.5" fill="#f0d6b3" />
    <!-- Rim highlight along the top of the opening -->
    <path
      d="M41.5 45 C44.5 32.5 51.5 26.5 60 26.5 C68.5 26.5 75.5 32.5 78.5 45"
      stroke="#8a5f3c"
      stroke-width="2"
      fill="none"
      stroke-linecap="round"
      opacity="0.85"
    />

    <!-- Closed, contented eyes -->
    <path d="M48 52.5 Q52 48.3 56 52.5" stroke="#3d2817" stroke-width="2.4" stroke-linecap="round" fill="none" />
    <path d="M64 52.5 Q68 48.3 72 52.5" stroke="#3d2817" stroke-width="2.4" stroke-linecap="round" fill="none" />
    <!-- Rosy cheeks -->
    <circle cx="46" cy="57.5" r="3.4" fill="#d98c6a" opacity="0.55" />
    <circle cx="74" cy="57.5" r="3.4" fill="#d98c6a" opacity="0.55" />
    <!-- Little nose -->
    <circle cx="60" cy="57" r="2.4" fill="#dcae82" />

    <!-- The hermit's white beard -->
    <path
      d="M45.5 54
         C42.5 65 45.5 75.5 52.5 79.5
         Q60 83.5 67.5 79.5
         C74.5 75.5 77.5 65 74.5 54
         C70.5 59 65.5 61 60 61
         C54.5 61 49.5 59 45.5 54 Z"
      fill="#e9e0d2"
    />
    <!-- Beard strands -->
    <path d="M54 66 Q56.5 72 60 74" stroke="#cfc3ae" stroke-width="1.6" stroke-linecap="round" fill="none" />
    <path d="M66 66 Q63.5 72 60 74" stroke="#cfc3ae" stroke-width="1.6" stroke-linecap="round" fill="none" />
    <!-- Moustache over the top of the beard -->
    <path
      d="M60 59.5
         C56.5 57.2 51.5 57.8 49.5 60.5
         C52 63 57 63.6 60 61.6
         C63 63.6 68 63 70.5 60.5
         C68.5 57.8 63.5 57.2 60 59.5 Z"
      fill="#f4ece0"
    />

    <!-- Lantern glow -->
    <circle cx="60" cy="91" r="12.5" fill="#d9a13f" opacity="0.2" />
    <!-- Lantern: ring, cap, gold frame, glowing pane -->
    <circle cx="60" cy="80.5" r="2.2" stroke="#b0842a" stroke-width="1.6" fill="none" />
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
