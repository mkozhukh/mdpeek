import { marked } from "marked";
import { markedHighlight } from "marked-highlight";
import hljs from "highlight.js";

marked.use(
  markedHighlight({
    langPrefix: "hljs language-",
    highlight(code, lang) {
      if (lang === "mermaid") return code;
      const language = hljs.getLanguage(lang) ? lang : "plaintext";
      return hljs.highlight(code, { language }).value;
    },
  })
);

const renderer = {
  code({ text, lang }) {
    if (lang === "mermaid") {
      return `<pre class="mermaid">${text}</pre>`;
    }
    return false; // fall back to default
  },
};

marked.use({ renderer });

export function renderMarkdown(mdString) {
  return marked.parse(mdString);
}
