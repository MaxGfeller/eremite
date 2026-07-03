<script setup lang="ts">
// A cute hooded hermit, hand-drawn with simple geometric shapes.
// Reads at 32px (silhouette) and 160px (face + halo). No external assets.
withDefaults(defineProps<{ halo?: boolean }>(), { halo: false })
</script>

<template>
  <svg
    viewBox="0 0 120 120"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    aria-label="Eremite.js — a peaceful hooded hermit"
  >
    <!-- Candlelight halo (large sizes only) -->
    <g v-if="halo" class="halo">
      <circle cx="60" cy="46" r="40" fill="none" stroke="#dcb85f" stroke-width="2.5" opacity="0.9" />
      <circle cx="60" cy="46" r="40" fill="#dcb85f" opacity="0.12" />
    </g>

    <!-- Robe / shoulders -->
    <path
      d="M26 114 C24 84 33 66 60 66 C87 66 96 84 94 114 Z"
      fill="#6f4a2f"
    />
    <!-- Robe fold shading -->
    <path
      d="M60 66 C60 84 60 100 60 114"
      stroke="#543522"
      stroke-width="2"
      stroke-linecap="round"
      opacity="0.55"
    />

    <!-- Head (skin), sits behind the hood -->
    <ellipse cx="60" cy="52" rx="23" ry="24" fill="#e8c9a0" />

    <!-- Hood: brown dome that frames the face opening -->
    <path
      d="M60 14
         C40 14 29 30 29 49
         C29 61 35 70 44 74
         C40 66 39 58 39 52
         C39 41 48 34 60 34
         C72 34 81 41 81 52
         C81 58 80 66 76 74
         C85 70 91 61 91 49
         C91 30 80 14 60 14 Z"
      fill="#5a3b26"
    />
    <!-- Inner hood rim highlight -->
    <path
      d="M40 51 C40 40 49 33 60 33 C71 33 80 40 80 51"
      stroke="#7a5236"
      stroke-width="1.6"
      fill="none"
      opacity="0.8"
    />

    <!-- Rosy cheeks -->
    <circle cx="49" cy="60" r="4.2" fill="#d98c6a" opacity="0.5" />
    <circle cx="71" cy="60" r="4.2" fill="#d98c6a" opacity="0.5" />

    <!-- Closed, contented eyes (gentle upward arcs) -->
    <path d="M46 54 Q51 49.5 56 54" stroke="#3d2817" stroke-width="2.4" stroke-linecap="round" fill="none" />
    <path d="M64 54 Q69 49.5 74 54" stroke="#3d2817" stroke-width="2.4" stroke-linecap="round" fill="none" />

    <!-- Little nose -->
    <path d="M60 57 L60 61" stroke="#c99a72" stroke-width="2.2" stroke-linecap="round" />

    <!-- Peaceful smile -->
    <path d="M54 64 Q60 69.5 66 64" stroke="#3d2817" stroke-width="2.2" stroke-linecap="round" fill="none" />

    <!-- Clasped hands resting in the sleeves -->
    <ellipse cx="60" cy="94" rx="13" ry="8" fill="#e8c9a0" />
    <path d="M60 88 L60 100" stroke="#c99a72" stroke-width="1.6" stroke-linecap="round" opacity="0.7" />
  </svg>
</template>
