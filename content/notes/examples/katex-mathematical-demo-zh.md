---
title: KaTeX 数学公式测试
date: "2026-06-18"
slug: katex-mathematical-demo-zh
tags:
  - Markdown
  - KaTeX
  - 数学公式
summary: 测试 daybook 对 KaTeX 数学公式、align 环境、矩阵、希腊字母和常用数学符号的渲染支持。
draft: false
math: true
---

KaTeX 是一个跨浏览器的 JavaScript 库，可在网页浏览器中渲染数学公式。其设计以快速和易用为核心，最初由可汗学院开发，后成为 GitHub 上最热门的五大项目之一。

## 群论

Burnside 引理，有时也称为 Burnside 计数定理、Cauchy-Frobenius 引理或轨道计数定理。

设 $\wedge$ 是有限群 $G$ 在有限集合 $X$ 上的群作用。那么作用的轨道数 $t$ 由下面的公式给出。

$$
t=\frac{1}{|G|}\sum_{g\in G}|\text{Fix}(g)|
$$

对于每个整数 $n\ge2$，商群 $\mathbb{Z}/n\mathbb{Z}$ 是由 $1+n\mathbb{Z}$ 生成的循环群，因此 $\mathbb{Z}/n\mathbb{Z}\cong\mathbb{Z}_n$。

商群 $\mathbb{R}/\mathbb{Z}$ 同构于 $([0,1),+_1)$，即区间 $[0,1)$ 上以 1 为模的实数加法群。

同构定理。设 $\phi\colon(G,\circ)\to(H,*)$ 是一个同态。那么函数

$$
\begin{aligned}
f\colon G/\text{Ker}(\phi)&\to\text{Im}(\phi)\\
x\text{Ker}(\phi)&\mapsto\phi(x)
\end{aligned}
$$

是一个同构，因此

$$
G/\text{Ker}(\phi)\cong \text{Im}(\phi)
$$

## 泰勒定理

设函数 $f$ 在包含点 $a$ 和 $x$ 的开区间上 $(n+1)$ 次可微。那么

$$
 f(x)=f(a)+f'(a)(x-a)+\cdots+\frac{f^{(n)}(a)}{n!}(x-a)^n+R_n(x)
$$

其中

$$
 R_n(x)=\frac{f^{(n+1)}(c)}{(n+1)!}(x-a)^{n+1},
$$

对于 $a$ 和 $x$ 之间的某个 $c$。

$\KaTeX$ 没有右对齐选项，因此使用额外的对齐列来显示方程编号。它们通过 mkern 间距（默认为 \mkern100mu）被推到右侧。align 和 align* 环境都可以使用，\tag 和 \notag 也可以使用。

## Align 环境

$$
\begin{align}
\frac{\pi}{4n^2} &= \frac{4^n(n!)^2}{2n^2(2n)!}n(2n-1)J_{n-1}-\frac{4^n(n!)^2}{2n^2(2n)!}2n^2J_n \tag{1} \\
&= \frac{4^n}{4(2n)!}\left(\frac{n!}{n}\right)^22n(2n-1)J_{n-1}-\frac{4^n(n!)^2}{(2n)!}J_n \tag{$\ddagger$} \\
&= \frac{4^{n-1}((n-1)!)^2}{(2n-2)!}J_{n-1}-\frac{4^n(n!)^2}{(2n)!}J_n \tag{2}
\end{align}
$$

## Align* 环境

$$
\begin{align}
\frac{4^N(N!)^2}{(2N)!}J_N &\leq \frac{4^N(N!)^2}{(2N)!}\frac{\pi^2}{4}\frac{1}{2n+2}I_{2N} \tag{*} \\
&= \frac{\pi^2}{8(N+1)}\frac{4^N(N!)^2}{(2N)!}I_{2N} \\
&= \frac{\pi^2}{8(N+1)}\frac{\pi}{2} \tag{**} \\
&= \frac{\pi^3}{16(N+1)} \\
\frac{x}{\sin x} &\leq \frac{\pi}{2} \tag{3} \\
\text{所以} \qquad\qquad x &\leq \frac{\pi}{2}\sin x \tag{4}
\end{align}
$$

