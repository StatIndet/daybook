---
title: Markdown Extended Syntax Test Page
date: 2026-06-16
pin: true
tags:
  - Markdown
  - Test
summary: Used to test the rendering of Daybook’s extended Markdown syntax, embedded components, Lightbox, Mermaid, and nested task lists.
draft: false
toc: true
i18n_key: markdown-extended-demo
lang: en
---
This article introduces extended Markdown features, including syntax examples and rendered previews.

_Examples are taken from [Retypeset](https://retypeset.radishzz.cc/en/posts/markdown-extended-features/)._

## Figure Captions

To create automatic figure captions, use the standard Markdown image syntax `![alt](src)`. To hide the caption, add an underscore `_` before the `alt` text or leave the `alt` text empty.

### Syntax

```
![Image description](https://image.radishzz.cc/image/gallery/06.webp)

![_Image description](https://image.radishzz.cc/image/gallery/06.webp)
```

### Output

![Image description](https://image.radishzz.cc/image/gallery/06.webp)

![_Image description](https://image.radishzz.cc/image/gallery/06.webp)

## Admonition Blocks

To create admonition blocks, use the GitHub syntax `> [!TYPE]` or the container directive `:::type`. The following types are supported: `note`, `tip`, `important`, `warning`, and `caution`.

### Syntax

```
> [!NOTE]
> Useful information that users should know, even when skimming content.

> [!TIP]
> Helpful advice for doing things better or more easily.

> [!IMPORTANT]
> Key information users need to know to achieve their goal.

:::warning
Urgent info that needs immediate user attention to avoid problems.
:::

:::caution
Advises about risks or negative outcomes of certain actions.
:::

:::note[YOUR CUSTOM TITLE]
This is a note with a custom title.
:::
```

### Output

> [!NOTE]
> Useful information that users should know, even when skimming content.

> [!TIP]
> Helpful advice for doing things better or more easily.

> [!IMPORTANT]
> Key information users need to know to achieve their goal.

:::warning
Urgent info that needs immediate user attention to avoid problems.
:::

:::caution
Advises about risks or negative outcomes of certain actions.
:::

:::note[YOUR CUSTOM TITLE]
This is a note with a custom title.
:::

## Collapsible Sections

To create collapsible sections, use the container directive syntax `:::fold[title]`. Click the title to expand or collapse.

### Syntax

```
:::fold[Usage Tips]
Content that may not interest all readers can be placed in a collapsible section.
:::
```

### Output

:::fold[Usage Tips]
Content that may not interest all readers can be placed in a collapsible section.
:::

## Mermaid Diagrams

To create Mermaid diagrams, wrap Mermaid syntax in code blocks and specify the language type as `mermaid`.

### Syntax

``````
```mermaid
graph TD;
    A-->B;
    A-->C;
    B-->D;
    C-->D;
```
``````

### Output

```mermaid
graph TD;
    A-->B;
    A-->C;
    B-->D;
    C-->D;
```

## Galleries

To create image galleries, use the container directive `:::gallery`. Scroll horizontally to view more images.

### Syntax

```
:::gallery
![Alpaca](https://image.radishzz.cc/image/gallery/sheep-1.jpg)
![Turning head](https://image.radishzz.cc/image/gallery/sheep-2.jpg)
![Eye contact](https://image.radishzz.cc/image/gallery/sheep-3.jpg)
![Baby alpaca](https://image.radishzz.cc/image/gallery/sheep-4.jpg)
![Aww, so cute!](https://image.radishzz.cc/image/gallery/sheep-5.jpg)
:::
```

### Output

:::gallery
![Alpaca](https://image.radishzz.cc/image/gallery/sheep-1.jpg)
![Turning head](https://image.radishzz.cc/image/gallery/sheep-2.jpg)
![Eye contact](https://image.radishzz.cc/image/gallery/sheep-3.jpg)
![Baby alpaca](https://image.radishzz.cc/image/gallery/sheep-4.jpg)
![Aww, so cute!](https://image.radishzz.cc/image/gallery/sheep-5.jpg)
:::

## GitHub Repositories

To embed GitHub repositories, use the leaf directive `::github{repo="owner/repo"}`.

### Syntax

```
::github{repo="radishzzz/astro-theme-retypeset"}
```

### Output

::github{repo="radishzzz/astro-theme-retypeset"}

## Videos

To embed videos, use the leaf directive `::youtube{id="video-id"}`.

### Syntax

```
::youtube{id="9pP0pIgP2kE"}

::bilibili{id="BV1sK4y1Z7KG"}
```

### Output

::youtube{id="9pP0pIgP2kE"}

::bilibili{id="BV1sK4y1Z7KG"}

## Spotify

To embed Spotify content, use the leaf directive `::spotify{url="spotify-url"}`.

### Syntax

```
::spotify{url="https://open.spotify.com/track/0HYAsQwJIO6FLqpyTeD3l6"}

::spotify{url="https://open.spotify.com/album/03QiFOKDh6xMiSTkOnsmMG"}
```

### Output

::spotify{url="https://open.spotify.com/track/0HYAsQwJIO6FLqpyTeD3l6"}

::spotify{url="https://open.spotify.com/album/03QiFOKDh6xMiSTkOnsmMG"}

## Tweets

To embed tweets, use the leaf directive `::tweet{url="tweet-url"}`.

### Syntax

```
::tweet{url="https://x.com/hachi_08/status/1906456524337123549"}
```

### Output

::tweet{url="https://x.com/hachi_08/status/1906456524337123549"}

## CodePen

To embed CodePen demos, use the leaf directive `::codepen{url="codepen-url"}`.

### Syntax

```
::codepen{url="https://codepen.io/jh3y/pen/NWdNMBJ"}
```

### Output

::codepen{url="https://codepen.io/jh3y/pen/NWdNMBJ"}

## Daybook Music Player

Use the double-colon syntax `::music{url="https://example.com/audio.flac"}` to embed a seamless music player. Daybook will automatically parse the FLAC metadata.

### Syntax

```
::music{https://static.daybook.page/music/1406633327.flac}
```

### Preview

_(Autoplay is disabled for this demo card.)_

## Unordered List

- First-level unordered list
    
    - Second-level unordered list
        
        - Third-level unordered list
            

## Ordered List

1. First-level ordered list
    
    1. Second-level ordered list
        
        1. Third-level ordered list
            

## Nested Task List

-  First-level task
    
    -  Second-level task
        
        -  Third-level task
            
-  Completed task
