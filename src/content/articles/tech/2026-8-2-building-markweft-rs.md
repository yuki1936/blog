---
title: 用 Rust 实现一个基于通用 AST 的标记语言转换器
description: markweft-rs 的设计与实现：通过通用文档 AST 在 Markdown、HTML、Typst 和 LaTeX 之间转换。
published: 2026-08-02
draft: false
---

前段时间我想给自己的静态博客加一个格式转换工具。需求不算复杂：在 Markdown、HTML、Typst 和 LaTeX 之间转换，整个过程留在浏览器里，不上传文件，也不依赖后端。

一开始我以为这只是给几个现成的 parser 和 renderer 接一层接口。真正开始写以后，麻烦的地方并不是“怎么把标题变成 `#` 或 `\section`”，而是这四种语言能表达的东西并不一样。Markdown 比较克制，HTML 什么都能塞，Typst 和 LaTeX 又各自带有可编程能力。所谓“互相转换”，稍不注意就会变成一堆只对示例有效的字符串替换。

最后做出来的东西叫 [markweft-rs](https://github.com/yuki1936/markweft-rs)。它现在既可以作为 Rust 库和 CLI 使用，也能编译成 WebAssembly，跑在博客的[工具页面](/tools/markup-converter/)里。

## 先把转换路径收起来

四种格式两两直转，一共有 12 条有方向的路径。如果分别去写，大概会变成这样：

```text
Markdown -> HTML
Markdown -> Typst
Markdown -> LaTeX
HTML -> Markdown
HTML -> Typst
...
```

这里已经能看出问题了。同一套列表逻辑可能要写三遍，增加一种新格式时又要继续补转换组合。更麻烦的是，每条路径很可能慢慢长出自己的特殊规则，最后同一段内容经过不同路径会得到不同结果。

所以我在所有格式中间放了一层通用文档 AST。输入先被解析成统一结构，再由目标格式的 renderer 输出：

```text
Markdown ─┐
HTML ─────┼─> Document AST ─┬─> Markdown
Typst ────┤                 ├─> HTML
LaTeX ────┘                 ├─> Typst
                            └─> LaTeX
```

转换入口因此很短，真正的工作都在 parser 和 renderer 里：

```rust
pub fn convert(source: &str, from: Format, to: Format) -> std::io::Result<String> {
    Ok(render_document(&parse_document(source, from)?, to))
}
```

这层 AST 还有一个额外的好处：库的使用者可以在解析和渲染之间修改文档。例如批量改链接、调整标题层级，或者过滤某些节点，不必再碰原始字符串。

## AST 不需要假装无所不能

我最初列了不少节点，后来又删掉了一些过于具体的东西。这个 AST 的目标不是完整描述四种语言，而是表达它们之间比较稳定的交集。

块级结构包括标题、段落、引用、列表、代码块、表格和数学公式；行内结构包括文本、强调、链接、图片和行内代码。大致是下面这样：

```rust
pub struct Document {
    pub blocks: Vec<Block>,
}

pub enum Block {
    Heading { level: u8, content: Vec<Inline>, /* ... */ },
    Paragraph(Vec<Inline>),
    BlockQuote(Vec<Block>),
    CodeBlock { language: Option<String>, code: String },
    List { ordered: bool, start: u64, items: Vec<ListItem> },
    Table { /* ... */ },
    Math { source: String, format: Format },
    Raw { format: Format, content: String },
}
```

其中我最在意的其实是 `Raw`。

任意 LaTeX 宏或 Typst 函数都不可能靠一个小型转换器正确理解。如果解析不了就跳过，输出看起来可能很整洁，内容却已经丢了，而且用户未必会立刻发现。与其生成这种“像是成功了”的结果，我更愿意把未知结构连同来源格式一起放进 `Raw` 节点。

渲染回原格式时，它可以直接写回去；渲染到别的格式时，则会变成代码块、Typst 的 `raw` 或 LaTeX 的 `verbatim`。结果未必漂亮，但至少能明确告诉我：这一块没有被转换，而不是已经消失了。

## 几种输入并没有共用一种解析方式

AST 是统一的，解析过程却没必要强行统一。四种格式有各自成熟的工具，选合适的接口比自己造 parser 实际得多。

### Markdown

Markdown 使用 `pulldown-cmark`。它产生的是 `Start`、`End`、`Text` 等事件流，不是可以直接遍历的文档树。我把事件先收集起来，再用一个带位置的 `Cursor` 消费它们：

```rust
struct Cursor<'a> {
    events: Vec<Event<'a>>,
    index: usize,
}

impl<'a> Cursor<'a> {
    fn blocks(&mut self, stop: Option<TagEnd>) -> Vec<Block> {
        // 读取块级节点，遇到 stop 后回到上一层
    }

    fn inlines(&mut self, stop: TagEnd) -> Vec<Inline> {
        // 处理强调、链接、图片等行内节点
    }
}
```

列表、引用和脚注都允许嵌套，这种写法刚好可以递归处理。任务列表稍微别扭一点，复选框会作为列表段落中的独立事件出现，所以列表项解析完成后还要把它取出来，放进 `ListItem.checked`。

我开启了 `pulldown-cmark` 里常用的 CommonMark 和 GFM 扩展，包括表格、任务列表、脚注、删除线、数学公式、定义列表和标题属性。这样 Markdown 一侧基本能覆盖通用 AST 里的结构。

### HTML

HTML 没有直接写一套 DOM 到 AST 的遍历。我先用 `htmd` 的 faithful 模式将 HTML 转成 Markdown，再进入刚才那套 Markdown parser。

```rust
HtmlToMarkdown::builder()
    .options(HtmlOptions {
        translation_mode: TranslationMode::Faithful,
        ..Default::default()
    })
    .scripting_enabled(false)
    .build()
```

这算是项目里比较务实的一条捷径。标题、列表、链接等常见元素已经有成熟的转换规则；Markdown 无法表示的标签和属性则会以内嵌 HTML 保留，随后进入 `Raw`。我不需要再实现一遍 HTML 的边界处理。

HTML renderer 也走了相似的路线：先把 AST 渲染成 Markdown，再交给 `pulldown-cmark` 生成 HTML。它不是最纯粹的结构，但能让 Markdown 和 HTML 两侧的行为保持一致，目前也足够稳定。

### Typst 和 LaTeX

Typst 直接使用官方的 `typst-syntax`。它能给出 `Heading`、`ListItem`、`Equation`、`Strong` 等明确的表达式，映射到 AST 比较直接。遇到我没有处理的表达式，就取出原始文本保存为 `Raw`：

```rust
match expr {
    Expr::Heading(heading) => { /* Block::Heading */ }
    Expr::ListItem(item) => { /* Block::List */ }
    Expr::Equation(equation) if equation.block() => { /* Block::Math */ }
    Expr::Strong(value) => { /* Inline::Strong */ }
    other => Inline::Raw {
        format: Format::Typst,
        content: other.to_untyped().full_text().to_string(),
    },
}
```

LaTeX 使用 `tree-sitter` 和 `codebook-tree-sitter-latex`。目前会识别章节、段落、列表、引用、常见代码环境、链接、图片和公式。像 `itemize`、`enumerate`、`quote`、`verbatim` 这些环境可以映射到对应节点，其他宏和环境仍然保留原文。

LaTeX parser 有个细节让我排查了一阵：不能只遍历 tree-sitter 的命名节点。普通文本有时位于两个子节点之间，只看节点会莫名其妙地少字或少空格。现在解析行内内容时会同时记录字节位置，把节点间的文本切片补回 `Inline::Text`，最后再合并相邻的文本节点。

## Renderer 里都是不起眼的小问题

从 AST 输出目标格式，本质上是一个很大的 `match`，但写起来并没有解析器那么轻松。

首先是转义。同一个字符串到了 Markdown，需要考虑 `*`、反引号和方括号；到了 Typst，要处理 `#`、`$` 和反斜杠；LaTeX 还多了 `%`、`&`、`_` 和花括号。三个 renderer 各自有一套转义函数，不能先做一次通用 escape 再到处复用。

代码围栏也不能永远写三个反引号。如果代码内容本身包含三个反引号，生成的 Markdown 会提前闭合。我的做法是先找出内容中最长的连续反引号，再使用比它长一位的围栏。行内代码也采用相同思路。

数学公式没有做所谓的自动翻译。Typst math 和 LaTeX math 不是换几个符号就能互转，所以 `Math` 节点会记录自己的来源格式。同源输出时直接写回，跨格式时先作为原始内容保留。这里如果强行转换，通常只是制造一个更难发现的错误。

## CLI 尽量少让人填写参数

既然输入和输出通常都有文件名，我不想每次都写一长串 `--from` 和 `--to`。最常见的调用只需要这样：

```bash
markweft-rs README.md -o README.html
markweft-rs report.typ -o report.tex
```

程序优先从扩展名识别格式。输入来自 stdin 或扩展名未知时，再检查开头的 HTML 标签、LaTeX 命令和 Typst 标题等特征。纯文本对四种格式来说都合法，没有足够特征时就回退到 Markdown。判断错了仍然可以用 `--from` 覆盖。

CLI 也支持普通的 Unix 管道：

```bash
printf '# Hello\n' | markweft-rs --tohtml
markweft-rs --tomarkdown < page.html > page.md
```

HTML 默认输出片段，方便继续交给其他程序。真的需要完整页面时，再用 `--full-document` 和 `--title` 包一层 HTML5 文档。

## 把 Rust 放进静态页面

最初的网页工具没有后端，因此最后还是要把核心库编译成 WebAssembly。

我把 Cargo feature 分成了 `cli` 和 `wasm`。默认构建带 `clap`，Wasm 构建关闭默认 feature，只保留库本身和 `wasm-bindgen`。浏览器接口只有转换和格式识别两个函数：

```rust
#[wasm_bindgen(js_name = convertDocument)]
pub fn convert_document(source: &str, from: &str, to: &str) -> Result<String, JsValue> {
    let from = parse_format(from)?;
    let to = parse_format(to)?;
    convert(source, from, to).map_err(|error| JsValue::from_str(&error.to_string()))
}
```

这一段接口没花多少时间，真正卡住我的是 LaTeX grammar 里的 C 代码。普通 Rust 构建一切正常，换成 `wasm32-unknown-unknown` 后，C 编译器开始找不到标准头文件。最后我升级了 tree-sitter，并在构建脚本里找到 `tree-sitter-language` 自带的 Wasm include 目录，通过 `CFLAGS_wasm32_unknown_unknown` 传给编译器，才把整个 parser 一起编进 Wasm。

生成的 Wasm 原始大小大约 5.2 MB，gzip 后在 700 KB 左右，不算特别轻。因此网页不会在首页加载它，只有打开转换工具时才会由 Web Worker 异步载入。转换也放在 Worker 内执行，输入稍长时不会卡住主线程。

## 测试，以及它还做不到的事

这类转换器很容易出现“演示用例是好的，换个方向就坏了”的情况。除了分别测试标题、列表、表格、公式和 `Raw` 节点，我还让测试遍历了四种格式的完整转换矩阵，至少保证每个 parser 和 renderer 都接进了同一条链路。

CLI 测试会真正启动编译出的二进制，检查 stdin、stdout、扩展名推断、文件输出和错误参数。网页端另外用 Playwright 跑四条代表性路径：

```text
Markdown -> HTML
HTML -> Markdown
Typst -> LaTeX
LaTeX -> Typst
```

当然，这些测试不代表任意文档都能无损转换。markweft-rs 目前处理的是常用文档结构，不会执行 Typst 代码，也不会展开 LaTeX 宏。复杂表格、交叉引用、参考文献以及不同数学语法之间的转换都还有明显限制。

不过通用 AST 至少让后续工作变得可控。增加一种节点时，我只需要完善相关 parser 和 renderer，不用重新修改十几条格式组合。回头看，这个项目里最重要的选择也不是用了哪个解析库，而是确定了转换的边界：能理解的内容进入结构化 AST，暂时不能理解的内容就老实保留。相比输出一份看起来很完整、实际已经少了东西的文档，我更能接受后者。