## 级数求和

$$
\begin{align*}
\sum_{i=1}^{k+1}i &= \left(\sum_{i=1}^{k}i\right) +(k+1) \tag{1} \\
&= \frac{k(k+1)}{2}+k+1 \tag{2} \\
&= \frac{k(k+1)+2(k+1)}{2} \tag{3} \\
&= \frac{(k+1)(k+2)}{2} \tag{4} \\
&= \frac{(k+1)((k+1)+1)}{2} \tag{5}
\end{align*}
$$

## 乘积符号

$$
1 + \frac{q^2}{(1-q)}+\frac{q^6}{(1-q)(1-q^2)}+\cdots
= \prod_{j=0}^{\infty}\frac{1}{(1-q^{5j+2})(1-q^{5j+3})},
\text{ 对于 }\lvert q\rvert < 1.
$$

## 叉积

$$
\mathbf{V}_1 \times \mathbf{V}_2 = \begin{vmatrix}
\mathbf{i} & \mathbf{j} & \mathbf{k} \\[1ex]
\frac{\partial X}{\partial u} & \frac{\partial Y}{\partial u} & 0 \\[2.5ex]
\frac{\partial X}{\partial v} & \frac{\partial Y}{\partial v} & 0
\end{vmatrix}
$$

## 麦克斯韦方程组

$$
\begin{align*}
\nabla \times \vec{\mathbf{B}} -\, \frac1c\, \frac{\partial\vec{\mathbf{E}}}{\partial t} &= \frac{4\pi}{c}\vec{\mathbf{j}} \\
\nabla \cdot \vec{\mathbf{E}} &= 4 \pi \rho \\
\nabla \times \vec{\mathbf{E}}\, +\, \frac1c\, \frac{\partial\vec{\mathbf{B}}}{\partial t} &= \vec{\mathbf{0}} \\
\nabla \cdot \vec{\mathbf{B}} &= 0
\end{align*}
$$

## 希腊字母

$$
\begin{align*}
&\Gamma\ \Delta\ \Theta\ \Lambda\ \Xi\ \Pi\ \Sigma\ \Upsilon\ \Phi\ \Psi\ \Omega\\
&\alpha\ \beta\ \gamma\ \delta\ \epsilon\ \zeta\ \eta\ \theta\ \iota\ \kappa\ \lambda\ \mu\ \nu\ \xi\ \omicron\ \pi\ \rho\ \sigma\ \tau\ \upsilon\ \phi\ \chi\ \psi\ \omega\ \varepsilon\ \vartheta\ \varpi\ \varrho\ \varsigma\ \varphi
\end{align*}
$$

## 箭头符号

$$
\begin{align*}
&\gets\ \to\ \leftarrow\ \rightarrow\ \uparrow\ \Uparrow\ \downarrow\ \Downarrow\ \updownarrow\ \Updownarrow\\
&\Leftarrow\ \Rightarrow\ \leftrightarrow\ \Leftrightarrow\ \mapsto\ \hookleftarrow\\
&\leftharpoonup\ \leftharpoondown\ \rightleftharpoons\ \longleftarrow\ \Longleftarrow\ \longrightarrow\\
&\Longrightarrow\ \longleftrightarrow\ \Longleftrightarrow\ \longmapsto\ \hookrightarrow\ \rightharpoonup\\
&\rightharpoondown\ \leadsto\ \nearrow\ \searrow\ \swarrow\ \nwarrow
\end{align*}
$$

## 符号

$$
\begin{align*}
&\surd\ \barwedge\ \veebar\ \odot\ \oplus\ \otimes\ \oslash\ \circledcirc\ \boxdot\ \bigtriangleup\\
&\bigtriangledown\ \dagger\ \diamond\ \star\ \triangleleft\ \triangleright\ \angle\ \infty\ \prime\ \triangle
\end{align*}
$$

*示例取自 [KaTeX Live Demo](https://sixthform.info/katex/examples/demo.html)*
