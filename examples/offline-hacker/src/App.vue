<script setup lang="ts">
import { computed } from "vue";
import useResource from "@cyon/eremite/vue-composables/useResource";
import useResourceState from "@cyon/eremite/vue-composables/useResourceState";
import type { Articles, ArticlesState } from "./store/Articles";

const articles: Articles = useResource("articles");
articles.fetchArticles();

const articlesState: Ref<ArticlesState> = useResourceState("articles");

const markAsRead = (id: number) => {
  articles.markArticleAsRead(id);
};

const isArticleRead = computed(() => (articleId: number) => {
  if (!articlesState.value?.readArticles) return false;
  return articlesState.value.readArticles.includes(articleId);
});
</script>

<template>
  <ul>
    <li v-for="articleId in articlesState.articleIds" :key="articleId">
      <div v-if="articlesState.articles[articleId]">
        <a :href="articlesState.articles[articleId].url" target="_blank" :style="{ textDecoration: isArticleRead(articleId) ? 'line-through' : 'none'}">{{ articlesState.articles[articleId].title }}</a>
        - <a @click="markAsRead(articleId)">Mark article as read</a>
      </div>
      <span v-else>Loading...</span>
    </li>
  </ul>
</template>

<style>
@import './assets/base.css';

#app {
  max-width: 1280px;
  margin: 0 auto;
  padding: 2rem;

  font-weight: normal;
}

header {
  line-height: 1.5;
}

.logo {
  display: block;
  margin: 0 auto 2rem;
}

a,
.green {
  text-decoration: none;
  color: hsla(160, 100%, 37%, 1);
  transition: 0.4s;
}

@media (hover: hover) {
  a:hover {
    background-color: hsla(160, 100%, 37%, 0.2);
  }
}

@media (min-width: 1024px) {
  body {
    display: flex;
    place-items: center;
  }

  #app {
    display: grid;
    grid-template-columns: 1fr 1fr;
    padding: 0 2rem;
  }

  header {
    display: flex;
    place-items: center;
    padding-right: calc(var(--section-gap) / 2);
  }

  header .wrapper {
    display: flex;
    place-items: flex-start;
    flex-wrap: wrap;
  }

  .logo {
    margin: 0 2rem 0 0;
  }
}
</style>
