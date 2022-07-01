import { Mutate, Queueable, Resource } from "@cyon/eremite";

export interface Article {
  title: string;
  url: string;
  type: string;
  time: number;
  kids: number[];
  id: number;
  descendants: number;
  by: string;
}

export interface ArticlesState {
  articleIds: number[];
  readArticles: number[];
  articles: { [id: number]: Article };
}

export class Articles extends Resource<ArticlesState> {
  initialState(): ArticlesState {
    return {
      articleIds: [],
      readArticles: [],
      articles: {}
    };
  }

  @Queueable({ session: true })
  async fetchArticles (): Promise<void> {
    console.log('fetch articles')
    const result = await window.fetch('https://hacker-news.firebaseio.com/v0/topstories.json')
    const ids = await result.json()

    this.state.articleIds = ids.slice(0, 30)

    for (const id of this.state.articleIds) {
      if (this.state.articles[id]) continue

      await this.fetchArticleDetails(id)
      await sleep(2000)
    }
  }

  @Queueable()
  async fetchArticleDetails (id: number): Promise<void> {
    const result = await window.fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`)
    const article = await result.json()

    this.state.articles[id] = article
  }

  markArticleAsRead (id: number): void {
    this.state.readArticles.push(id)
  }
}

function sleep (ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}