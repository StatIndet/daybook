---
title: "【测试页面】字体迁移测试"
date: "2026-06-23"
slug: "typography-test"
tags: ["测试", "字体"]
summary: "这是一篇用于人工检查霞鹜文楷与 Maple Mono CN 实际排版与渲染效果的测试笔记。"
draft: false
---

这篇笔记用于人工检查 **霞鹜文楷 (LXGW WenKai)** 与 **Maple Mono CN** 的实际渲染效果。由于系统目前对于 Draft 状态的笔记会完全忽略无法预览，因此本笔记设为发布状态。测试完毕后可随时删除。

## 1. 普通正文与混排测试

这是普通的中文段落，主要用于测试正文是否成功应用了霞鹜文楷。这款字体应当呈现出优美的楷体书写特征，为博客带来更好的中文阅读体验。

接下来是中英文混排段落。我们测试一下 English words and numbers like 12345 in the middle of Chinese sentences，以及一些常见的全角标点符号：比如“双引号”、（括号）和——破折号、……省略号，看看标点挤压和中英文字距是否看起来舒适自然。

## 2. 字体样式测试

这里测试基本的 Markdown 文本样式。目前我们只引入了 Regular 字重，所以这里的效果应该是浏览器通过算法**合成**（Faux Bold / Faux Italic）的：
* 这是**加粗的霞鹜文楷文本**。
* 这是*斜体的霞鹜文楷文本*。
* 这是***加粗斜体的霞鹜文楷文本***。

## 3. 引用块测试

以下是一个引用块，用于确认普通引用仍然使用霞鹜文楷，而不会变成等宽字体：

> 这里是一段普通的引用文字。
> 落霞与孤鹜齐飞，秋水共长天一色。
> 
> 在引用块中也可以嵌套代码，例如行内代码 `console.log("Hello")`，或者代码块：
> ```javascript
> // 引用内的代码块也应当使用 Maple Mono CN
> const arrow = (x) => x * 2;
> ```

>```
> all class
> ultra suffix
>```

> `all class , ultra suffix`

## 4. 行内代码与代码块测试

正文中的行内代码示例：`const value = a !== b && user?.name`。行内代码应当使用 Maple Mono CN，并且由于我们开启了连字特性，`!==` 和 `?.` 可能会渲染为紧凑的形式。

`all class . ultra suffix`

### JavaScript / TypeScript 连字测试

```typescript
// Maple Mono CN 连字特性测试
function evaluateConditions(a: number, b: number, user: any) {
  // 比较运算符
  if (a == b || a === b) return;
  if (a != b && a !== b) return;
  if (a <= b || a >= b) return;

  // 逻辑与可选链
  const valid = user?.profile ?? null;
  const isActive = (valid !== null) && (a > 0 || b < 0);

  // 箭头函数
  const process = (x: number) => {
    return x * 2;
  };
  
  // HTML/XML 闭合与特殊组合
  // <!-- 这是一段注释 -->
  // </tag>

  return process(a) -> result;
}
```

### Go 代码块测试 (Chroma 高亮)

```go
package main

import "fmt"

func main() {
    // 这是一个 Go 语言代码块，用于测试 Chroma 的语法高亮
    message := "Daybook Typography Test"
    
    for i := 0; i < 3; i++ {
        if i != 1 {
            fmt.Printf("%s: %d\n", message, i)
        }
    }
}
```

### 英文样张

在等宽环境下，以下是一组英文字母样张：
```text
all class ultra suffix italic calt ligature
0123456789 O0 Il1
```

## 5. 表格与列表测试

### Markdown 表格

| 字体用途 | 使用字体 | 回退字体 (Fallback) |
| :--- | :--- | :--- |
| 普通正文 | 霞鹜文楷 | PingFang SC |
| UI 元素 | 霞鹜文楷 | PingFang SC |
| 代码块与等宽 | Maple Mono CN | Maple Mono |

### 各类列表

**无序列表：**
* 第一项测试
* 第二项测试包含 `inline code`
* 第三项测试

**有序列表：**
1. 第一步
2. 第二步
3. 第三步

**任务列表：**
- [x] 完成字体切片与复制
- [x] 更新全局 CSS Token 变量
- [ ] 人工检查当前页面的渲染效果

---

**测试说明（请人工核对）：**
1. 普通正文、引用、列表、表格应使用 **霞鹜文楷**。
2. 行内代码、代码块、Chroma 高亮应使用 **Maple Mono CN**。
3. `liga` / `calt` 连字效果（如 `=>`, `!==`）只应该在代码/等宽区域生效，不应该影响整篇正文。
4. 页面左侧的 Slogan（中文草书）、昵称（英文草书）、Logo 签名、以及侧边栏的 Material Symbols 图标不属于本测试页面范围，应保持原有字体不受影响。
