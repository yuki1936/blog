import rss from "@astrojs/rss";
import { experimental_AstroContainer } from "astro/container";
import type { APIContext } from "astro";
import { getCollection, render } from "astro:content";
import {
  getArticleCategory,
  getArticleSlug,
  sortArticles,
} from "../lib/articles";

export async function GET(context: APIContext) {
  const site = context.site ?? new URL("https://yuki1936.com");
  const articles = sortArticles(
    await getCollection("articles", ({ data }) => !data.draft),
  );

  // 用 Astro Container 把每篇文章渲染成完整 HTML，作为全文输出。
  const container = await experimental_AstroContainer.create();
  const items = await Promise.all(
    articles.map(async (article) => {
      const { Content } = await render(article);
      let html = await container.renderToString(Content);
      // 订阅器里相对路径会失效，全部补成绝对地址。
      html = html.replace(/(src|href)="\/([^"]*)"/g, `$1="${site.toString()}$2"`);
      return {
        title: article.data.title,
        description: article.data.description,
        pubDate: article.data.published,
        link: `/articles/${getArticleSlug(article)}/`,
        categories: [getArticleCategory(article)],
        content: html,
      };
    }),
  );

  return rss({
    title: "neri",
    description: "yuki1936 的文章、回忆与日常工具。",
    site,
    items,
    customData: "<language>zh-CN</language>",
  });
}
