<script setup lang="ts">
// A cute hooded hermit holding a candle. One bell-shaped silhouette so it
// still reads at 16-32px; face, blush and flame carry the charm at 160px.
withDefaults(defineProps<{ halo?: boolean }>(), { halo: false })
</script>

<template>
  <svg
    viewBox="0 0 120 120"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    aria-label="Eremite.js — a peaceful hooded hermit holding a candle"
  >
    <!-- Candlelight halo (hero size only) -->
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
    <path d="M48 54 Q52 49.8 56 54" stroke="#3d2817" stroke-width="2.4" stroke-linecap="round" fill="none" />
    <path d="M64 54 Q68 49.8 72 54" stroke="#3d2817" stroke-width="2.4" stroke-linecap="round" fill="none" />
    <!-- Rosy cheeks -->
    <circle cx="46.5" cy="59.5" r="3.6" fill="#d98c6a" opacity="0.55" />
    <circle cx="73.5" cy="59.5" r="3.6" fill="#d98c6a" opacity="0.55" />
    <!-- Peaceful smile -->
    <path d="M55.5 60.5 Q60 65 64.5 60.5" stroke="#3d2817" stroke-width="2.2" stroke-linecap="round" fill="none" />

    <!-- Candle warmth -->
    <circle cx="60" cy="78" r="11" fill="#d9a13f" opacity="0.18" />
    <!-- Flame -->
    <path d="M60 67.5 C62.8 71.2 63 74.4 60 76 C57 74.4 57.2 71.2 60 67.5 Z" fill="#d9a13f" />
    <path d="M60 70.5 C61.4 72.3 61.5 73.9 60 74.8 C58.5 73.9 58.6 72.3 60 70.5 Z" fill="#f3d27a" />
    <!-- Candle -->
    <rect x="56" y="77.5" width="8" height="14" rx="2.4" fill="#f6ecd7" stroke="#d9c6a2" stroke-width="0.9" />
    <!-- Little hands holding it -->
    <circle cx="51" cy="87" r="4.8" fill="#f0d6b3" />
    <circle cx="69" cy="87" r="4.8" fill="#f0d6b3" />
    <!-- Sleeve cuffs -->
    <path d="M46 84.5 Q49 81.5 53.5 82.5" stroke="#4a2f1c" stroke-width="2.4" stroke-linecap="round" fill="none" />
    <path d="M74 84.5 Q71 81.5 66.5 82.5" stroke="#4a2f1c" stroke-width="2.4" stroke-linecap="round" fill="none" />
  </svg>
</template>
